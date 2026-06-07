import { mediaItems } from "../data/media.seed.js";
import { resources } from "../data/resources.seed.js";
import { searchMedia } from "../domain/media-search.js";
import { sortResources } from "../domain/resource-ranking.js";

export function getCatalogStats() {
  return {
    mediaCount: mediaItems.length,
    resourceCount: resources.length,
    sourceCount: new Set(resources.map((resource) => resource.source)).size,
    zhSubtitleCount: resources.filter((resource) => resource.subtitle.includes("中文")).length,
  };
}

export function getMediaList(keyword, filters) {
  return searchMedia(mediaItems, keyword, filters).map((item) => ({
    ...item,
    resourceCount: resources.filter((resource) => resource.mediaId === item.id).length,
  }));
}

export function getMediaById(id) {
  return mediaItems.find((item) => item.id === id) ?? mediaItems[0];
}

export function getResourcesByMediaId(mediaId, filters = {}) {
  const list = resources.filter((resource) => {
    const matchMedia = resource.mediaId === mediaId;
    const matchQuality = !filters.quality || filters.quality === "all" || resource.quality === filters.quality;
    const matchSubtitle =
      !filters.subtitle || filters.subtitle === "all" || resource.subtitle.includes(filters.subtitle);

    return matchMedia && matchQuality && matchSubtitle;
  });

  return sortResources(list);
}
