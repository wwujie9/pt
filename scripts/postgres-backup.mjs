import { closeSync, mkdirSync, openSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const databaseUrl = requiredEnv("DATABASE_URL");
const backupDir = resolve(process.env.PG_BACKUP_DIR || "storage/postgres-backups");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = resolve(backupDir, `${stamp}-pt-resource-hub.dump`);
const startedAt = Date.now();

mkdirSync(backupDir, { recursive: true });

const args = ["--format=custom", "--no-owner", "--no-acl", databaseUrl];
const output = openSync(file, "w");
const result = commandExists("pg_dump")
  ? spawnSync("pg_dump", args, { stdio: ["ignore", output, "inherit"] })
  : spawnSync("docker", ["exec", postgresContainer(), "pg_dump", ...args], { stdio: ["ignore", output, "inherit"] });
closeSync(output);

if (result.status !== 0) {
  throw new Error("pg_dump 执行失败，请确认已安装 PostgreSQL client");
}

const payload = { ok: true, file, durationMs: Date.now() - startedAt };

if (process.env.BACKUP_ARCHIVE === "1") {
  const archive = spawnSync(process.execPath, ["scripts/archive-backup.mjs"], {
    stdio: "inherit",
    env: { ...process.env, BACKUP_FILE: file },
  });
  if (archive.status !== 0) throw new Error("备份归档失败");
  payload.archived = true;
}

console.log(JSON.stringify(payload, null, 2));

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量：${name}`);
  return value;
}

function commandExists(command) {
  const probe = spawnSync(command, ["--version"], { stdio: "ignore" });
  return probe.status === 0;
}

function postgresContainer() {
  return process.env.POSTGRES_CONTAINER || "pt-postgres";
}
