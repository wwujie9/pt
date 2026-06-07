import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";

const dryRun = process.env.BACKUP_LIFECYCLE_DRY_RUN === "1";
const minKeep = envNumber("BACKUP_MIN_KEEP", 3);
const localRetentionDays = envNumber("BACKUP_RETENTION_DAYS", 30);
const objectRetentionDays = envNumber("OBJECT_RETENTION_DAYS", localRetentionDays);

const targets = [
  {
    name: "postgres",
    dir: resolve(process.env.PG_BACKUP_DIR || "storage/postgres-backups"),
    retentionDays: localRetentionDays,
  },
  {
    name: "sqlite",
    dir: resolve(process.env.BACKUP_DIR || "storage/backups"),
    retentionDays: localRetentionDays,
  },
  {
    name: "object-file-archive",
    dir: resolve(process.env.OBJECT_ARCHIVE_DIR || "storage/object-archive"),
    retentionDays: objectRetentionDays,
  },
];

const results = targets.map(applyLifecycle);
const summary = {
  ok: true,
  dryRun,
  minKeep,
  generatedAt: new Date().toISOString(),
  results,
  notes: [
    "S3/R2/MinIO 的对象生命周期建议在 bucket 侧开启版本化、过期清理和不可变保留；本脚本负责本地与 file provider 归档目录。",
  ],
};

console.log(JSON.stringify(summary, null, 2));

function applyLifecycle(target) {
  const files = listFiles(target.dir);
  const newestFirst = files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const cutoffMs = Date.now() - target.retentionDays * 24 * 60 * 60 * 1000;
  const deleted = [];
  const kept = [];

  newestFirst.forEach((file, index) => {
    const keepByMinimum = index < minKeep;
    const expired = file.mtimeMs < cutoffMs;
    if (!keepByMinimum && expired) {
      if (!dryRun) rmSync(file.path, { force: true });
      deleted.push(file);
    } else {
      kept.push({ ...file, reason: keepByMinimum ? "min_keep" : "within_retention" });
    }
  });

  return {
    name: target.name,
    dir: target.dir,
    exists: existsSync(target.dir),
    retentionDays: target.retentionDays,
    scanned: files.length,
    deleted,
    kept,
  };
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => /\.(dump|db|db-wal|db-shm)$/i.test(entry.name))
    .map((entry) => {
      const path = resolve(dir, entry.name);
      const stats = statSync(path);
      return {
        path,
        bytes: stats.size,
        mtime: new Date(stats.mtimeMs).toISOString(),
        mtimeMs: stats.mtimeMs,
      };
    });
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}
