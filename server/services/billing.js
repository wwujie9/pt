import { createHmac, timingSafeEqual } from "node:crypto";
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
  const providerSession = await createProviderCheckout(provider, workspaceId, planName, actor);
  const event = await recordBillingEvent(workspaceId, "checkout.created", {
    provider,
    planName,
    actorId: actor?.id || null,
    checkoutUrl: providerSession.checkoutUrl,
    providerSessionId: providerSession.id,
  });
  return {
    id: providerSession.id || event.id,
    provider,
    planName,
    checkoutUrl: event.payload.checkoutUrl,
    status: event.status,
  };
}

export async function handlePaymentWebhook(provider, rawBody, headers = {}) {
  const payload = parseAndVerifyWebhook(provider, rawBody, headers);
  const normalized = normalizePaymentEvent(provider, payload);
  await applyPaymentEvent(provider, payload, normalized);
  return { ok: true, provider, event: normalized };
}

export async function replayBillingWebhook(workspaceId, eventId, actor = null) {
  const event = await getBillingEvent(workspaceId, eventId);
  if (!event) throw new Error("账单事件不存在");
  const provider = event.payload.provider;
  const raw = event.payload.raw;
  if (!provider || !raw) throw new Error("该账单事件缺少可重放的原始 webhook payload");
  const normalized = normalizePaymentEvent(provider, raw);
  if (normalized.workspaceId !== workspaceId) throw new Error("重放事件 workspace 不匹配");
  await applyPaymentEvent(provider, raw, normalized, { replayedFrom: event.id, actorId: actor?.id || null });
  const replay = await recordBillingEvent(workspaceId, "webhook.replayed", {
    provider,
    providerEventId: normalized.providerEventId,
    sourceBillingEventId: event.id,
    actorId: actor?.id || null,
    status: "replayed",
  });
  return { ok: true, replay, event: normalized };
}

export async function createRefund(workspaceId, input = {}, actor = null) {
  const sourceEvent = input.billingEventId ? await getBillingEvent(workspaceId, input.billingEventId) : null;
  const sourcePayload = sourceEvent?.payload || {};
  const provider = input.provider || sourcePayload.provider || process.env.PAYMENT_PROVIDER || "manual";
  const amountCents = Number(input.amountCents || sourceEvent?.amountCents || 0);
  if (amountCents < 0) throw new Error("退款金额不能为负数");
  const reason = input.reason || "requested_by_customer";
  const refund = provider === "stripe"
    ? await createStripeRefund({ sourceEvent, amountCents, reason })
    : await createManualRefund({ provider, sourceEvent, amountCents, reason });
  const event = await recordBillingEvent(workspaceId, refund.type, {
    provider,
    providerEventId: refund.id,
    sourceBillingEventId: sourceEvent?.id || null,
    actorId: actor?.id || null,
    reason,
    amountCents: refund.amountCents,
    currency: refund.currency,
    status: refund.status,
    raw: refund.raw,
  });
  return { ok: true, refund: event };
}

export async function listInvoices(workspaceId = "default") {
  const events = await listBillingEvents(workspaceId);
  return events
    .filter((event) => isInvoiceEvent(event) || isPaidPaymentEvent(event))
    .map((event) => ({
      id: event.id,
      workspaceId: event.workspaceId,
      provider: event.payload.provider || "manual",
      providerEventId: event.payload.providerEventId || null,
      providerSessionId: event.payload.providerSessionId || null,
      providerInvoiceId: event.payload.providerInvoiceId || null,
      providerPaymentId: event.payload.providerPaymentId || null,
      planName: event.payload.planName || null,
      amountCents: event.amountCents,
      currency: event.currency,
      status: invoiceStatus(event),
      invoiceUrl: event.payload.invoiceUrl || null,
      invoicePdf: event.payload.invoicePdf || null,
      createdAt: event.createdAt,
    }));
}

export async function getBillingEvent(workspaceId, eventId) {
  const row = await db
    .prepare("SELECT * FROM billing_events WHERE workspace_id = ? AND id = ?")
    .get(workspaceId, eventId);
  if (!row) return null;
  return billingEventFromRow(row);
}

async function applyPaymentEvent(provider, payload, normalized, extraPayload = {}) {
  if (!normalized.workspaceId) throw new Error("支付事件缺少 workspaceId");

  await recordBillingEvent(normalized.workspaceId, normalized.type, {
    provider,
    providerEventId: normalized.providerEventId,
    providerSessionId: normalized.providerSessionId,
    providerInvoiceId: normalized.providerInvoiceId,
    providerPaymentId: normalized.providerPaymentId,
    providerCustomerId: normalized.providerCustomerId,
    planName: normalized.planName,
    status: normalized.status,
    amountCents: normalized.amountCents,
    currency: normalized.currency,
    invoiceUrl: normalized.invoiceUrl,
    invoicePdf: normalized.invoicePdf,
    ...extraPayload,
    raw: payload,
  });

  if (normalized.status === "paid" && normalized.planName) {
    await changePlan(normalized.workspaceId, normalized.planName, { id: `payment:${provider}` });
  }
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
    .map(billingEventFromRow);
}

