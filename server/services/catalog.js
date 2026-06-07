import { searchMedia } from "../../src/domain/media-search.js";
import { sortResources } from "../../src/domain/resource-ranking.js";
import { loadMedia, loadResources, loadSources } from "./store.js";

export async function getStats(workspaceId = "default") {
  const media = await loadMedia(workspaceId);
  const resources = await loadResources(workspaceId);
  const sources = await loadSources(workspaceId);
  return {
    mediaCount: media.length,
    resourceCount: resources.length,
    sourceCount: sources.length,
    enabledSourceCount: sources.filter((source) => source.enabled).length,
    zhSubtitleCount: resources.filter((resource) => resource.subtitle?.includes("中文")).length,
  };
}

export async function listMedia({ q = "", type = "all", genre = "all", workspaceId = "default" }) {
  const media = await loadMedia(workspaceId);
  const resources = await loadResources(workspaceId);
  return searchMedia(media, q, { type, genre }).map((item) => ({
    ...item,
    resourceCount: resources.filter((resource) => resource.mediaId === item.id).length,
  }));
}

export async function getMedia(id, workspaceId = "default") {
  const media = await loadMedia(workspaceId);
  return media.find((item) => item.id === id);
}

export async function listResources(mediaId, { quality = "all", subtitle = "all", workspaceId = "default" }) {
  const resources = await loadResources(workspaceId);
  return sortResources(
    resources.filter((resource) => {
      const matchMedia = resource.mediaId === mediaId;
      const matchQuality = quality === "all" || resource.quality === quality;
      const matchSubtitle = subtitle === "all" || resource.subtitle?.includes(subtitle);
      return matchMedia && matchQuality && matchSubtitle;
    }),
  );
}
