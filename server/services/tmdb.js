const tmdbBaseUrl = "https://api.themoviedb.org/3";

export async function searchTmdb({ query, type = "multi", language = "zh-CN" }) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return {
      configured: false,
      items: [],
      message: "未配置 TMDB_API_KEY，当前仅使用本地媒体目录。",
    };
  }

  const safeType = ["movie", "tv", "multi"].includes(type) ? type : "multi";
  const url = new URL(`${tmdbBaseUrl}/search/${safeType}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("query", query);
  url.searchParams.set("language", language);
  url.searchParams.set("include_adult", "false");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`TMDB 搜索失败：${response.status}`);
  }

  const payload = await response.json();
  return {
    configured: true,
    items: (payload.results || []).map((item) => ({
      tmdbId: item.id,
      type: item.media_type || safeType,
      title: item.title || item.name,
      originalTitle: item.original_title || item.original_name,
      overview: item.overview,
      year: String(item.release_date || item.first_air_date || "").slice(0, 4),
      poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
      rating: item.vote_average,
    })),
  };
}

export function tmdbResultToMediaItem(item) {
  const type = item.type === "tv" ? "tv" : "movie";
  const title = item.title || item.originalTitle || `TMDB ${item.tmdbId}`;
  return {
    id: `tmdb-${type}-${item.tmdbId}`,
    tmdbId: item.tmdbId,
    imdbId: "",
    type,
    titleZh: title,
    titleEn: item.originalTitle || title,
    originalTitle: item.originalTitle || title,
    year: Number(item.year || 0),
    country: "待补全",
    language: "待补全",
    runtime: 0,
    rating: Number(item.rating || 0),
    genres: ["待分类"],
    overview: item.overview || "暂无简介",
    poster: item.poster || "",
    backdrop: "",
    aliases: [title, item.originalTitle].filter(Boolean),
  };
}
