import { createHash, createHmac } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const backupFile = resolve(process.env.BACKUP_FILE || latestBackupFile());
const provider = process.env.OBJECT_STORAGE_PROVIDER || "file";
const key = objectKey(backupFile);

if (!existsSync(backupFile)) throw new Error(`备份文件不存在：${backupFile}`);

if (provider === "file") {
  const archiveDir = resolve(process.env.OBJECT_ARCHIVE_DIR || "storage/object-archive");
  mkdirSync(archiveDir, { recursive: true });
  const target = resolve(archiveDir, key.replace(/[\\/]/g, "_"));
  copyFileSync(backupFile, target);
  console.log(JSON.stringify({ ok: true, provider, file: backupFile, target, bytes: statSync(target).size }, null, 2));
} else if (provider === "s3") {
  await putS3Object(backupFile, key);
} else {
  throw new Error(`不支持的对象存储 provider：${provider}`);
}

function latestBackupFile() {
  const backupDir = resolve(process.env.PG_BACKUP_DIR || "storage/postgres-backups");
  const files = readdirSync(backupDir)
    .filter((file) => file.endsWith(".dump"))
    .map((file) => resolve(backupDir, file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!files.length) throw new Error(`没有找到 PostgreSQL 备份文件：${backupDir}`);
  return files[0];
}

function objectKey(file) {
  const prefix = (process.env.S3_PREFIX || "pt-resource-hub/postgres").replace(/^\/|\/$/g, "");
  return `${prefix}/${basename(file)}`;
}

async function putS3Object(file, nextKey) {
  const endpoint = requiredEnv("S3_ENDPOINT").replace(/\/$/g, "");
  const bucket = requiredEnv("S3_BUCKET");
  const region = process.env.S3_REGION || "auto";
  const accessKey = requiredEnv("S3_ACCESS_KEY_ID");
  const secretKey = requiredEnv("S3_SECRET_ACCESS_KEY");
  const body = readFileSync(file);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const encodedKey = nextKey.split("/").map(encodeURIComponent).join("/");
  const host = new URL(endpoint).host;
  const path = `/${bucket}/${encodedKey}`;
  const payloadHash = sha256Hex(body);
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    "PUT",
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), region), "s3"), "aws4_request");
  const signature = hmacHex(signingKey, stringToSign);
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`${endpoint}${path}`, {
    method: "PUT",
    headers: {
      authorization,
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      "content-type": "application/octet-stream",
      "content-length": String(body.length),
    },
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`对象存储归档失败：HTTP ${response.status} ${text}`);
  console.log(JSON.stringify({ ok: true, provider, file, bucket, key: nextKey, bytes: body.length }, null, 2));
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量：${name}`);
  return value;
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key, value) {
  return createHmac("sha256", key).update(value).digest("hex");
}
