export async function notifyEvent(event) {
  const url = process.env.WEBHOOK_URL;
  if (!url) return { skipped: true };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "PT-Resource-Hub/0.1",
    },
    body: JSON.stringify({
      service: "pt-resource-hub",
      event,
      sentAt: new Date().toISOString(),
    }),
  });

  return {
    ok: response.ok,
    status: response.status,
  };
}
