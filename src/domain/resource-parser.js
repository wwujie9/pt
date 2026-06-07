export function parseResourceTitle(title) {
  return {
    year: title.match(/\b(19|20)\d{2}\b/)?.[0] ?? "未知",
    quality: title.match(/\b(2160p|1080p|720p|4K)\b/i)?.[0] ?? "未知",
    medium: title.match(/\b(REMUX|BluRay|WEB-DL|WEBRip|HDTV)\b/i)?.[0] ?? "未知",
    codec: title.match(/\b(H\.?265|HEVC|x265|H\.?264|AV1|x264)\b/i)?.[0] ?? "未知",
    seasonEpisode: title.match(/\bS\d{2}(E\d{2})?\b/i)?.[0] ?? "",
  };
}
