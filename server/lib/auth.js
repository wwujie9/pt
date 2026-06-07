import { getUserByToken } from "../services/auth.js";

export async function getAuthContext(req) {
  const auth = req.headers.authorization || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const headerToken = req.headers["x-session-token"] || "";
  const user = await getUserByToken(bearer || headerToken);
  return {
    user,
    isAdminToken: Boolean(process.env.ADMIN_TOKEN && req.headers["x-admin-token"] === process.env.ADMIN_TOKEN),
  };
}

export async function requireAdmin(req) {
  const token = process.env.ADMIN_TOKEN;
  const context = await getAuthContext(req);
  if (context.user?.role === "admin") return null;
  if (process.env.ALLOW_INSECURE_DEV === "1") return null;

  const provided = req.headers["x-admin-token"];
  if (token && provided === token) return null;

  return {
    error: "需要管理员令牌",
  };
}

export function isPlatformAdmin(context) {
  return Boolean(context.isAdminToken || (context.user?.role === "admin" && context.user?.workspaceId === "default"));
}

export async function requirePlatformAdmin(req) {
  const context = await getAuthContext(req);
  if (isPlatformAdmin(context)) return null;
  if (process.env.ALLOW_INSECURE_DEV === "1") return null;
  return {
    error: "需要平台管理员权限",
  };
}

export function hasPermission(user, permission) {
  if (!user) return false;
  const matrix = {
    admin: ["*", "download-client:write"],
    operator: ["source:read", "source:test", "resource:review", "media:sync", "job:run"],
    viewer: ["source:read"],
  };
  const permissions = matrix[user.role] || [];
  return permissions.includes("*") || permissions.includes(permission);
}

export async function requirePermission(req, permission) {
  const context = await getAuthContext(req);
  if (context.isAdminToken) return null;
  if (process.env.ALLOW_INSECURE_DEV === "1") return null;
  if (hasPermission(context.user, permission)) return null;
  return { error: `缺少权限：${permission}` };
}
