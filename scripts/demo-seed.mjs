import { db } from "../server/services/db.js";
import { mediaItems } from "../src/data/media.seed.js";
import { resources as seedResources } from "../src/data/resources.seed.js";
import { upsertSource, testSource } from "../server/services/sources.js";
import { inviteUser } from "../server/services/auth.js";
import { listBillingEvents, recordBillingEvent } from "../server/services/billing.js";
import { appendSyncLog, loadSyncLogs, upsertResources } from "../server/services/store.js";
import { runMonitoringCheck } from "../server/services/monitoring.js";

const workspaceId = process.env.DEMO_WORKSPACE_ID || "demo-workspace";
const workspaceName = process.env.DEMO_WORKSPACE_NAME || "Demo Customer Workspace";
const inviteEmail = process.env.DEMO_INVITE_EMAIL || "operator.demo@example.local";
const sourceId = process.env.DEMO_SOURCE_ID || "demo-internal";
const mediaId = process.env.DEMO_MEDIA_ID || "m-001";

await db.withRlsBypass(async () => {
  await ensureWorkspace();
  await seedMedia();
});

await db.withWorkspaceContext(workspaceId, async () => {
  const source = await upsertSource({
    id: sourceId,
    name: "Internal Library",
    type: "internal",
    enabled: true,
    weight: 1,
  }, workspaceId);
  const health = await testSource(source.id, workspaceId);
  const invitation = await ensureInvitation();
  const sync = await seedFirstSync();
  const invoice = await ensureDemoInvoice();
  const monitoring = await runMonitoringCheck();
  console.log(JSON.stringify({
    ok: true,
    workspace: { id: workspaceId, name: workspaceName, plan: "business" },
    source,
    health,
    invitation: { email: invitation.email, status: invitation.status, inviteToken: invitation.inviteToken },
    sync,
    invoice: { id: invoice.id, amountCents: invoice.amountCents, status: invoice.status },
    monitoring: { ok: monitoring.ok, alerts: monitoring.alerts.length },
    next: `http://127.0.0.1:${process.env.PORT || 4273}/#/admin`,
  }, null, 2));
});

await db.close?.();

async function ensureWorkspace() {
  await db.prepare(`
    INSERT INTO workspaces (id, name, plan, enabled, created_at, updated_at)
    VALUES (?, ?, 'business', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, plan = 'business', enabled = TRUE, updated_at = CURRENT_TIMESTAMP
  `).run(workspaceId, workspaceName);
}

async function seedMedia() {
  const insert = db.prepare(`
    INSERT INTO media_items (id, workspace_id, payload, created_at, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE SET workspace_id = EXCLUDED.workspace_id, payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP
  `);
  for (const item of mediaItems) {
    await insert.run(`${workspaceId}:${item.id}`, workspaceId, JSON.stringify(item));
  }
}

async function ensureInvitation() {
  const existing = await db.prepare(`
    SELECT id, workspace_id, email, name, role, status, expires_at, created_at
    FROM invitations
    WHERE workspace_id = ? AND email = ? AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(workspaceId, inviteEmail);
  if (existing) {
    return {
      id: existing.id,
      workspaceId: existing.workspace_id,
      email: existing.email,
      name: existing.name,
      role: existing.role,
      status: existing.status,
      expiresAt: existing.expires_at,
      inviteToken: "(已存在，重新生成请清理该 pending invitation)",
    };
  }
  return inviteUser({
    email: inviteEmail,
    name: "Demo Operator",
    role: "operator",
    workspaceId,
  });
}

async function seedFirstSync() {
  const resources = seedResources
    .filter((resource) => resource.mediaId === mediaId && resource.source === "Internal Library")
    .map((resource) => ({
      ...resource,
      id: `demo-${resource.id}`,
      status: resource.matchScore < 65 ? "review" : "active",
      updatedAt: new Date().toISOString(),
  }));
  await upsertResources(resources, workspaceId);
  const existing = (await loadSyncLogs(workspaceId)).find((log) => log.type === "media-resource-sync" && log.mediaId === mediaId);
  if (existing) return existing;
  return appendSyncLog({
    type: "media-resource-sync",
    status: "success",
    mediaId,
    sourceCount: 1,
    importedCount: resources.length,
    errors: [],
    results: resources.map((resource) => ({ id: resource.id, title: resource.title })),
  }, workspaceId);
}

async function ensureDemoInvoice() {
  const providerEventId = `evt_demo_invoice_${workspaceId}`;
  const existing = (await listBillingEvents(workspaceId)).find((event) => event.payload?.providerEventId === providerEventId);
  if (existing) return existing;
  return recordBillingEvent(workspaceId, "payment.invoice.paid", {
    provider: "stripe",
    providerEventId,
    providerSessionId: `cs_demo_${workspaceId}`,
    providerInvoiceId: `in_demo_${workspaceId}`,
    providerPaymentId: `pi_demo_${workspaceId}`,
    planName: "business",
    status: "paid",
    amountCents: 9900,
    currency: "USD",
    invoiceUrl: "https://billing.example.local/demo/invoice",
    invoicePdf: "https://billing.example.local/demo/invoice.pdf",
    raw: {
      id: providerEventId,
      type: "invoice.paid",
      data: {
        object: {
          id: `in_demo_${workspaceId}`,
          object: "invoice",
          metadata: { workspaceId, planName: "business" },
          status: "paid",
          amount_paid: 9900,
          currency: "usd",
          hosted_invoice_url: "https://billing.example.local/demo/invoice",
          invoice_pdf: "https://billing.example.local/demo/invoice.pdf",
        },
      },
    },
  });
}
