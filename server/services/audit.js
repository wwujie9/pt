import { db } from "./db.js";

export async function appendAuditLog({ actor, workspaceId, action, targetType, targetId, payload = {} }) {
  const entry = {
    id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    workspaceId: workspaceId || actor?.workspaceId || "default",
    actorId: actor?.id || null,
    actorEmail: actor?.email || null,
    action,
    targetType,
    targetId,
    payload: sanitize(payload),
    createdAt: new Date().toISOString(),
  };

  await db.prepare(`
    INSERT INTO audit_logs (id, workspace_id, actor_id, action, target_type, target_id, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(entry.id, entry.workspaceId, entry.actorId, action, targetType || "", targetId || "", JSON.stringify(entry), entry.createdAt);

  return entry;
}

export async function listAuditLogs({ workspaceId = "default", limit = 100, includeAll = false } = {}) {
  const sql = includeAll
    ? "SELECT payload FROM audit_logs ORDER BY created_at DESC LIMIT ?"
    : "SELECT payload FROM audit_logs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?";
  const args = includeAll ? [Number(limit)] : [workspaceId, Number(limit)];
  return (await db
    .prepare(sql)
    .all(...args))
    .map((row) => parsePayload(row.payload));
}

function parsePayload(payload) {
  return typeof payload === "string" ? JSON.parse(payload) : payload;
}

function sanitize(value) {
  return JSON.parse(
    JSON.stringify(value, (key, inner) => {
      if (/apikey|api_key|token|cookie|passkey|password|secret/i.test(key)) {
        return inner ? "***" : inner;
      }
      return inner;
    }),
  );
}
