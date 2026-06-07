import { db } from "./db.js";

export async function loadMedia(workspaceId = "default") {
  return (await db
    .prepare("SELECT payload FROM media_items WHERE workspace_id = ? ORDER BY json_extract(payload, '$.year') DESC")
    .all(workspaceId))
    .map((row) => parsePayload(row.payload));
}

export async function loadResources(workspaceId = "default") {
  return (await db
    .prepare("SELECT payload FROM resources WHERE workspace_id = ? ORDER BY updated_at DESC")
    .all(workspaceId))
    .map((row) => parsePayload(row.payload));
}

export async function loadReviewQueue(workspaceId = "default") {
  return (await db
    .prepare(`
      SELECT payload FROM resources
      WHERE workspace_id = ? AND (status = 'review' OR match_score < 65)
      ORDER BY updated_at DESC
      LIMIT 100
    `)
    .all(workspaceId))
    .map((row) => parsePayload(row.payload));
}

export async function updateResourceStatus(id, status, workspaceId = "default") {
  const row = await db.prepare("SELECT payload FROM resources WHERE id = ? AND workspace_id = ?").get(scopedKey(workspaceId, id), workspaceId);
  if (!row) throw new Error("资源不存在");
  const resource = {
    ...parsePayload(row.payload),
    status,
    updatedAt: new Date().toISOString(),
  };
  await db.prepare(`
    UPDATE resources
    SET status = ?, payload = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, JSON.stringify(resource), scopedKey(workspaceId, id));
  return resource;
}

export async function saveResources(resources, workspaceId = "default") {
  const replace = db.prepare(`
    INSERT OR REPLACE INTO resources (id, workspace_id, media_id, source_id, match_score, status, payload, created_at, updated_at)
    VALUES (
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      COALESCE((SELECT created_at FROM resources WHERE id = ?), CURRENT_TIMESTAMP),
      CURRENT_TIMESTAMP
    )
  `);
  await db.exec("BEGIN");
  try {
    await db.prepare("DELETE FROM resources WHERE workspace_id = ?").run(workspaceId);
    for (const resource of resources) {
      await replace.run(
        scopedKey(workspaceId, resource.id),
        workspaceId,
        resource.mediaId,
        resource.sourceId || resource.source || "",
        Number(resource.matchScore || 70),
        resource.status || "active",
        JSON.stringify(resource),
        scopedKey(workspaceId, resource.id),
      );
    }
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

export async function loadSources(workspaceId = "default") {
  return (await db
    .prepare("SELECT payload FROM sources WHERE workspace_id = ? ORDER BY id")
    .all(workspaceId))
    .map((row) => parsePayload(row.payload));
}

export async function saveSources(sources, workspaceId = "default") {
  const replace = db.prepare(`
    INSERT OR REPLACE INTO sources (id, workspace_id, type, enabled, payload, created_at, updated_at)
    VALUES (
      ?,
      ?,
      ?,
      ?,
      ?,
      COALESCE((SELECT created_at FROM sources WHERE id = ?), CURRENT_TIMESTAMP),
      CURRENT_TIMESTAMP
    )
  `);
  await db.exec("BEGIN");
  try {
    await db.prepare("DELETE FROM sources WHERE workspace_id = ?").run(workspaceId);
    for (const source of sources) {
      await replace.run(scopedKey(workspaceId, source.id), workspaceId, source.type, Boolean(source.enabled), JSON.stringify(source), scopedKey(workspaceId, source.id));
    }
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

export async function loadSyncLogs(workspaceId = "default") {
  return (await db
    .prepare("SELECT payload FROM sync_logs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 200")
    .all(workspaceId))
    .map((row) => parsePayload(row.payload));
}

export async function appendSyncLog(log, workspaceId = "default") {
  const next = {
    id: `job-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    ...log,
  };
  await db.prepare(`
    INSERT INTO sync_logs (id, workspace_id, type, status, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(next.id, workspaceId, next.type || "sync", next.status || "unknown", JSON.stringify(next), next.createdAt);
  return next;
}

export async function upsertResources(incoming, workspaceId = "default") {
  const current = await loadResources(workspaceId);
  const map = new Map(current.map((resource) => [resource.id, resource]));
  for (const resource of incoming) {
    map.set(resource.id, {
      ...map.get(resource.id),
      ...resource,
      status: resource.matchScore < 65 ? "review" : resource.status || "active",
      updatedAt: new Date().toISOString(),
    });
  }
  const next = [...map.values()];
  await saveResources(next, workspaceId);
  return next;
}

export async function upsertMedia(item, workspaceId = "default") {
  await db.prepare(`
    INSERT OR REPLACE INTO media_items (id, workspace_id, payload, created_at, updated_at)
    VALUES (
      ?,
      ?,
      ?,
      COALESCE((SELECT created_at FROM media_items WHERE id = ?), CURRENT_TIMESTAMP),
      CURRENT_TIMESTAMP
    )
  `).run(scopedKey(workspaceId, item.id), workspaceId, JSON.stringify(item), scopedKey(workspaceId, item.id));
  return item;
}

export async function updateSourceHealth(sourceId, health, workspaceId = "default") {
  await db.prepare(`
    INSERT OR REPLACE INTO source_health (source_id, workspace_id, ok, message, checked_at, payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(scopedKey(workspaceId, sourceId), workspaceId, Boolean(health.ok), health.message || "", new Date().toISOString(), JSON.stringify(health));
  return health;
}

export async function loadSourceHealth(workspaceId = "default") {
  return Object.fromEntries(
    (await db
      .prepare("SELECT source_id, payload FROM source_health WHERE workspace_id = ?")
      .all(workspaceId))
      .map((row) => [unscopedKey(workspaceId, row.source_id), parsePayload(row.payload)]),
  );
}

export async function exportBackup(workspaceId = "default") {
  return {
    exportedAt: new Date().toISOString(),
    workspaceId,
    media: await loadMedia(workspaceId),
    sources: await loadSources(workspaceId),
    resources: await loadResources(workspaceId),
    syncLogs: await loadSyncLogs(workspaceId),
    sourceHealth: await loadSourceHealth(workspaceId),
  };
}

function scopedKey(workspaceId, id) {
  return workspaceId === "default" ? id : `${workspaceId}:${id}`;
}

function unscopedKey(workspaceId, id) {
  const prefix = `${workspaceId}:`;
  return workspaceId !== "default" && String(id).startsWith(prefix) ? String(id).slice(prefix.length) : id;
}

function parsePayload(payload) {
  return typeof payload === "string" ? JSON.parse(payload) : payload;
}