function billingEventFromRow(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    type: row.type,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    payload: parsePayload(row.payload),
    createdAt: row.created_at,
  };
}

function parsePayload(payload) {
  return typeof payload === "string" ? JSON.parse(payload) : payload;
}

function countValue(row) {
  return Number(row?.count || 0);
}

async function createProviderCheckout(provider, workspaceId, planName, actor) {
  if (provider === "stripe") return createStripeCheckout(workspaceId, planName, actor);
  if (provider === "lemon") return createLemonCheckout(workspaceId, planName, actor);
  return {
    id: "",
    checkoutUrl: `/admin/billing/manual?plan=${encodeURIComponent(planName)}`,
  };
}

async function createStripeCheckout(workspaceId, planName, actor) {
  const secretKey = requiredEnv("STRIPE_SECRET_KEY", "Stripe checkout 需要 STRIPE_SECRET_KEY");
  const priceId = requiredEnv(`STRIPE_PRICE_${planName.toUpperCase()}`, `Stripe checkout 需要 STRIPE_PRICE_${planName.toUpperCase()}`);
  const appUrl = process.env.PUBLIC_APP_URL || `http://127.0.0.1:${process.env.PORT || 4273}`;
  const params = new URLSearchParams({
    mode: "subscription",
    success_url: `${appUrl}/?billing=success&plan=${encodeURIComponent(planName)}`,
    cancel_url: `${appUrl}/?billing=cancelled&plan=${encodeURIComponent(planName)}`,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "metadata[workspaceId]": workspaceId,
    "metadata[planName]": planName,
    "metadata[actorId]": actor?.id || "",
    client_reference_id: workspaceId,
  });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || `Stripe checkout 失败：HTTP ${response.status}`);
  return { id: body.id, checkoutUrl: body.url };
}

async function createLemonCheckout(workspaceId, planName, actor) {
  const apiKey = requiredEnv("LEMON_API_KEY", "Lemon Squeezy checkout 需要 LEMON_API_KEY");
  const storeId = requiredEnv("LEMON_STORE_ID", "Lemon Squeezy checkout 需要 LEMON_STORE_ID");
  const variantId = requiredEnv(`LEMON_VARIANT_${planName.toUpperCase()}`, `Lemon Squeezy checkout 需要 LEMON_VARIANT_${planName.toUpperCase()}`);
  const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: "application/vnd.api+json",
      "content-type": "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            custom: {
              workspaceId,
              planName,
              actorId: actor?.id || "",
            },
          },
        },
        relationships: {
          store: { data: { type: "stores", id: storeId } },
          variant: { data: { type: "variants", id: variantId } },
        },
      },
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.errors?.[0]?.detail || `Lemon Squeezy checkout 失败：HTTP ${response.status}`);
  return { id: body.data?.id, checkoutUrl: body.data?.attributes?.url };
}

function parseAndVerifyWebhook(provider, rawBody, headers) {
  if (provider === "stripe") {
    verifyStripeSignature(rawBody, header(headers, "stripe-signature"));
  }
  if (provider === "lemon") {
    verifyHmacSignature(rawBody, header(headers, "x-signature"), requiredEnv("LEMON_WEBHOOK_SECRET", "Lemon webhook 需要 LEMON_WEBHOOK_SECRET"));
  }
  return rawBody ? JSON.parse(rawBody) : {};
}

function verifyStripeSignature(rawBody, signatureHeader) {
  const secret = requiredEnv("STRIPE_WEBHOOK_SECRET", "Stripe webhook 需要 STRIPE_WEBHOOK_SECRET");
  const parts = Object.fromEntries(String(signatureHeader || "").split(",").map((part) => part.split("=")));
  if (!parts.t || !parts.v1) throw new Error("Stripe webhook 签名缺失");
  verifyHmacSignature(`${parts.t}.${rawBody}`, parts.v1, secret);
}

function verifyHmacSignature(payload, signature, secret) {
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const actual = String(signature || "");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("支付 webhook 签名校验失败");
  }
}

