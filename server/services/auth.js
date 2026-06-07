import { createHash, randomBytes } from "node:crypto";
import { db } from "./db.js";
import { hashPassword, verifyPassword } from "../lib/secret.js";
import { assertWithinLimit, getWorkspacePlanLimit } from "./billing.js";

export async function ensureBootstrapAdmin() {
  const count = (await db.prepare("SELECT COUNT(*) AS count FROM users").get()).count;
  if (count > 0) return;

  const email = process.env.ADMIN_EMAIL || "admin@example.local";
  const password = process.env.ADMIN_PASSWORD || "admin123456";
  await createUser({
    email,
    name: "Administrator",
    role: "admin",
    password,
  });
}

export async function createUser({ email, name, role = "admin", password, workspaceId = "default" }) {
  if (!email || !String(email).includes("@")) throw new Error("邮箱格式不正确");
  if (!password || String(password).length < 8) throw new Error("密码至少需要 8 位");
  if (!["admin", "operator", "viewer"].includes(role)) throw new Error("角色不正确");
  if (!(await workspaceExists(workspaceId))) throw new Error("Workspace 不存在");
  await assertWithinLimit(workspaceId, "users");
  const id = `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const user = {
    id,
    workspaceId,
    email: String(email).trim().toLowerCase(),
    name: String(name || email).trim(),
    role,
    enabled: true,
  };
  await db.prepare(`
    INSERT INTO users (id, workspace_id, email, name, role, password_hash, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(id, user.workspaceId, user.email, user.name, role, hashPassword(password));
  return user;
}

export async function inviteUser({ email, name, role = "viewer", workspaceId = "default" }) {
  if (!email || !String(email).includes("@")) throw new Error("邮箱格式不正确");
  if (!["admin", "operator", "viewer"].includes(role)) throw new Error("角色不正确");
  if (!(await workspaceExists(workspaceId))) throw new Error("Workspace 不存在");
  await assertWithinLimit(workspaceId, "users");
  const pendingCount = (await db
    .prepare("SELECT COUNT(*) AS count FROM invitations WHERE workspace_id = ? AND status = 'pending' AND expires_at > ?")
    .get(workspaceId, new Date().toISOString())).count;
  const activeCount = (await db.prepare("SELECT COUNT(*) AS count FROM users WHERE workspace_id = ?").get(workspaceId)).count;
  const plan = await getWorkspacePlanLimit(workspaceId, "users");
  if (activeCount + pendingCount >= plan) throw new Error(`当前套餐最多允许 ${plan} 个用户`);
  const token = randomBytes(24).toString("base64url");
  const normalizedEmail = String(email).trim().toLowerCase();
  const invitation = {
    id: `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    workspaceId,
    email: normalizedEmail,
    name: String(name || email).trim(),
    role,
    inviteToken: token,
    inviteUrl: `/invite?token=${encodeURIComponent(token)}`,
    expiresAt: new Date(Date.now() + Number(process.env.INVITE_TTL_HOURS || 72) * 60 * 60 * 1000).toISOString(),
    status: "pending",
  };
  await db.prepare(`
    INSERT INTO invitations (id, workspace_id, email, name, role, token_hash, status, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(invitation.id, workspaceId, normalizedEmail, invitation.name, role, hashToken(token), invitation.expiresAt);
  return invitation;
}

export async function acceptInvitation({ token, password }) {
  if (!token) throw new Error("邀请 token 不能为空");
  if (!password || String(password).length < 8) throw new Error("密码至少需要 8 位");
  const row = await db.prepare("SELECT * FROM invitations WHERE token_hash = ?").get(hashToken(token));
  if (!row || row.status !== "pending") throw new Error("邀请不存在或已失效");
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await db.prepare("UPDATE invitations SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);
    throw new Error("邀请已过期");
  }
  const user = await createUser({
    email: row.email,
    name: row.name,
    role: row.role,
    password,
    workspaceId: row.workspace_id,
  });
  await db.prepare(`
    UPDATE invitations
    SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(row.id);
  return {
    ...user,
    invitationId: row.id,
  };
}

export async function listInvitations(workspaceId = "default") {
  return (await db
    .prepare("SELECT id, workspace_id, email, name, role, status, expires_at, accepted_at, created_at FROM invitations WHERE workspace_id = ? ORDER BY created_at DESC")
    .all(workspaceId))
    .map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      createdAt: row.created_at,
    }));
}

export async function login({ email, password }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  await assertNotLocked(normalizedEmail);
  const row = await db.prepare("SELECT * FROM users WHERE email = ? AND enabled = TRUE").get(normalizedEmail);
  if (!row || !verifyPassword(password, row.password_hash)) {
    await recordFailedLogin(normalizedEmail);
    throw new Error("邮箱或密码不正确");
  }
  await clearFailedLogin(normalizedEmail);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  await db.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  `).run(tokenHash, row.id, expiresAt);
  return {
    token,
    user: publicUser(row),
    expiresAt,
  };
}

export async function getUserByToken(token) {
  if (!token) return null;
  const row = await db
    .prepare(`
      SELECT users.* FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.enabled = TRUE
    `)
    .get(hashToken(token), new Date().toISOString());
  return row ? publicUser(row) : null;
}

export async function logout(token) {
  if (!token) return;
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

export async function listUsers(workspaceId = "default") {
  return (await db
    .prepare("SELECT id, workspace_id, email, name, role, enabled, created_at, updated_at FROM users WHERE workspace_id = ? ORDER BY created_at DESC")
    .all(workspaceId))
    .map(publicUser);
}

export async function listWorkspaces() {
  return (await db
    .prepare("SELECT id, name, plan, enabled, created_at, updated_at FROM workspaces ORDER BY created_at DESC")
    .all())
    .map((row) => ({
      id: row.id,
      name: row.name,
      plan: row.plan,
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
}

export async function createWorkspace({ name, plan = "starter" }) {
  if (!name) throw new Error("Workspace 名称不能为空");
  if (!["starter", "team", "business"].includes(plan)) throw new Error("套餐不正确");
  const id = `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  await db.prepare(`
    INSERT INTO workspaces (id, name, plan, enabled, created_at, updated_at)
    VALUES (?, ?, ?, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(id, String(name).trim(), plan);
  return { id, name: String(name).trim(), plan, enabled: true };
}

export async function workspaceExists(workspaceId) {
  return Boolean(await db.prepare("SELECT id FROM workspaces WHERE id = ? AND enabled = TRUE").get(workspaceId));
}

export async function updateUserWorkspace(userId, workspaceId) {
  if (!(await workspaceExists(workspaceId))) throw new Error("Workspace 不存在");
  await db.prepare("UPDATE users SET workspace_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(workspaceId, userId);
}

export async function updateUser(id, patch, { workspaceId = "default", platformAdmin = false } = {}) {
  const row = await db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!row) throw new Error("用户不存在");
  if (!platformAdmin && (row.workspace_id || "default") !== workspaceId) {
    throw new Error("用户不存在");
  }

  const role = patch.role === undefined ? row.role : String(patch.role);
  if (!["admin", "operator", "viewer"].includes(role)) throw new Error("角色不正确");
  const enabled = patch.enabled === undefined ? Boolean(row.enabled) : Boolean(patch.enabled);
  const name = patch.name === undefined ? row.name : String(patch.name || row.name).trim();
  const nextWorkspaceId = platformAdmin && patch.workspaceId !== undefined
    ? String(patch.workspaceId || "default")
    : row.workspace_id || "default";
  if (nextWorkspaceId !== (row.workspace_id || "default")) {
    if (!(await workspaceExists(nextWorkspaceId))) throw new Error("Workspace 不存在");
    await assertWithinLimit(nextWorkspaceId, "users");
  }

  await db.prepare(`
    UPDATE users
    SET name = ?, workspace_id = ?, role = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name, nextWorkspaceId, role, Boolean(enabled), id);

  if (patch.password) {
    if (String(patch.password).length < 8) throw new Error("密码至少需要 8 位");
    await db.prepare(`
      UPDATE users
      SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(hashPassword(patch.password), id);
    await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  }

  return publicUser(await db.prepare("SELECT * FROM users WHERE id = ?").get(id));
}

export async function changeOwnPassword(userId, { oldPassword, newPassword }) {
  const row = await db.prepare("SELECT * FROM users WHERE id = ? AND enabled = TRUE").get(userId);
  if (!row || !verifyPassword(oldPassword, row.password_hash)) {
    throw new Error("原密码不正确");
  }
  if (!newPassword || String(newPassword).length < 8) throw new Error("新密码至少需要 8 位");
  await db.prepare(`
    UPDATE users
    SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(hashPassword(newPassword), userId);
  await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  return { ok: true };
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function publicUser(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id || "default",
    email: row.email,
    name: row.name,
    role: row.role,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertNotLocked(email) {
  const row = await db.prepare("SELECT * FROM login_attempts WHERE email = ?").get(email);
  if (!row?.locked_until) return;
  if (new Date(row.locked_until).getTime() > Date.now()) {
    throw new Error("登录失败次数过多，请稍后再试");
  }
}

async function recordFailedLogin(email) {
  const current = await db.prepare("SELECT * FROM login_attempts WHERE email = ?").get(email);
  const failedCount = Number(current?.failed_count || 0) + 1;
  const max = Number(process.env.LOGIN_MAX_FAILURES || 5);
  const lockMinutes = Number(process.env.LOGIN_LOCK_MINUTES || 15);
  const lockedUntil = failedCount >= max ? new Date(Date.now() + lockMinutes * 60 * 1000).toISOString() : null;
  await db.prepare(`
    INSERT OR REPLACE INTO login_attempts (email, failed_count, locked_until, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  `).run(email, failedCount, lockedUntil);
}

async function clearFailedLogin(email) {
  await db.prepare("DELETE FROM login_attempts WHERE email = ?").run(email);
}

await ensureBootstrapAdmin();
