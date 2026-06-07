import { db } from "./db.js";

const plans = {
  starter: { users: 3, sources: 3, syncIntervalMinutes: 60 },
  team: { users: 10, sources: 10, syncIntervalMinutes: 15 },
  business: { users: 100, sources: 50, syncIntervalMinutes: 5 },
};

export async function getPlan(workspaceId = "default") {
  const row = await db.prepare("SELECT plan FROM workspaces WHERE id = ?").get(workspaceId);
  const planName = row?.plan || "starter";
  return {
    name: planName,
    limits: plans[planName] || plans.starter,
  };
}

export async function getWorkspacePlanLimit(workspaceId, kind) {
  return (await getPlan(workspaceId)).limits[kind] ?? 0;
}

export async function assertWithinLimit(workspaceId, kind) {
  const plan = await getPlan(workspaceId);
  if (kind === "users") {
    const count = (await db.prepare("SELECT COUNT(*) AS count FROM users WHERE workspace_id = ?").get(workspaceId)).count;
    if (count >= plan.limits.users) throw new Error(`当前套餐最多允许 ${plan.limits.users} 个用户`);
  }
  if (kind === "sources") {
    const count = (await db.prepare("SELECT COUNT(*) AS count FROM sources WHERE workspace_id = ?").get(workspaceId)).count;
    if (count >= plan.limits.sources) throw new Error(`当前套餐最多允许 ${plan.limits.sources} 个来源`);
  }
}

export async function assertSyncInterval(workspaceId) {
  const plan = await getPlan(workspaceId);
  const row = await db
    .prepare(`
      SELECT created_at FROM sync_logs
      WHERE workspace_id = ? AND type = 'media-resource-sync'
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get(workspaceId);
  if (!row) return;
  const elapsedMs = Date.now() - new Date(row.created_at).getTime();
  const intervalMs = plan.limits.syncIntervalMinutes * 60 * 1000;
  if (elapsedMs < intervalMs) {
    const waitMinutes = Math.ceil((intervalMs - elapsedMs) / 60000);
    throw new Error(`当前套餐同步频率限制，请 ${waitMinutes} 分钟后再试`);
  }
}

export function listPlans() {
  return Object.entries(plans).map(([name, limits]) => ({ name, limits }));
}

export async function getUsage(workspaceId = "default") {
  return {
    workspaceId,
    plan: await getPlan(workspaceId),
    users: countValue(await db.prepare("SELECT COUNT(*) AS count FROM users WHERE workspace_id = ?").get(workspaceId)),
    pendingInvitations: countValue(await db
      .prepare("SELECT COUNT(*) AS count FROM invitations WHERE workspace_id = ? AND status = 'pending' AND expires_at > ?")
      .get(workspaceId, new Date().toISOString())),
    sources: countValue(await db.prepare("SELECT COUNT(*) AS count FROM sources WHERE workspace_id = ?").get(workspaceId)),
    tasks: countValue(await db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE workspace_id = ?").get(workspaceId)),
    downloadClients: countValue(await db.prepare("SELECT COUNT(*) AS count FROM download_clients WHERE workspace_id = ?").get(workspaceId)),
  };
}

export async function changePlan(workspaceId, planName, actor = null) {
  if (!plans[planName]) throw new Error("套餐不正确");
  const usage = await getUsage(workspaceId);
  if (usage.users + usage.pendingInvitations > plans[planName].users) {
    throw new Error(`当前用户/邀请数量超过 ${planName} 套餐上限`);
  }
  if (usage.sources > plans[planName].sources) {
    throw new Error(`当前来源数量超过 ${planName} 套餐上限`);
  }
  await db.prepare("UPDATE workspaces SET plan = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(planName, workspaceId);
  await recordBillingEvent(workspaceId, "plan.change", {
    actorId: actor?.id || null,
    fromPlan: usage.plan.name,
    toPlan: planName,
  });
  return getPlan(workspaceId);
}

export async function createCheckoutSession(workspaceId, planName, actor = null) {
  if (!plans[planName]) throw new Error("套餐不正确");
  const provider = process.env.PAYMENT_PROVIDER || "manual";
  const event = await recordBillingEvent(workspaceId, "checkout.created", {
    provider,
    planName,
    actorId: actor?.id || null,
    checkoutUrl: provider === "manual" ? `/admin/billing/manual?plan=${encodeURIComponent(planName)}` : "",
  });
  return {
    id: event.id,
    provider,
    planName,
    checkoutUrl: event.payload.checkoutUrl,
    status: event.status,
  };
}

export async function recordBillingEvent(workspaceId, type, payload = {}) {
  const event = {
    id: `bill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    workspaceId,
    type,
    amountCents: Number(payload.amountCents || 0),
    currency: payload.currency || "USD",
    status: payload.status || "recorded",
    payload,
    createdAt: new Date().toISOString(),
  };
  await db.prepare(`
    INSERT INTO billing_events (id, workspace_id, type, amount_cents, currency, status, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(event.id, workspaceId, type, event.amountCents, event.currency, event.status, JSON.stringify(event.payload), event.createdAt);
  return event;
}

export async function listBillingEvents(workspaceId = "default") {
  return (await db
    .prepare("SELECT * FROM billing_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100")
    .all(workspaceId))
    .map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      type: row.type,
      amountCents: row.amount_cents,
      currency: row.currency,
      status: row.status,
      payload: parsePayload(row.payload),
      createdAt: row.created_at,
    }));
}

function parsePayload(payload) {
  return typeof payload === "string" ? JSON.parse(payload) : payload;
}

function countValue(row) {
  return Number(row?.count || 0);
}
