import { db } from "./db.js";
import { encryptSecret, decryptSecret, maskSecret } from "../lib/secret.js";

export async function listDownloadClients(workspaceId = "default") {
  return (await db
    .prepare("SELECT payload FROM download_clients WHERE workspace_id = ? ORDER BY created_at DESC")
    .all(workspaceId))
    .map((row) => redact(JSON.parse(row.payload)));
}

export async function upsertDownloadClient(input, workspaceId = "default") {
  const client = normalize(input);
  const dbId = scopedKey(workspaceId, client.id);
  const current = await db.prepare("SELECT payload FROM download_clients WHERE id = ? AND workspace_id = ?").get(dbId, workspaceId);
  const payload = {
    ...(current ? parsePayload(current.payload) : {}),
    ...dropUndefined(client),
  };
  await db.prepare(`
    INSERT OR REPLACE INTO download_clients (id, workspace_id, type, enabled, payload, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM download_clients WHERE id = ?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
  `).run(dbId, workspaceId, payload.type, Boolean(payload.enabled), JSON.stringify(payload), dbId);
  return redact(payload);
}

export async function testDownloadClient(id, workspaceId = "default") {
  const row = await db.prepare("SELECT payload FROM download_clients WHERE id = ? AND workspace_id = ?").get(scopedKey(workspaceId, id), workspaceId);
  if (!row) throw new Error("下载器不存在");
  const client = hydrate(parsePayload(row.payload));
  if (!client.baseUrl) return { ok: false, message: "缺少下载器地址" };
  const response = await fetch(client.baseUrl, { method: "GET" }).catch((error) => ({ ok: false, status: 0, error }));
  return {
    ok: Boolean(response.ok),
    status: response.status || 0,
    message: response.ok ? "下载器可访问" : "下载器不可访问或需要认证",
  };
}

export async function enqueueDownloadTask(input, workspaceId = "default") {
  const clientId = String(input.clientId || "").trim();
  if (clientId) {
    const client = await db.prepare("SELECT enabled FROM download_clients WHERE id = ? AND workspace_id = ?").get(scopedKey(workspaceId, clientId), workspaceId);
    if (!client) throw new Error("下载器不存在");
    if (!client.enabled) throw new Error("下载器未启用");
  }
  const resourceId = String(input.resourceId || "").trim();
  if (resourceId) {
    const resource = await db.prepare("SELECT id FROM resources WHERE id = ? AND workspace_id = ?").get(scopedKey(workspaceId, resourceId), workspaceId);
    if (!resource) throw new Error("资源不存在");
  }
  const task = {
    id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    workspaceId,
    type: "download",
    status: "queued",
    title: input.title || "Download Task",
    clientId,
    resourceId,
    createdAt: new Date().toISOString(),
  };
  await db.prepare(`
    INSERT INTO tasks (id, workspace_id, type, status, payload, attempts, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)
  `).run(task.id, workspaceId, task.type, task.status, JSON.stringify(task), task.createdAt);
  return task;
}

export async function listTasks(workspaceId = "default") {
  return (await db
    .prepare("SELECT payload FROM tasks WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100")
    .all(workspaceId))
    .map((row) => parsePayload(row.payload));
}

export async function rerunTask(id, workspaceId = "default") {
  const row = await db.prepare("SELECT payload FROM tasks WHERE id = ? AND workspace_id = ?").get(id, workspaceId);
  if (!row) throw new Error("任务不存在");
  const task = { ...parsePayload(row.payload), status: "queued", rerunAt: new Date().toISOString() };
  await db.prepare("UPDATE tasks SET status = ?, payload = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?")
    .run(task.status, JSON.stringify(task), id, workspaceId);
  return task;
}

export async function claimNextTask(workerId = "worker") {
  const row = await db
    .prepare("SELECT * FROM tasks WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1")
    .get();
  if (!row) return null;
  const task = {
    ...parsePayload(row.payload),
    status: "running",
    workerId,
    startedAt: new Date().toISOString(),
  };
  await db.prepare(`
    UPDATE tasks
    SET status = 'running', attempts = attempts + 1, locked_at = ?, payload = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'queued'
  `).run(task.startedAt, JSON.stringify(task), row.id);
  return task;
}

export async function completeTask(id, result = {}) {
  const row = await db.prepare("SELECT payload FROM tasks WHERE id = ?").get(id);
  if (!row) throw new Error("任务不存在");
  const task = {
    ...parsePayload(row.payload),
    status: "completed",
    completedAt: new Date().toISOString(),
    result,
  };
  await db.prepare("UPDATE tasks SET status = 'completed', payload = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(JSON.stringify(task), id);
  return task;
}

export async function failTask(id, error) {
  const row = await db.prepare("SELECT payload FROM tasks WHERE id = ?").get(id);
  if (!row) throw new Error("任务不存在");
  const task = {
    ...parsePayload(row.payload),
    status: "failed",
    failedAt: new Date().toISOString(),
    error: error?.message || String(error),
  };
  await db.prepare("UPDATE tasks SET status = 'failed', payload = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(JSON.stringify(task), id);
  return task;
}

function normalize(input) {
  const id = String(input.id || input.name || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  if (!id) throw new Error("下载器 ID 不能为空");
  return {
    id,
    name: String(input.name || id).trim(),
    type: String(input.type || "qbittorrent").trim(),
    enabled: Boolean(input.enabled),
    baseUrl: String(input.baseUrl || "").trim(),
    username: String(input.username || "").trim(),
    password: input.password && !String(input.password).includes("***") ? encryptSecret(input.password) : undefined,
  };
}

function hydrate(client) {
  return { ...client, password: decryptSecret(client.password) };
}

function redact(client) {
  return { ...client, password: client.password ? maskSecret(client.password) : "" };
}

function dropUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, inner]) => inner !== undefined));
}

function scopedKey(workspaceId, id) {
  return workspaceId === "default" ? id : `${workspaceId}:${id}`;
}

function parsePayload(payload) {
  return typeof payload === "string" ? JSON.parse(payload) : payload;
}
