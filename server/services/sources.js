import { createAdapter } from "../adapters/index.js";
import { decryptSecret, encryptSecret, maskSecret } from "../lib/secret.js";
import { loadSourceHealth, loadSources, saveSources, updateSourceHealth } from "./store.js";
import { assertWithinLimit } from "./billing.js";

const allowedTypes = new Set(["internal", "torznab", "rss", "api", "private"]);

export async function listSources(workspaceId = "default") {
  const [sources, health] = await Promise.all([loadSources(workspaceId), loadSourceHealth(workspaceId)]);
  return sources.map((source) => ({
    ...redactSource(source),
    health: health[source.id] || null,
  }));
}

export async function upsertSource(input, workspaceId = "default") {
  const source = normalizeSource(input);
  const sources = await loadSources(workspaceId);
  const index = sources.findIndex((item) => item.id === source.id);
  if (index < 0) await assertWithinLimit(workspaceId, "sources");
  const cleaned = dropUndefined(source);
  const next = index >= 0 ? [...sources] : [...sources, cleaned];
  if (index >= 0) {
    next[index] = {
      ...sources[index],
      ...cleaned,
    };
  }
  await saveSources(next, workspaceId);
  return source;
}

function dropUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, inner]) => inner !== undefined));
}

export async function deleteSource(id, workspaceId = "default") {
  const sources = await loadSources(workspaceId);
  const next = sources.filter((source) => source.id !== id);
  await saveSources(next, workspaceId);
  return {
    deleted: sources.length !== next.length,
  };
}

export async function testSource(id, workspaceId = "default") {
  const source = await findSource(id, workspaceId);
  const adapter = createAdapter(source);
  if (!adapter.testConnection) {
    return {
      ok: true,
      message: "该来源未提供测试接口",
    };
  }
  const result = await adapter.testConnection();
  await updateSourceHealth(id, result, workspaceId);
  return result;
}

export async function getSourceCapabilities(id, workspaceId = "default") {
  const source = await findSource(id, workspaceId);
  const adapter = createAdapter(source);
  if (!adapter.getCapabilities) {
    return {
      search: false,
      rss: false,
      movie: false,
      tv: false,
      categories: [],
    };
  }
  return adapter.getCapabilities();
}

async function findSource(id, workspaceId = "default") {
  const sources = await loadSources(workspaceId);
  const source = sources.find((item) => item.id === id);
  if (!source) {
    throw new Error("来源不存在");
  }
  return hydrateSource(source);
}

function normalizeSource(input) {
  const id = String(input.id || input.name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const type = String(input.type || "").trim().toLowerCase();

  if (!id) throw new Error("来源 ID 不能为空");
  if (!input.name) throw new Error("来源名称不能为空");
  if (!allowedTypes.has(type)) throw new Error(`不支持的来源类型：${type}`);

  return {
    id,
    name: String(input.name).trim(),
    type,
    enabled: Boolean(input.enabled),
    weight: Number(input.weight || 1),
    baseUrl: input.baseUrl ? String(input.baseUrl).trim() : undefined,
    apiKey: input.apiKey && !String(input.apiKey).includes("***") ? encryptSecret(String(input.apiKey).trim()) : undefined,
    url: input.url ? String(input.url).trim() : undefined,
  };
}

export async function getRuntimeSources(workspaceId = "default") {
  return (await loadSources(workspaceId)).map(hydrateSource);
}

function hydrateSource(source) {
  return {
    ...source,
    apiKey: decryptSecret(source.apiKey),
  };
}

function redactSource(source) {
  return {
    ...source,
    apiKey: source.apiKey ? maskSecret(source.apiKey) : "",
  };
}
