import { db } from "./db.js";
import { listMedia } from "./catalog.js";

const defaultPlacement = process.env.AD_PLACEMENT || "catalog-sidebar";

export async function publicCatalog({ workspaceId = "default", limit = 6 } = {}) {
  const media = await listMedia({
    q: "",
    type: "all",
    genre: "all",
    workspaceId,
  });
  const ad = await activeAdPlacement(workspaceId, defaultPlacement);
  return {
    workspaceId,
    items: media.slice(0, Math.min(Number(limit) || 6, 12)).map((item) => ({
      id: item.id,
      title: item.titleZh || item.titleEn || item.id,
      originalTitle: item.titleEn || item.originalTitle || "",
      year: item.year,
      type: item.type,
      poster: item.poster,
      rating: item.rating,
      resourceCount: item.resourceCount || 0,
      href: `#/media/${encodeURIComponent(item.id)}`,
    })),
    ad,
  };
}

export async function trackTraffic(input = {}) {
  const workspaceId = String(input.workspaceId || "default");
  const event = {
    id: nextId("traffic"),
    workspaceId,
    sourceSite: trim(input.sourceSite || input.host || ""),
    referrer: trim(input.referrer || ""),
    utmSource: trim(input.utmSource || input.utm_source || ""),
    utmMedium: trim(input.utmMedium || input.utm_medium || ""),
    utmCampaign: trim(input.utmCampaign || input.utm_campaign || ""),
    landingPath: trim(input.landingPath || input.path || ""),
    payload: {
      userAgent: trim(input.userAgent || ""),
      title: trim(input.title || ""),
      raw: input.raw || null,
    },
    createdAt: new Date().toISOString(),
  };
  await db.prepare(`
    INSERT INTO traffic_events (id, workspace_id, source_site, referrer, utm_source, utm_medium, utm_campaign, landing_path, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(event.id, workspaceId, event.sourceSite, event.referrer, event.utmSource, event.utmMedium, event.utmCampaign, event.landingPath, JSON.stringify(event.payload), event.createdAt);
  return { ok: true, id: event.id };
}

export async function growthMetrics(workspaceId = "default") {
  const [totals, campaigns, sites, adTotals, users, invitations, sources, syncs, tasks] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS visits FROM traffic_events WHERE workspace_id = ?").get(workspaceId),
    db.prepare(`
      SELECT COALESCE(NULLIF(utm_campaign, ''), 'direct') AS campaign, COUNT(*) AS visits
      FROM traffic_events
      WHERE workspace_id = ?
      GROUP BY COALESCE(NULLIF(utm_campaign, ''), 'direct')
      ORDER BY visits DESC
      LIMIT 8
    `).all(workspaceId),
    db.prepare(`
      SELECT COALESCE(NULLIF(source_site, ''), 'unknown') AS source_site, COUNT(*) AS visits
      FROM traffic_events
      WHERE workspace_id = ?
      GROUP BY COALESCE(NULLIF(source_site, ''), 'unknown')
      ORDER BY visits DESC
      LIMIT 8
    `).all(workspaceId),
    db.prepare(`
      SELECT event_type, COUNT(*) AS count
      FROM ad_events
      WHERE workspace_id = ?
      GROUP BY event_type
    `).all(workspaceId),
    db.prepare("SELECT COUNT(*) AS count FROM users WHERE workspace_id = ?").get(workspaceId),
    db.prepare("SELECT COUNT(*) AS count FROM invitations WHERE workspace_id = ?").get(workspaceId),
    db.prepare("SELECT COUNT(*) AS count FROM sources WHERE workspace_id = ?").get(workspaceId),
    db.prepare("SELECT COUNT(*) AS count FROM sync_logs WHERE workspace_id = ? AND type = 'media-resource-sync'").get(workspaceId),
    db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE workspace_id = ?").get(workspaceId),
  ]);
  const adCounts = Object.fromEntries(adTotals.map((row) => [row.event_type, Number(row.count || 0)]));
  const visits = Number(totals?.visits || 0);
  const funnel = growthFunnel({
    visits,
    users: Number(users?.count || 0),
    invitations: Number(invitations?.count || 0),
    sources: Number(sources?.count || 0),
    syncs: Number(syncs?.count || 0),
    tasks: Number(tasks?.count || 0),
  });
  return {
    workspaceId,
    visits,
    campaigns: campaigns.map((row) => ({ campaign: row.campaign, visits: Number(row.visits || 0) })),
    sites: sites.map((row) => ({ sourceSite: row.source_site, visits: Number(row.visits || 0) })),
    ads: {
      impressions: Number(adCounts.impression || 0),
      clicks: Number(adCounts.click || 0),
      ctr: adCounts.impression ? Number(((Number(adCounts.click || 0) / Number(adCounts.impression)) * 100).toFixed(2)) : 0,
    },
    funnel,
    embed: {
      script: `${publicAppUrl()}/embed.js?workspaceId=${encodeURIComponent(workspaceId)}&mode=poster-grid&limit=6&utm_campaign=traffic-site`,
      listScript: `${publicAppUrl()}/embed.js?workspaceId=${encodeURIComponent(workspaceId)}&mode=list&limit=6&utm_campaign=traffic-site`,
      compactScript: `${publicAppUrl()}/embed.js?workspaceId=${encodeURIComponent(workspaceId)}&mode=compact&limit=4&utm_campaign=traffic-site`,
    },
  };
}

export async function listAdPlacements(workspaceId = "default") {
  return (await db.prepare(`
    SELECT * FROM ad_placements
    WHERE workspace_id = ?
    ORDER BY updated_at DESC
  `).all(workspaceId)).map(adFromRow);
}

export async function upsertAdPlacement(input = {}, workspaceId = "default") {
  const id = trim(input.id || `ad-${Date.now().toString(36)}`);
  const placement = trim(input.placement || defaultPlacement);
  const ad = {
    id,
    workspaceId,
    placement,
    title: trim(input.title || "免费试用影源聚合站"),
    body: trim(input.body || "前 180 天免费接入授权来源，适合现有流量站点快速做资源索引页。"),
    targetUrl: trim(input.targetUrl || input.target_url || "/#/admin"),
    imageUrl: trim(input.imageUrl || input.image_url || ""),
    enabled: input.enabled === undefined ? true : Boolean(input.enabled),
  };
  await db.prepare(`
    INSERT OR REPLACE INTO ad_placements (id, workspace_id, placement, title, body, target_url, image_url, enabled, payload, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM ad_placements WHERE id = ?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
  `).run(ad.id, workspaceId, placement, ad.title, ad.body, ad.targetUrl, ad.imageUrl, ad.enabled, JSON.stringify(ad), ad.id);
  return ad;
}

export async function activeAdPlacement(workspaceId = "default", placement = defaultPlacement) {
  if (process.env.ENABLE_ADS !== "1") return null;
  const row = await db.prepare(`
    SELECT * FROM ad_placements
    WHERE workspace_id = ? AND placement = ? AND enabled = TRUE
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(workspaceId, placement);
  return row ? adFromRow(row) : fallbackAd(workspaceId, placement);
}

export async function recordAdEvent(input = {}) {
  const workspaceId = String(input.workspaceId || "default");
  const event = {
    id: nextId("ad_evt"),
    workspaceId,
    placementId: trim(input.placementId || input.placement_id || "fallback"),
    eventType: ["impression", "click"].includes(input.eventType || input.event_type) ? input.eventType || input.event_type : "impression",
    sourceSite: trim(input.sourceSite || ""),
    payload: {
      href: trim(input.href || ""),
      campaign: trim(input.utmCampaign || input.utm_campaign || ""),
    },
    createdAt: new Date().toISOString(),
  };
  await db.prepare(`
    INSERT INTO ad_events (id, workspace_id, placement_id, event_type, source_site, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(event.id, workspaceId, event.placementId, event.eventType, event.sourceSite, JSON.stringify(event.payload), event.createdAt);
  return { ok: true, id: event.id };
}

function adFromRow(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    placement: row.placement,
    title: row.title,
    body: row.body || "",
    targetUrl: row.target_url || "",
    imageUrl: row.image_url || "",
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fallbackAd(workspaceId, placement) {
  return {
    id: "fallback",
    workspaceId,
    placement,
    title: "前 180 天免费试用",
    body: "把现有流量接入影源聚合站，先免费获客，后续按广告位和套餐变现。",
    targetUrl: "/#/admin",
    imageUrl: "",
    enabled: true,
  };
}

function growthFunnel({ visits, users, invitations, sources, syncs, tasks }) {
  const members = users + invitations;
  const activated = sources > 0 && syncs > 0;
  return {
    visits,
    members,
    users,
    invitations,
    sources,
    syncs,
    tasks,
    activated,
    rates: {
      memberFromVisit: percent(members, visits),
      sourceFromVisit: percent(sources, visits),
      syncFromVisit: percent(syncs, visits),
      sourceFromMember: percent(sources, members),
      syncFromSource: percent(syncs, sources),
    },
  };
}

function percent(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((Number(numerator || 0) / Number(denominator || 0)) * 100).toFixed(2));
}

function publicAppUrl() {
  return process.env.PUBLIC_APP_URL || `http://127.0.0.1:${process.env.PORT || 4273}`;
}

function nextId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function trim(value) {
  return String(value || "").trim().slice(0, 1000);
}
