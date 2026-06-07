import { resources } from "../../src/data/resources.seed.js";

export function createInternalAdapter(source) {
  return {
    source,
    async testConnection() {
      return {
        ok: true,
        message: "内部资源库可用",
      };
    },
    async getCapabilities() {
      return {
        search: true,
        rss: false,
        movie: true,
        tv: true,
        categories: ["movie", "tv"],
      };
    },
    async search({ media }) {
      return resources
        .filter((resource) => resource.mediaId === media.id && resource.source === source.name)
        .map((resource) => ({
          sourceResourceId: resource.id,
          title: resource.title,
          quality: resource.quality,
          medium: resource.medium,
          codec: resource.codec,
          audio: resource.audio,
          subtitle: resource.subtitle,
          sizeBytes: Math.round(resource.sizeGb * 1024 ** 3),
          seeders: resource.seeders,
          publishedAt: resource.publishedAt,
          url: resource.url || "",
        }));
    },
  };
}
