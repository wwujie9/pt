import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

const appUrl = process.env.APP_URL || "http://127.0.0.1:4273";
const adminEmail = process.env.ADMIN_EMAIL || "admin@example.local";
let adminPassword = process.env.ADMIN_PASSWORD || "change-me-before-demo";
const postgresUrl = process.env.DOCKER_PROMOTION_DATABASE_URL || "postgres://pt:pt_password@127.0.0.1:5432/pt_resource_hub";

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main() {
  run("启动 Docker 生产栈", "docker", ["compose", "up", "--build", "-d", "postgres", "redis", "pt-resource-hub", "pt-resource-worker"]);
  await waitForHealth();
  adminPassword = await resolveAdminPassword();

  run("准备演示数据", "docker", ["compose", "exec", "-T", "pt-resource-hub", "npm", "run", "demo:seed"]);
  run("生成 PostgreSQL 备份", process.execPath, ["scripts/postgres-backup.mjs"], {
    DATABASE_URL: postgresUrl,
    POSTGRES_CONTAINER: "pt-postgres",
  });
  run("烟测核心 API", process.execPath, ["scripts/smoke-test.mjs"], testEnv());
  run("验证 SaaS 主流程", process.execPath, ["scripts/e2e-saas.mjs"], testEnv({ E2E_ADMIN_EMAIL: adminEmail, E2E_ADMIN_PASSWORD: adminPassword }));
  run("验证支付 sandbox 合同", process.execPath, ["scripts/payment-contract-test.mjs"], testEnv());
  run("检查监控告警面板", "docker", ["compose", "exec", "-T", "-e", "MONITORING_FAIL_ON_ALERT=0", "pt-resource-hub", "npm", "run", "monitoring:check"]);
  await verifyCommercialStrategy();

  console.log(JSON.stringify({
    ok: true,
    appUrl,
    adminEmail,
    passwordHint: "请在真实推广前替换 docker-compose.yml 中的 ADMIN_PASSWORD / ADMIN_TOKEN / CREDENTIAL_SECRET",
    next: `${appUrl}/#/admin`,
  }, null, 2));
}

async function waitForHealth() {
  const deadline = Date.now() + Number(process.env.DOCKER_PROMOTION_TIMEOUT_MS || 120000);
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(`${appUrl}/api/health`);
      if (response.ok) {
        console.log("[OK] Docker app health");
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await sleep(2000);
  }
  throw new Error(`Docker app 未在限定时间内就绪：${lastError}`);
}

async function verifyCommercialStrategy() {
  const login = await post("/api/auth/login", {
    email: adminEmail,
    password: adminPassword,
  });
  const plans = await get("/api/billing/plans", login.token);
  if (!plans.every((plan) => plan.commercial?.trialDays >= 180)) {
    throw new Error("套餐未暴露前半年免费策略");
  }
  const billing = await get("/api/billing/current", login.token, "demo-workspace");
  if (!billing.commercial?.trialActive || billing.commercial?.ads?.enabled !== false) {
    throw new Error("商业策略未按前半年免费、广告暂缓启用生效");
  }
  console.log("[OK] commercial free-first strategy");
}

async function resolveAdminPassword() {
  const candidates = [
    adminPassword,
    "admin123456",
    "change-me-before-demo",
  ].filter((value, index, list) => value && list.indexOf(value) === index);
  for (const password of candidates) {
    try {
      await loginWithPassword(password, 1);
      console.log("[OK] admin login");
      return password;
    } catch {
      // 兼容本地已有 Docker volume 中的旧管理员密码。
    }
  }
  resetComposeAdminPassword(adminPassword);
  await loginWithPassword(adminPassword, 12);
  console.log("[OK] admin password reset for local compose");
  return adminPassword;
}

async function loginWithPassword(password, attempts = 1) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await post("/api/auth/login", {
        email: adminEmail,
        password,
      });
    } catch (error) {
      lastError = error;
      await sleep(1000);
    }
  }
  throw lastError;
}

function resetComposeAdminPassword(password) {
  const passwordHash = hashPassword(password);
  const email = sqlText(adminEmail.toLowerCase());
  const hash = sqlText(passwordHash);
  const sql = `
    UPDATE users
    SET password_hash = ${hash}, enabled = TRUE, role = 'admin', workspace_id = 'default', updated_at = CURRENT_TIMESTAMP
    WHERE email = ${email};
    DELETE FROM login_attempts WHERE email = ${email};
  `;
  run("重置本地 Docker 管理员密码", "docker", ["compose", "exec", "-T", "postgres", "psql", "-U", "pt", "-d", "pt_resource_hub", "-c", sql]);
}

async function get(path, token, workspaceId = "") {
  const response = await fetchWithTimeout(`${appUrl}${path}`, {
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(workspaceId ? { "x-workspace-id": workspaceId } : {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

async function post(path, body) {
  const response = await fetchWithTimeout(`${appUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function run(label, command, args, extraEnv = {}) {
  console.log(`[RUN] ${label}`);
  const executable = process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
  const result = spawnSync(executable, args, {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) throw new Error(`${label} 失败：${command} ${args.join(" ")}`);
}

function testEnv(extra = {}) {
  return {
    APP_URL: appUrl,
    ADMIN_EMAIL: adminEmail,
    ADMIN_PASSWORD: adminPassword,
    SMOKE_ADMIN_EMAIL: adminEmail,
    SMOKE_ADMIN_PASSWORD: adminPassword,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "whsec_test",
    LEMON_WEBHOOK_SECRET: process.env.LEMON_WEBHOOK_SECRET || "lem_test",
    PAYMENT_CONTRACT_WORKSPACE_ID: "default",
    PAYMENT_CONTRACT_PLAN: "team",
    ...extra,
  };
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return `${salt}:${hash}`;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  let timerId;
  const timer = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      controller.abort();
      reject(new Error(`请求超时：${url}`));
    }, Number(process.env.DOCKER_PROMOTION_FETCH_TIMEOUT_MS || 10000));
  });
  const request = fetch(url, { ...options, signal: controller.signal });
  try {
    return await Promise.race([request, timer]);
  } finally {
    clearTimeout(timerId);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
