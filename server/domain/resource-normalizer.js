import { parseResourceTitle } from "../../src/domain/resource-parser.js";

export function normalizeExternalResource(raw, source, media) {
  const parsed = parseResourceTitle(raw.title);
  const publishedAt = raw.publishedAt ? new Date(raw.publishedAt) : new Date();

  return {
    id: makeResourceId(source.id, raw.sourceResourceId || raw.url || raw.title),
    mediaId: media.id,
    source: source.name,
    sourceId: source.id,
    sourceType: source.type,
    title: raw.title,
    url: raw.url || "",
    quality: normalizeQuality(raw.quality || parsed.quality),
    medium: normalizeMedium(raw.medium || parsed.medium),
    codec: raw.codec || parsed.codec,
    audio: raw.audio || "未知音轨",
    subtitle: raw.subtitle || inferSubtitle(raw.title),
    sizeGb: raw.sizeBytes ? Number((raw.sizeBytes / 1024 ** 3).toFixed(2)) : 0,
    seeders: Number(raw.seeders || 0),
    publishedAt: Number.isNaN(publishedAt.valueOf())
      ? new Date().toISOString().slice(0, 10)
      : publishedAt.toISOString().slice(0, 10),
    matchScore: calculateMatchScore(raw.title, media),
    trusted: Boolean(source.trusted || source.type === "internal" || source.type === "torznab"),
    raw,
  };
}

function calculateMatchScore(title, media) {
  const normalized = normalize(title);
  const aliases = [media.titleZh, media.titleEn, media.originalTitle, ...(media.aliases || [])]
    .filter(Boolean)
    .map(normalize);
  const titleMatch = aliases.some((alias) => alias && normalized.includes(alias.replaceAll(" ", "")))
    || aliases.some((alias) => alias && normalized.includes(alias));
  const yearMatch = media.year ? normalized.includes(String(media.year)) : false;
  const idMatch = media.imdbId ? normalized.includes(media.imdbId.replace(/^tt/i, "")) : false;

  let score = 35;
  if (titleMatch) score += 35;
  if (yearMatch) score += 20;
  if (idMatch) score += 10;
  return Math.min(100, score);
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
    .trim();
}

function normalizeQuality(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("2160") || text.includes("4k")) return "2160p";
  if (text.includes("1080")) return "1080p";
  if (text.includes("720")) return "720p";
  return "SD";
}

function normalizeMedium(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("remux")) return "REMUX";
  if (text.includes("bluray") || text.includes("blu-ray")) return "BluRay";
  if (text.includes("web-dl")) return "WEB-DL";
  if (text.includes("webrip")) return "WEBRip";
  return "WEB-DL";
}

function inferSubtitle(title) {
  return /chs|cht|chinese|中文|中字/i.test(title) ? "中文字幕" : "无字幕信息";
}

function makeResourceId(sourceId, seed) {
  const normalized = `${sourceId}:${seed}`.toLowerCase();
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }
  return `ext-${hash.toString(16)}`;
}
