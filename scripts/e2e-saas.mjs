const baseUrl = process.env.APP_URL || "http://127.0.0.1:4273";
const adminEmail = process.env.E2E_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "admin@example.local";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "admin123456";

const runId = Date.now().toString(36);
const workspaceName = `E2E SaaS ${runId}`;

let failed = false;

const admin = await request("/api/auth/login", {
  method: "POST",
  body: {
    email: adminEmail,
    password: adminPassword,
  },
});
const token = admin.token;

await step("登录管理员", () => assert(token, "未取得登录 token"));

const plans = await request("/api/billing/plans", { token });
await step("读取套餐配置", () => {
  assert(Array.isArray(plans) && plans.length >= 3, "套餐列表不完整");
});

const workspace = await request("/api/workspaces", {
  method: "POST",
  token,
  body: {
    name: workspaceName,
    plan: "starter",
  },
});
await step("创建 workspace", () => {
  assert(workspace.id, "workspace 缺少 id");
  assert(workspace.plan === "starter", "workspace 套餐不正确");
});

const isolatedSources = await request("/api/sources", {
  token,
  workspaceId: workspace.id,
});
const isolatedMedia = await request("/api/media", {
  token,
  workspaceId: workspace.id,
});
await step("验证新 workspace 初始数据隔离", () => {
  assert(Array.isArray(isolatedSources) && isolatedSources.length === 0, "新 workspace 不应继承默认来源");
  assert(Array.isArray(isolatedMedia) && isolatedMedia.length === 0, "新 workspace 不应继承默认媒体");
});

let invalidWorkspaceStatus = 0;
try {
  await request("/api/sources", {
    method: "POST",
    token,
    workspaceId: `missing-${runId}`,
    body: {
      id: "ghost-source",
      name: "Ghost Source",
      type: "internal",
      enabled: true,
    },
  });
} catch (error) {
  invalidWorkspaceStatus = error.status;
}
await step("拒绝不存在 workspace 的写入", () => {
  assert(invalidWorkspaceStatus === 400, `无效 workspace 未被拒绝，HTTP ${invalidWorkspaceStatus || "none"}`);
});

const anonymousMediaStatus = await statusOnly("/api/media");
await step("生产模式匿名读取被拒绝", () => {
  assert(anonymousMediaStatus === 401, `匿名读取未被拒绝，HTTP ${anonymousMediaStatus}`);
});

for (const index of [1, 2, 3]) {
  await request("/api/sources", {
    method: "POST",
    token,
    workspaceId: workspace.id,
    body: {
      id: `e2e-source-${index}`,
      name: `E2E Source ${index}`,
      type: "internal",
      enabled: true,
      weight: 1,
    },
  });
}
await step("写入 starter 来源上限内数据", async () => {
  const sources = await request("/api/sources", { token, workspaceId: workspace.id });
  assert(sources.length === 3, `期望 3 个来源，实际 ${sources.length}`);
});

await step("管理员 header 可切换 workspace 读取隔离数据", async () => {
  const sources = await request("/api/sources", { token, workspaceId: workspace.id });
  assert(sources.every((source) => source.id.startsWith("e2e-source-")), "读取到了其它 workspace 的来源");
});

let limitStatus = 0;
try {
  await request("/api/sources", {
    method: "POST",
    token,
    workspaceId: workspace.id,
    body: {
      id: "e2e-source-over-limit",
      name: "E2E Over Limit",
      type: "internal",
      enabled: true,
      weight: 1,
    },
  });
} catch (error) {
  limitStatus = error.status;
}
await step("验证套餐来源数量限制", () => {
  assert(limitStatus === 400, `套餐限制未生效，HTTP ${limitStatus || "none"}`);
});

const invite = await request("/api/invitations", {
  method: "POST",
  token,
  body: {
    email: `viewer-${runId}@example.local`,
    name: "E2E Viewer",
    role: "viewer",
    workspaceId: workspace.id,
  },
});
await step("邀请用户并绑定 workspace", () => {
  assert(invite.email.includes(runId), "邀请邮箱不正确");
  assert(invite.workspaceId === workspace.id, "邀请用户未绑定 workspace");
  assert(invite.inviteToken, "邀请 token 缺失");
});

