import { readItems, readTag, readTorznabAttrs } from "../lib/xml.js";

export function createTorznabAdapter(source) {
  return {
    source,
    async testConnection() {
      const capabilities = await this.getCapabilities();
      return {
        ok: true,
        message: "Torznab 来源可用",
        capabilities,
      };
    },
    async getCapabilities() {
      const url = createTorznabUrl(source);
      url.searchParams.set("t", "caps");
      const response = await fetch(url, {
        headers: {
          "user-agent": "PT-Resource-Hub/0.1",
        },
      });

      if (!response.ok) {
        throw new Error(`Torznab caps 请求失败：${response.status}`);
      }

      const xml = await response.text();
      return {
        search: /<searching>/i.test(xml),
        rss: /<rss/i.test(xml) || /<limits/i.test(xml),
        movie: /movie-search/i.test(xml) || /<movie-search/i.test(xml),
        tv: /tv-search/i.test(xml) || /<tv-search/i.test(xml),
        categories: [...xml.matchAll(/<category[^>]*id="([^"]+)"[^>]*name="([^"]*)"/gi)].map((match) => ({
          id: match[1],
          name: match[2],
        })),
      };
    },
    async search({ media }) {
      const url = createTorznabUrl(source);
      url.searchParams.set("t", "search");
      url.searchParams.set("q", media.titleEn || media.originalTitle || media.titleZh);
      if (media.imdbId) {
        url.searchParams.set("imdbid", media.imdbId.replace(/^tt/, ""));
      }

      const response = await fetch(url, {
        headers: {
          "user-agent": "PT-Resource-Hub/0.1",
        },
      });

      if (!response.ok) {
        throw new Error(`Torznab 来源请求失败：${response.status}`);
      }

      const xml = await response.text();
      return readItems(xml).map((item) => {
        const attrs = readTorznabAttrs(item);
        return {
          sourceResourceId: readTag(item, "guid") || readTag(item, "link") || readTag(item, "title"),
          title: readTag(item, "title"),
          url: readTag(item, "link"),
          publishedAt: readTag(item, "pubDate"),
          sizeBytes: Number(readTag(item, "size") || attrs.size || 0),
          seeders: Number(attrs.seeders || 0),
          leechers: Number(attrs.peers || 0),
        };
      });
    },
  };
}

function createTorznabUrl(source) {
  const url = new URL(source.baseUrl);
  if (source.apiKey) {
    url.searchParams.set("apikey", source.apiKey);
  }
  return url;
}
