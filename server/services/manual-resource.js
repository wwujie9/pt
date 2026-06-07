import { normalizeExternalResource } from "../domain/resource-normalizer.js";
import { getMedia } from "./catalog.js";
import { upsertResources } from "./store.js";

export async function addManualResource(mediaId, input, workspaceId = "default") {
  const media = await getMedia(mediaId, workspaceId);
  if (!media) {
    throw new Error("影视条目不存在");
  }

  const source = {
    id: input.sourceId || "manual",
    name: input.source || "Manual Entry",
    type: "manual",
    trusted: true,
  };

  const resource = normalizeExternalResource(
    {
      sourceResourceId: input.sourceResourceId || `${Date.now()}-${input.title}`,
      title: input.title,
      url: input.url,
      quality: input.quality,
      medium: input.medium,
      codec: input.codec,
      audio: input.audio,
      subtitle: input.subtitle,
      sizeBytes: Number(input.sizeGb || 0) * 1024 ** 3,
      seeders: Number(input.seeders || 0),
      publishedAt: input.publishedAt || new Date().toISOString(),
    },
    source,
    media,
  );

  await upsertResources([resource], workspaceId);
  return resource;
}
