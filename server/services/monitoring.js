import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { getStats } from "./catalog.js";
import { db } from "./db.js";
import { notifyEvent } from "./notifications.js";

export async function collectMonitoringSnapshot() {
  return db.withRlsBypass(async () => {
    const checkedAt = new Date().toISOString();
    const metrics = {
      driver: db.driver,
      stats: await getStats("default"),
      tasks: await taskMetrics(),
      sources: await sourceHealthMetrics(),
      sync: await syncMetrics(),
      billing: await billingMetrics(),
      backup: backupMetrics(),
    };
    const alerts = buildAlerts(metrics);
    return {
      ok: alerts.length === 0,
      checkedAt,
      alerts,
      metrics,
    };
  });
}

export async function runMonitoringCheck() {
  const snapshot = await collectMonitoringSnapshot();
  if (!snapshot.ok && process.env.MONITORING_ALERTS === "1") {
    await notifyEvent({
      type: "monitoring.alert",
      severity: "warning",
      alerts: snapshot.alerts,
      metrics: snapshot.metrics,
    });
  }
  return snapshot;
}

async function taskMetrics() {
  const rows = await db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM tasks
    GROUP BY status
  `).all();
  return Object.fromEntries(rows.map((row) => [row.status, Number(row.count || 0)]));
}

async function sourceHealthMetrics() {
  const row = await db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN ok THEN 1 ELSE 0 END) AS ok_count,
      SUM(CASE WHEN ok THEN 0 ELSE 1 END) AS failed_count,
      MAX(checked_at) AS latest_checked_at
    FROM source_health
  `).get();
  return {
    total: Number(row?.total || 0),
    ok: Number(row?.ok_count || 0),
    failed: Number(row?.failed_count || 0),
    latestCheckedAt: row?.latest_checked_at || null,
  };
}

async function syncMetrics() {
  const row = await db.prepare(`
    SELECT created_at, status, type
    FROM sync_logs
    ORDER BY created_at DESC
    LIMIT 1
  `).get();
  return {
    latestType: row?.type || null,
    latestStatus: row?.status || null,
    latestAt: row?.created_at || null,
    latestAgeHours: ageHours(row?.created_at),
  };
}

async function billingMetrics() {
  const row = await db.prepare(`
    SELECT created_at, type, status
    FROM billing_events
    ORDER BY created_at DESC
    LIMIT 1
  `).get();
  return {
    latestType: row?.type || null,
    latestStatus: row?.status || null,
    latestAt: row?.created_at || null,
    latestAgeHours: ageHours(row?.created_at),
  };
}

function backupMetrics() {
  const dirs = [
    resolve(process.env.PG_BACKUP_DIR || "storage/postgres-backups"),
    resolve(process.env.BACKUP_DIR || "storage/backups"),
  ];
  const files = dirs.flatMap((dir) => listBackupFiles(dir));
  const latest = files.sort((a, b) => b.mtimeMs - a.mtimeMs)[0] || null;
  return {
    configuredDirs: dirs,
    fileCount: files.length,
    latestFile: latest?.file || null,
    latestAt: latest ? new Date(latest.mtimeMs).toISOString() : null,
    latestAgeHours: latest ? (Date.now() - latest.mtimeMs) / 3600000 : null,
  };
}

function listBackupFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => /\.(dump|db|db-wal|db-shm)$/i.test(file))
    .map((file) => {
      const path = resolve(dir, file);
      const stats = statSync(path);
      return { file: path, mtimeMs: stats.mtimeMs, bytes: stats.size };
    });
}

function buildAlerts(metrics) {
  const alerts = [];
  const failedTasks = Number(metrics.tasks.failed || metrics.tasks.error || 0);
  const queuedTasks = Number(metrics.tasks.queued || metrics.tasks.pending || 0);
  const backupAge = metrics.backup.latestAgeHours;
  const syncAge = metrics.sync.latestAgeHours;
  pushThresholdAlert(alerts, "tasks.failed", failedTasks, envNumber("ALERT_MAX_FAILED_TASKS", 0), "失败任务数量超过阈值");
  pushThresholdAlert(alerts, "tasks.queued", queuedTasks, envNumber("ALERT_MAX_QUEUED_TASKS", 100), "排队任务数量超过阈值");
  pushThresholdAlert(alerts, "sources.failed", Number(metrics.sources.failed || 0), envNumber("ALERT_MAX_FAILED_SOURCES", 0), "来源健康检查失败数量超过阈值");
  if (backupAge === null) {
    alerts.push({ metric: "backup.latestAgeHours", severity: "critical", message: "没有找到可用备份文件" });
  } else {
    pushThresholdAlert(alerts, "backup.latestAgeHours", backupAge, envNumber("ALERT_MAX_BACKUP_AGE_HOURS", 24), "最新备份超过允许时间");
  }
  if (syncAge !== null) {
    pushThresholdAlert(alerts, "sync.latestAgeHours", syncAge, envNumber("ALERT_MAX_SYNC_AGE_HOURS", 24), "最近同步超过允许时间");
  }
  return alerts;
}

function pushThresholdAlert(alerts, metric, value, threshold, message) {
  if (value <= threshold) return;
  alerts.push({
    metric,
    value,
    threshold,
    severity: "warning",
    message,
  });
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function ageHours(dateValue) {
  if (!dateValue) return null;
  const time = new Date(dateValue).getTime();
  if (!Number.isFinite(time)) return null;
  return (Date.now() - time) / 3600000;
}
