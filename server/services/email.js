export async function sendInvitationEmail(invitation) {
  const appUrl = process.env.PUBLIC_APP_URL || `http://127.0.0.1:${process.env.PORT || 4273}`;
  const acceptUrl = new URL(invitation.inviteUrl, appUrl).toString();
  const message = {
    to: invitation.email,
    subject: "你被邀请加入影源聚合站",
    template: "workspace-invitation",
    data: {
      name: invitation.name,
      role: invitation.role,
      workspaceId: invitation.workspaceId,
      acceptUrl,
      expiresAt: invitation.expiresAt,
    },
  };

  await sendEmail(message);
  return { ok: true, to: invitation.email, acceptUrl };
}

async function sendEmail(message) {
  const provider = process.env.EMAIL_PROVIDER || (process.env.RESEND_API_KEY ? "resend" : process.env.EMAIL_WEBHOOK_URL ? "webhook" : "console");
  if (provider === "resend") return sendResendEmail(message);
  if (provider === "smtp-relay") return sendRelayEmail(message);
  if (provider === "webhook") return sendWebhookEmail(message);
  console.log(`[MAIL:invitation] ${message.to} ${message.data.acceptUrl}`);
  return { ok: true, provider: "console" };
}

async function sendResendEmail(message) {
  const apiKey = requiredEnv("RESEND_API_KEY", "Resend 邮件需要 RESEND_API_KEY");
  const from = requiredEnv("EMAIL_FROM", "Resend 邮件需要 EMAIL_FROM");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      html: renderInvitationHtml(message),
      text: renderInvitationText(message),
    }),
  });
  const body = await safeJson(response);
  if (!response.ok) throw new Error(body.message || `Resend 邮件失败：HTTP ${response.status}`);
  return { ok: true, provider: "resend", id: body.id };
}

async function sendRelayEmail(message) {
  const url = requiredEnv("SMTP_RELAY_URL", "SMTP relay 需要 SMTP_RELAY_URL");
  return postEmail(url, {
    from: process.env.EMAIL_FROM || "",
    to: message.to,
    subject: message.subject,
    html: renderInvitationHtml(message),
    text: renderInvitationText(message),
    template: message.template,
    data: message.data,
  }, "SMTP relay");
}

async function sendWebhookEmail(message) {
  return postEmail(requiredEnv("EMAIL_WEBHOOK_URL", "邮件 webhook 需要 EMAIL_WEBHOOK_URL"), message, "邮件 webhook");
}

async function postEmail(url, payload, label) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`${label} 失败：HTTP ${response.status}`);
  return { ok: true };
}

function renderInvitationHtml(message) {
  const { name, role, workspaceId, acceptUrl, expiresAt } = message.data;
  return `
    <p>${escapeHtml(name)}，你好：</p>
    <p>你被邀请以 <strong>${escapeHtml(role)}</strong> 身份加入 workspace <strong>${escapeHtml(workspaceId)}</strong>。</p>
    <p><a href="${escapeHtml(acceptUrl)}">接受邀请</a></p>
    <p>邀请过期时间：${escapeHtml(expiresAt)}</p>
  `;
}

function renderInvitationText(message) {
  const { name, role, workspaceId, acceptUrl, expiresAt } = message.data;
  return `${name}，你好：\n你被邀请以 ${role} 身份加入 workspace ${workspaceId}。\n接受邀请：${acceptUrl}\n邀请过期时间：${expiresAt}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function requiredEnv(name, message) {
  const value = process.env[name];
  if (!value) throw new Error(message);
  return value;
}
