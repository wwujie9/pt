import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { handleApi } from "./routes/api.js";
import { startScheduler } from "./services/jobs.js";
import { checkRateLimit } from "./lib/rate-limit.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const privateRoots = [
  resolve(root, "storage"),
  resolve(root, "server/config"),
];
const port = Number(process.env.PORT || 4273);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  setSecurityHeaders(res);

  const limited = await checkRateLimit(req, url);
  if (limited) {
    res.writeHead(429, {
      "content-type": "application/json; charset=utf-8",
      "retry-after": String(limited.retryAfter),
    });
    res.end(JSON.stringify({ error: "请求过于频繁", retryAfter: limited.retryAfter }));
    return;
  }

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    if (url.pathname === "/embed.js") {
      serveEmbedScript(req, res, url);
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error.message }));
  }
}).listen(port, () => {
  console.log(`PT Resource Hub running at http://127.0.0.1:${port}`);
  startScheduler();
});

async function serveStatic(pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = resolve(join(root, safePath));

  if (!filePath.startsWith(root) || privateRoots.some((privateRoot) => filePath === privateRoot || filePath.startsWith(`${privateRoot}\\`) || filePath.startsWith(`${privateRoot}/`))) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
    res.writeHead(200, {
      "content-type": mime[extname(filePath)] || "application/octet-stream",
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

function setSecurityHeaders(res) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("cross-origin-resource-policy", "same-origin");
  res.setHeader("content-security-policy", "default-src 'self' https://image.tmdb.org; img-src 'self' https://image.tmdb.org data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'");
}

function serveEmbedScript(req, res, url) {
  const origin = `${url.protocol}//${req.headers.host}`;
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("cross-origin-resource-policy", "cross-origin");
  res.writeHead(200, {
    "content-type": "text/javascript; charset=utf-8",
    "cache-control": "public, max-age=300",
  });
  res.end(`
(function () {
  var script = document.currentScript;
  var apiBase = ${JSON.stringify(origin)};
  var params = new URLSearchParams(script && script.src ? new URL(script.src).search : "");
  var workspaceId = params.get("workspaceId") || "default";
  var limit = params.get("limit") || "6";
  var campaign = params.get("utm_campaign") || new URLSearchParams(location.search).get("utm_campaign") || "embedded";
  var mount = document.createElement("section");
  mount.className = "pt-resource-hub-widget";
  mount.innerHTML = '<div class="pt-widget-loading">正在加载资源...</div>';
  script.parentNode.insertBefore(mount, script.nextSibling);
  var style = document.createElement("style");
  style.textContent = ".pt-resource-hub-widget{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;border:1px solid #dce2ea;border-radius:8px;background:#fff;color:#18202f;overflow:hidden}.pt-resource-hub-widget a{text-decoration:none;color:inherit}.pt-widget-head{display:flex;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid #dce2ea;background:#f8fafc}.pt-widget-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;padding:12px}.pt-widget-card{display:grid;gap:8px}.pt-widget-card img{width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:6px;background:#eef2f7}.pt-widget-card strong{font-size:14px}.pt-widget-card span,.pt-widget-ad span,.pt-widget-loading{color:#647084;font-size:12px;line-height:1.5}.pt-widget-ad{margin:0 12px 12px;padding:12px;border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff}.pt-widget-ad strong{display:block;color:#2563eb;margin-bottom:4px}";
  document.head.appendChild(style);
  trackVisit();
  fetch(apiBase + "/api/public/catalog?workspaceId=" + encodeURIComponent(workspaceId) + "&limit=" + encodeURIComponent(limit))
    .then(function (res) { return res.json(); })
    .then(function (payload) { render(payload); })
    .catch(function () { mount.innerHTML = '<div class="pt-widget-loading">资源暂时不可用</div>'; });

  function render(payload) {
    var cards = (payload.items || []).map(function (item) {
      var href = apiBase + "/" + item.href;
      return '<a class="pt-widget-card" target="_blank" rel="noreferrer" href="' + escapeHtml(href) + '">' +
        '<img src="' + escapeHtml(item.poster || "") + '" alt="">' +
        '<strong>' + escapeHtml(item.title) + '</strong>' +
        '<span>' + escapeHtml(item.year || "") + ' · 资源 ' + escapeHtml(item.resourceCount || 0) + '</span>' +
      '</a>';
    }).join("");
    var ad = payload.ad ? '<a class="pt-widget-ad" target="_blank" rel="noreferrer" data-ad-id="' + escapeHtml(payload.ad.id) + '" href="' + escapeHtml(absolute(payload.ad.targetUrl || "/")) + '"><strong>' + escapeHtml(payload.ad.title) + '</strong><span>' + escapeHtml(payload.ad.body || "") + '</span></a>' : "";
    mount.innerHTML = '<div class="pt-widget-head"><strong>影源资源榜</strong><span>免费试用期</span></div><div class="pt-widget-grid">' + cards + '</div>' + ad;
    if (payload.ad) {
      trackAd(payload.ad.id, "impression");
      mount.querySelector("[data-ad-id]")?.addEventListener("click", function () { trackAd(payload.ad.id, "click"); });
    }
  }

  function trackVisit() {
    post("/api/growth/visit", {
      workspaceId: workspaceId,
      sourceSite: location.host,
      referrer: document.referrer,
      landingPath: location.pathname + location.search,
      utmCampaign: campaign,
      utmSource: new URLSearchParams(location.search).get("utm_source") || location.host,
      utmMedium: new URLSearchParams(location.search).get("utm_medium") || "embed",
      title: document.title,
      userAgent: navigator.userAgent
    });
  }

  function trackAd(id, eventType) {
    post("/api/public/ads/events", {
      workspaceId: workspaceId,
      placementId: id,
      eventType: eventType,
      sourceSite: location.host,
      utmCampaign: campaign
    });
  }

  function post(path, body) {
    try {
      fetch(apiBase + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true });
    } catch (_) {}
  }

  function absolute(href) {
    try { return new URL(href, apiBase + "/").toString(); } catch (_) { return apiBase + "/"; }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }
})();`);
}
