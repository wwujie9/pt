const qualityScore = {
  "2160p": 96,
  "1080p": 78,
  "720p": 58,
  SD: 30,
};

const mediumScore = {
  REMUX: 100,
  BluRay: 86,
  "WEB-DL": 78,
  WEBRip: 62,
};

export function calculateResourceScore(resource) {
  const quality = qualityScore[resource.quality] ?? 40;
  const medium = mediumScore[resource.medium] ?? 45;
  const health = Math.min(100, resource.seeders * 1.8);
  const subtitle = resource.subtitle.includes("中文")
    ? 100
    : resource.subtitle.includes("多语言")
      ? 82
      : 35;
  const trust = resource.trusted ? 100 : 45;

  return Math.round(
    quality * 0.25 + medium * 0.2 + health * 0.18 + subtitle * 0.14 + trust * 0.13 + (resource.matchScore ?? 70) * 0.1,
  );
}

export function sortResources(resources) {
  return [...resources]
    .map((resource) => ({
      ...resource,
      score: calculateResourceScore(resource),
    }))
    .sort((a, b) => b.score - a.score);
}
