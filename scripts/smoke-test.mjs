const baseUrl = process.env.APP_URL || "http://127.0.0.1:4273";

let token = "";
try {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: process.env.SMOKE_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "admin@example.local",
      password: process.env.SMOKE_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "admin123456",
    }),
  });
  if (response.ok) {
    token = (await response.json()).token;
    console.log("[OK] auth login");
  } else {
    console.log("[WARN] auth login skipped");
  }
} catch {
  console.log("[WARN] auth login skipped");
}

const checks = [
  ["health", "/api/health"],
  ["stats", "/api/stats", true],
  ["media", "/api/media", true],
  ["sources", "/api/sources", true],
  ["sync logs", "/api/sync-logs", true],
  ["review queue", "/api/review/resources", true],
  ["tmdb fallback", "/api/tmdb/search?q=dune", true],
];

let failed = false;

for (const [name, path, protectedRoute] of checks) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: protectedRoute && token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      failed = true;
      console.error(`[FAIL] ${name}: HTTP ${response.status}`);
      continue;
    }
    await response.json();
    console.log(`[OK] ${name}`);
  } catch (error) {
    failed = true;
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

if (failed) {
  process.exit(1);
}
