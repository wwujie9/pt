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

  if (process.env.EMAIL_WEBHOOK_URL) {
    const response = await fetch(process.env.EMAIL_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
    });
    if (!response.ok) throw new Error(`邮件 webhook 失败：HTTP ${response.status}`);
  } else {
    console.log(`[MAIL:invitation] ${message.to} ${acceptUrl}`);
  }
  return { ok: true, to: invitation.email, acceptUrl };
}