const accepted = await request("/api/invitations/accept", {
  method: "POST",
  body: {
    token: invite.inviteToken,
    password: `Invite-${runId}`,
  },
});
await step("接受一次性邀请并创建用户", () => {
  assert(accepted.ok, "接受邀请失败");
  assert(accepted.user.workspaceId === workspace.id, "接受邀请创建到了错误 workspace");
});

let reusedInviteStatus = 0;
try {
  await request("/api/invitations/accept", {
    method: "POST",
    body: {
      token: invite.inviteToken,
      password: `Invite-${runId}`,
    },
  });
} catch (error) {
  reusedInviteStatus = error.status;
}
await step("邀请 token 只能使用一次", () => {
  assert(reusedInviteStatus === 400, `重复使用邀请未被拒绝，HTTP ${reusedInviteStatus || "none"}`);
});

const billing = await request("/api/billing/current", { token, workspaceId: workspace.id });
await step("读取账单用量", () => {
  assert(billing.usage.users >= 1, "账单用量未统计用户");
  assert(billing.usage.sources === 3, "账单用量未统计来源");
});

const client = await request("/api/download-clients", {
  method: "POST",
  token,
  workspaceId: workspace.id,
  body: {
    id: "e2e-qb",
    name: "E2E qBittorrent",
    type: "qbittorrent",
    baseUrl,
    username: "demo",
    password: "demo-password",
    enabled: true,
  },
});
await step("创建下载器配置", () => {
  assert(client.id === "e2e-qb", "下载器 id 不正确");
  assert(client.password !== "demo-password" && String(client.password).includes("***"), "下载器密码未脱敏");
});

const clientTest = await request(`/api/download-clients/${client.id}/test`, {
  method: "POST",
  token,
  workspaceId: workspace.id,
});
await step("测试下载器连通性", () => {
  assert(clientTest.ok, clientTest.message || "下载器不可达");
});

const task = await request("/api/tasks", {
  method: "POST",
  token,
  workspaceId: workspace.id,
  body: {
    title: "E2E Download Task",
    clientId: client.id,
  },
});
const rerun = await request(`/api/tasks/${task.id}/rerun`, {
  method: "POST",
  token,
  workspaceId: workspace.id,
});
await step("创建并重跑任务队列项", () => {
  assert(task.id, "任务 id 缺失");
  assert(rerun.status === "queued", "重跑任务未进入 queued 状态");
});

await request("/api/billing/checkout", {
  method: "POST",
  token,
  workspaceId: workspace.id,
  body: { plan: "team" },
});
await step("创建套餐 checkout 会话", async () => {
  const events = await request("/api/billing/events", { token, workspaceId: workspace.id });
  assert(events.some((event) => event.type === "checkout.created"), "未记录 checkout 事件");
});

const changedPlan = await request("/api/billing/plan", {
  method: "POST",
  token,
  workspaceId: workspace.id,
  body: { plan: "team" },
});
await step("变更套餐并记录用量策略", () => {
  assert(changedPlan.name === "team", "套餐未切换为 team");
});

const storageStatus = await statusOnly("/storage/app.db");
await step("静态服务禁止下载 storage", () => {
  assert(storageStatus === 403, `storage 未被禁止访问，HTTP ${storageStatus}`);
});

const workspaceBackup = await request("/api/backup", {
  token,
  workspaceId: workspace.id,
});
await step("导出 workspace 级备份", () => {
  assert(workspaceBackup.workspaceId === workspace.id, "备份 workspace_id 不正确");
  assert(workspaceBackup.sources.length === 3, "备份未按 workspace 隔离来源");
});

if (failed) {
  process.exit(1);
}

async function step(name, fn) {
  try {
    await fn();
    console.log(`[OK] ${name}`);
  } catch (error) {
    failed = true;
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

async function request(path, { method = "GET", token: bearer, workspaceId, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(workspaceId ? { "x-workspace-id": workspaceId } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(payload.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function statusOnly(path) {
  const response = await fetch(`${baseUrl}${path}`);
  return response.status;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
