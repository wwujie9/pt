import { createAdapter } from "../adapters/index.js";
import { normalizeExternalResource } from "../domain/resource-normalizer.js";
import { getMedia } from "./catalog.js";
import { appendSyncLog, upsertResources } from "./store.js";
import { getRuntimeSources } from "./sources.js";
import { notifyEvent } from "./notifications.js";
import { assertSyncInterval } from "./billing.js";

export async function syncResourcesForMedia(mediaId, workspaceId = "default") {
  await assertSyncInterval(workspaceId);
  const media = await getMedia(mediaId, workspaceId);
  if (!media) {
    throw new Error("影视条目不存在");
  }

  const sources = (await getRuntimeSources(workspaceId)).filter((source) => source.enabled);
  const results = [];
  const errors = [];

  for (const source of sources) {
    try {
      const adapter = createAdapter(source);
      const rawItems = await adapter.search({ media });
      const normalized = rawItems.map((item) => normalizeExternalResource(item, source, media));
      results.push(...normalized);
    } catch (error) {
      errors.push({
        sourceId: source.id,
        sourceName: source.name,
        message: error.message,
      });
    }
  }

  await upsertResources(results, workspaceId);

  const summary = {
    mediaId,
    sourceCount: sources.length,
    importedCount: results.length,
    errors,
  };
  await appendSyncLog({
    type: "media-resource-sync",
    status: errors.length ? "partial" : "success",
    ...summary,
  }, workspaceId);
  await notifyEvent({
    type: "media-resource-sync",
    status: summary.errors.length ? "partial" : "success",
    mediaId,
    importedCount: summary.importedCount,
    errorCount: summary.errors.length,
  }).catch(() => null);
  return summary;
}