function normalizePaymentEvent(provider, payload) {
  if (provider === "stripe") {
    const object = payload.data?.object || {};
    const metadata = stripeMetadata(object);
    const status = stripeStatus(payload.type, object);
    return {
      providerEventId: payload.id,
      providerSessionId: object.id,
      providerInvoiceId: object.object === "invoice" ? object.id : object.invoice,
      providerPaymentId: object.payment_intent || object.charge || object.latest_charge || object.id,
      providerCustomerId: object.customer || object.customer_id,
      type: `payment.${payload.type || "stripe"}`,
      workspaceId: metadata.workspaceId || object.client_reference_id,
      planName: metadata.planName,
      status,
      amountCents: object.amount_total || object.amount_paid || object.amount_due || object.amount_refunded || object.amount || 0,
      currency: String(object.currency || "USD").toUpperCase(),
      invoiceUrl: object.hosted_invoice_url || object.receipt_url || null,
      invoicePdf: object.invoice_pdf || null,
    };
  }
  if (provider === "lemon") {
    const attributes = payload.data?.attributes || {};
    const custom = attributes.custom_data || attributes.first_order_item?.custom_data || {};
    return {
      providerEventId: payload.meta?.event_id || payload.data?.id,
      providerSessionId: payload.data?.id,
      providerInvoiceId: attributes.order_number || payload.data?.id,
      providerPaymentId: attributes.identifier || payload.data?.id,
      providerCustomerId: attributes.customer_id,
      type: `payment.${payload.meta?.event_name || "lemon"}`,
      workspaceId: custom.workspaceId,
      planName: custom.planName,
      status: lemonStatus(payload.meta?.event_name),
      amountCents: attributes.total || attributes.refunded_amount || 0,
      currency: attributes.currency || "USD",
      invoiceUrl: attributes.urls?.receipt || attributes.receipt_url || null,
      invoicePdf: null,
    };
  }
  throw new Error(`不支持的支付 provider：${provider}`);
}

function stripeMetadata(object) {
  return {
    ...(object.metadata || {}),
    ...(object.subscription_details?.metadata || {}),
    ...(object.lines?.data?.[0]?.metadata || {}),
  };
}

function stripeStatus(type, object) {
  if (type === "checkout.session.completed") return "paid";
  if (type === "invoice.paid" || type === "invoice.payment_succeeded") return "paid";
  if (type === "invoice.payment_failed") return "failed";
  if (type === "charge.refunded" || type === "refund.succeeded") return "refunded";
  return object.payment_status || object.status || "recorded";
}

function lemonStatus(eventName = "") {
  if (String(eventName).includes("order_created")) return "paid";
  if (String(eventName).includes("subscription_payment_success")) return "paid";
  if (String(eventName).includes("refund")) return "refunded";
  return "recorded";
}

function isInvoiceEvent(event) {
  return event.type.includes("invoice") || Boolean(event.payload.invoiceUrl || event.payload.invoicePdf || event.payload.providerInvoiceId);
}

function isPaidPaymentEvent(event) {
  return event.status === "paid" && event.amountCents > 0;
}

function invoiceStatus(event) {
  if (event.status === "paid") return "paid";
  if (event.status === "failed") return "failed";
  if (event.status === "refunded") return "refunded";
  return event.payload.status || event.status;
}

async function createStripeRefund({ sourceEvent, amountCents, reason }) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const paymentIntent = sourceEvent?.payload?.providerPaymentId || sourceEvent?.payload?.raw?.data?.object?.payment_intent;
  const charge = sourceEvent?.payload?.raw?.data?.object?.charge || sourceEvent?.payload?.raw?.data?.object?.id;
  if (!secretKey || (!paymentIntent && !charge)) {
    return createManualRefund({ provider: "stripe", sourceEvent, amountCents, reason, status: "pending" });
  }
  const params = new URLSearchParams({
    reason,
  });
  if (amountCents > 0) params.set("amount", String(amountCents));
  if (paymentIntent) params.set("payment_intent", paymentIntent);
  else params.set("charge", charge);
  const response = await fetch("https://api.stripe.com/v1/refunds", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || `Stripe refund 失败：HTTP ${response.status}`);
  return {
    id: body.id,
    type: "refund.created",
    status: body.status || "pending",
    amountCents: body.amount || amountCents,
    currency: String(body.currency || sourceEvent?.currency || "USD").toUpperCase(),
    raw: body,
  };
}

async function createManualRefund({ provider, sourceEvent, amountCents, reason, status = "recorded" }) {
  return {
    id: `refund-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    type: "refund.created",
    status,
    amountCents,
    currency: sourceEvent?.currency || "USD",
    raw: {
      provider,
      reason,
      sourceBillingEventId: sourceEvent?.id || null,
      note: "未配置 provider API 或 provider 暂不支持自动退款，已记录人工退款单。",
    },
  };
}

function header(headers, name) {
  return headers[name] || headers[name.toLowerCase()];
}

function requiredEnv(name, message) {
  const value = process.env[name];
  if (!value) throw new Error(message);
  return value;
}
