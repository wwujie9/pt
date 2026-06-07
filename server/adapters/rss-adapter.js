import { readItems, readTag } from "../lib/xml.js";

export function createRssAdapter(source) {
  return {
    source,
    async testConnection() {
      const response = await fetch(source.url, {
        headers: {
          "user-agent": "PT-Resource-Hub/0.1",
        },
      });
      return {
        ok: response.ok,
        status: response.status,
        message: response.ok ? "RSS 来源可用" : `RSS 来源请求失败：${response.status}`,
      };
    },
    async getCapabilities() {
      return {
        search: false,
        rss: true,
        movie: false,
        tv: false,
        categories: [],
      };
    },
    async search({ media }) {
      const response = await fetch(source.url, {
        headers: {
          "user-agent": "PT-Resource-Hub/0.1",
        },
      });

      if (!response.ok) {
        throw new Error(`RSS 来源请求失败：${response.status}`);
      }

      const xml = await response.text();
      const keywords = [media.titleZh, media.titleEn, media.originalTitle].filter(Boolean);

      return readItems(xml)
        .map((item) => ({
          sourceResourceId: readTag(item, "guid") || readTag(item, "link") || readTag(item, "title"),
          title: readTag(item, "title"),
          url: readTag(item, "link"),
          publishedAt: readTag(item, "pubDate"),
          sizeBytes: Number(readTag(item, "size") || readTag(item, "length") || 0),
        }))
        .filter((item) => keywords.some((keyword) => item.title.toLowerCase().includes(keyword.toLowerCase())));
    },
  };
}
