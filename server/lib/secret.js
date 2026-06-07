import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const algorithm = "aes-256-gcm";

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const next = hashPassword(password, salt).split(":")[1];
  const a = Buffer.from(hash);
  const b = Buffer.from(next);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function encryptSecret(value) {
  if (!value) return "";
  const key = getCredentialKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(value) {
  if (!value) return "";
  if (!String(value).startsWith("enc:v1:")) return value;
  const [, , ivText, tagText, encryptedText] = String(value).split(":");
  const decipher = createDecipheriv(algorithm, getCredentialKey(), Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskSecret(value) {
  if (!value) return "";
  const text = decryptSecret(value);
  if (text.length <= 6) return "***";
  return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

function getCredentialKey() {
  const seed = process.env.CREDENTIAL_SECRET || process.env.ADMIN_TOKEN || "pt-resource-hub-dev-secret";
  return createHash("sha256").update(seed).digest();
}
