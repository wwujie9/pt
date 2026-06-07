import { getStats } from "./catalog.js";
import { listSources, testSource } from "./sources.js";
import { appendSyncLog } from "./store.js";
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

let schedulerStarted = false;

export function startScheduler() {
  if (schedulerStarted || process.env.ENABLE_SCHEDULER !== "1") return;
  schedulerStarted = true;
  const intervalMs = Number(process.env.SCHEDULER_INTERVAL_MS || 15 * 60 * 1000);
  setInterval(() => {
    runHealthJob().catch(() => null);
    runBackupJob().catch(() => null);
  }, intervalMs).unref();
  runHealthJob().catch(() => null);
  runBackupJob().catch(() => null);
}

export async function runHealthJob() {
  const sources = await listSources();
  const results = [];
  for (const source of sources) {
    if (!source.enabled) continue;
    try {
      results.push({
        sourceId: source.id,
        ...(await testSource(source.id)),
      });
    } catch (error) {
      results.push({
        sourceId: source.id,
        ok: false,
        message: error.message,
      });
    }
  }
  await appendSyncLog({
    type: "source-health-check",
    status: results.some((item) => !item.ok) ? "partial" : "success",
    sourceCount: results.length,
    importedCount: 0,
    errors: results.filter((item) => !item.ok),
    results,
  });
  return {
    stats: await getStats(),
    results,
  };
}

export async function runBackupJob() {
  const backupDir = resolve(process.env.BACKUP_DIR || "storage/backups");
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const copied = [];
  for (const file of ["app.db", "app.db-wal", "app.db-shm"]) {
    const source = resolve("storage", file);
    if (!existsSync(source)) continue;
    const target = resolve(backupDir, `${stamp}-${file}`);
    await copyFile(source, target);
    copied.push(target);
  }
  await appendSyncLog({
    type: "database-backup",
    status: copied.length ? "success" : "skipped",
    sourceCount: 0,
    importedCount: copied.length,
    errors: [],
    copied,
  });
  return { copied };
}
