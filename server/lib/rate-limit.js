import { Socket } from "node:net";

const buckets = new Map();
let redisClient = null;

export async function checkRateLimit(req, url) {
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
  const max = Number(process.env.RATE_LIMIT_MAX || 180);
  const key = `${clientIp(req)}:${url.pathname}`;

  if (process.env.REDIS_URL) {
    try {
      return await checkRedisRateLimit(key, windowMs, max);
    } catch (error) {
      console.warn(`[rate-limit] Redis 不可用，临时回退到进程内限流：${error.message}`);
    }
  }

  const now = Date.now();
  const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count > max) {
    return {
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  return null;
}

async function checkRedisRateLimit(key, windowMs, max) {
  const redis = getRedisClient();
  const redisKey = `pt:rate:${key}`;
  const count = Number(await redis.command(["INCR", redisKey]));
  if (count === 1) {
    await redis.command(["PEXPIRE", redisKey, String(windowMs)]);
  }
  if (count <= max) return null;
  const ttl = Number(await redis.command(["PTTL", redisKey]));
  return { retryAfter: Math.max(1, Math.ceil(ttl / 1000)) };
}

function getRedisClient() {
  if (!redisClient) redisClient = createRedisClient(process.env.REDIS_URL);
  return redisClient;
}

function createRedisClient(urlText) {
  const url = new URL(urlText);
  const socket = new Socket();
  let buffer = Buffer.alloc(0);
  const pending = [];
  const ready = new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    drain();
  });
  socket.on("error", (error) => {
    while (pending.length) pending.shift().reject(error);
  });
  socket.connect(Number(url.port || 6379), url.hostname);

  async function command(parts) {
    await ready;
    if (url.password) {
      await authenticateOnce(url);
    }
    return rawCommand(parts);
  }

  function rawCommand(parts) {
    return new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
      socket.write(serialize(parts));
    });
  }

  let authenticated = false;
  async function authenticateOnce(redisUrl) {
    if (authenticated) return;
    authenticated = true;
    const password = decodeURIComponent(redisUrl.password);
    const username = redisUrl.username ? decodeURIComponent(redisUrl.username) : "";
    await rawCommand(username ? ["AUTH", username, password] : ["AUTH", password]);
  }

  function drain() {
    while (pending.length) {
      const parsed = parseResp(buffer);
      if (!parsed) return;
      buffer = buffer.subarray(parsed.offset);
      const request = pending.shift();
      parsed.error ? request.reject(parsed.error) : request.resolve(parsed.value);
    }
  }

  return { command };
}

function serialize(parts) {
  return `*${parts.length}\r\n${parts.map((part) => {
    const value = String(part);
    return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
  }).join("")}`;
}

function parseResp(buffer) {
  if (!buffer.length) return null;
  const type = String.fromCharCode(buffer[0]);
  const lineEnd = buffer.indexOf("\r\n");
  if (lineEnd === -1) return null;
  const line = buffer.subarray(1, lineEnd).toString("utf8");
  const offset = lineEnd + 2;
  if (type === "+") return { value: line, offset };
  if (type === ":") return { value: Number(line), offset };
  if (type === "-") return { error: new Error(line), offset };
  if (type === "$") {
    const length = Number(line);
    if (length < 0) return { value: null, offset };
    const end = offset + length;
    if (buffer.length < end + 2) return null;
    return { value: buffer.subarray(offset, end).toString("utf8"), offset: end + 2 };
  }
  return { error: new Error(`Unsupported Redis response: ${type}`), offset };
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
}
