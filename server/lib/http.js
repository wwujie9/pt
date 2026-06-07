export function json(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

export function notFound(res) {
  json(res, 404, { error: "Not found" });
}

export function badRequest(res, message) {
  json(res, 400, { error: message });
}

export async function readJsonBody(req) {
  const text = await readRawBody(req);
  return text ? JSON.parse(text) : {};
}

export async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8").trim();
}
