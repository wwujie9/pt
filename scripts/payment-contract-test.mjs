import { createHmac } from "node:crypto";

const baseUrl = process.env.APP_URL || "http://127.0.0.1:4273";
const workspaceId = process.env.PAYMENT_CONTRACT_WORKSPACE_ID || "default";
const planName = process.env.PAYMENT_CONTRACT_PLAN || "team";
const stripeSecret = process.env.STRIPE_WEBHOOK_SECRET || "whsec_contract_test";
const lemonSecret = process.env.LEMON_WEBHOOK_SECRET || "lemon_contract_test";
const adminEmail = process.env.ADMIN_EMAIL || "admin@example.local";
const adminPassword = process.env.ADMIN_PASSWORD || "admin123456";

let failed = false;
let stripeInvoiceEventId = "";

await step("Stripe webhook 签名正确时被接受", async () => {
  const body = JSON.stringify({
    id: `evt_contract_${Date.now()}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_contract_${Date.now()}`,
        client_reference_id: workspaceId,
        metadata: { workspaceId, planName },
        payment_status: "paid",
        amount_total: 1200,
        currency: "usd",
      },
    },
  });
  const t = Math.floor(Date.now() / 1000);
  const v1 = hmacHex(stripeSecret, `${t}.${body}`);
  const payload = await post("/api/billing/webhooks/stripe", body, {
    "stripe-signature": `t=${t},v1=${v1}`,
  });
  assert(payload.ok && payload.event.status === "paid", "Stripe webhook 未返回 paid");
});

await step("Stripe invoice webhook 生成可查询发票", async () => {
  const body = JSON.stringify({
    id: `evt_invoice_${Date.now()}`,
    type: "invoice.paid",
    data: {
      object: {
        id: `in_contract_${Date.now()}`,
        object: "invoice",
        customer: "cus_contract",
        payment_intent: "pi_contract",
        metadata: { workspaceId, planName },
        subscription_details: { metadata: { workspaceId, planName } },
        status: "paid",
        amount_paid: 2400,
        currency: "usd",
        hosted_invoice_url: "https://billing.example.local/invoice",
        invoice_pdf: "https://billing.example.local/invoice.pdf",
      },
    },
  });
  const t = Math.floor(Date.now() / 1000);
  const v1 = hmacHex(stripeSecret, `${t}.${body}`);
  const payload = await post("/api/billing/webhooks/stripe", body, {
    "stripe-signature": `t=${t},v1=${v1}`,
  });
  stripeInvoiceEventId = await latestBillingEventId(payload.event.providerEventId);
  assert(payload.ok && payload.event.status === "paid", "Stripe invoice webhook 未返回 paid");
});

await step("Stripe webhook 错误签名被拒绝", async () => {
  const status = await statusOnly("/api/billing/webhooks/stripe", JSON.stringify({ id: "evt_bad" }), {
    "stripe-signature": "t=1,v1=bad",
  });
  assert(status === 400, `错误签名未被拒绝，HTTP ${status}`);
});

await step("Lemon webhook 签名正确时被接受", async () => {
  const body = JSON.stringify({
    meta: {
      event_id: `lem_evt_${Date.now()}`,
      event_name: "order_created",
    },
    data: {
      id: `lem_order_${Date.now()}`,
      attributes: {
        total: 1200,
        currency: "USD",
        custom_data: { workspaceId, planName },
      },
    },
  });
  const signature = hmacHex(lemonSecret, body);
  const payload = await post("/api/billing/webhooks/lemon", body, {
    "x-signature": signature,
  });
  assert(payload.ok && payload.event.status === "paid", "Lemon webhook 未返回 paid");
});

await step("Lemon webhook 错误签名被拒绝", async () => {
  const status = await statusOnly("/api/billing/webhooks/lemon", JSON.stringify({ id: "lem_bad" }), {
    "x-signature": "bad",
  });
  assert(status === 400, `错误签名未被拒绝，HTTP ${status}`);
});

await step("账单运营 API 支持发票、重放和退款记录", async () => {
  const token = await login();
  const invoices = await get("/api/billing/invoices", { token, workspaceId });
  assert(invoices.some((invoice) => invoice.providerEventId && invoice.invoiceUrl), "发票列表未包含 provider 发票链接");
  assert(stripeInvoiceEventId, "缺少可重放的账单事件 ID");
  const replay = await postJson("/api/billing/webhook-replays", { eventId: stripeInvoiceEventId }, { token, workspaceId });
  assert(replay.ok && replay.event.providerEventId, "webhook 重放失败");
  const refund = await postJson("/api/billing/refunds", {
    billingEventId: stripeInvoiceEventId,
    amountCents: 500,
    reason: "requested_by_customer",
  }, { token, workspaceId });
  assert(refund.ok && refund.refund.status, "退款记录创建失败");
});

if (failed) process.exit(1);

async function post(path, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

async function statusOnly(path, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
  return response.status;
}

async function postJson(path, payload, options = {}) {
  return post(path, JSON.stringify(payload), authHeaders(options));
}

async function get(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: authHeaders(options),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

async function login() {
  const payload = await postJson("/api/auth/login", {
    email: adminEmail,
    password: adminPassword,
  });
  return payload.token;
}

async function latestBillingEventId(providerEventId) {
  const token = await login();
  const events = await get("/api/billing/events", { token, workspaceId });
  return events.find((event) => event.payload?.providerEventId === providerEventId)?.id || "";
}

function authHeaders(options = {}) {
  return {
    "content-type": "application/json",
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    ...(options.workspaceId ? { "x-workspace-id": options.workspaceId } : {}),
  };
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

function hmacHex(secret, value) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
