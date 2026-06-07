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

  const limited = checkRateLimit(req, url);
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
