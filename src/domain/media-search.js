export function searchMedia(items, keyword, filters) {
  const query = keyword.trim().toLowerCase();

  return items.filter((item) => {
    const haystack = [
      item.titleZh,
      item.titleEn,
      item.originalTitle,
      item.country,
      item.language,
      ...item.genres,
      ...item.aliases,
    ]
      .join(" ")
      .toLowerCase();

    const matchKeyword = !query || haystack.includes(query);
    const matchType = filters.type === "all" || item.type === filters.type;
    const matchGenre = filters.genre === "all" || item.genres.includes(filters.genre);

    return matchKeyword && matchType && matchGenre;
  });
}
