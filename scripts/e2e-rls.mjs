import { db } from "../server/services/db.js";

if (db.driver !== "postgres") {
  console.log("[SKIP] RLS E2E 只适用于 PostgreSQL");
  await db.close?.();
  process.exit(0);
}

let failed = false;

const bypassSources = await db.withRlsBypass(() => count("sources"));
await step("bypass 可以读取全局租户表", () => {
  assert(bypassSources > 0, `期望全局 sources > 0，实际 ${bypassSources}`);
});

const noContextSources = await count("sources");
await step("无 session context 时租户表不可见", () => {
  assert(noContextSources === 0, `无 context 不应看到 sources，实际 ${noContextSources}`);
});

const defaultSources = await db.withWorkspaceContext("default", () => count("sources"));
await step("default workspace context 只能读取 default 数据", () => {
  assert(defaultSources > 0, `default context 未读取到 sources，实际 ${defaultSources}`);
  assert(defaultSources <= bypassSources, "default context 读取数量超过全局数量");
});

const missingSources = await db.withWorkspaceContext("missing-workspace", () => count("sources"));
await step("错误 workspace context 不能读取其它租户数据", () => {
  assert(missingSources === 0, `错误 workspace 读到了 sources，实际 ${missingSources}`);
});

let crossTenantInsertBlocked = false;
try {
  await db.withWorkspaceContext("missing-workspace", () => db.prepare(`
    INSERT INTO sources (id, workspace_id, type, enabled, payload, created_at, updated_at)
    VALUES (?, 'default', 'internal', TRUE, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(`rls-cross-${Date.now().toString(36)}`, JSON.stringify({ id: "blocked" })));
} catch {
  crossTenantInsertBlocked = true;
}
await step("RLS 阻断跨 workspace 写入", () => {
  assert(crossTenantInsertBlocked, "跨 workspace 写入未被 RLS 阻断");
});

if (failed) {
  await db.close?.();
  process.exit(1);
}

await db.close?.();

async function count(table) {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
  return Number(row?.count || 0);
}

async function step(name, fn) {
  try {
    await fn();
    console.log(`[OK] ${name}`);
  } catch (error) {
    failed = true;
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
