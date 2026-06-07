import { badRequest, json, notFound, readJsonBody } from "../lib/http.js";
import { getAuthContext, isPlatformAdmin, requireAdmin, requirePermission, requirePlatformAdmin } from "../lib/auth.js";
import { getMedia, getStats, listMedia, listResources } from "../services/catalog.js";
import { loadSyncLogs } from "../services/store.js";
import { exportBackup, loadReviewQueue, updateResourceStatus, upsertMedia } from "../services/store.js";
import {
  deleteSource,
  getSourceCapabilities,
  listSources,
  testSource,
  upsertSource,
} from "../services/sources.js";
import { syncResourcesForMedia } from "../services/sync.js";
import { searchTmdb, tmdbResultToMediaItem } from "../services/tmdb.js";
import { addManualResource } from "../services/manual-resource.js";
import { listAuditLogs, appendAuditLog } from "../services/audit.js";
import {
  changeOwnPassword,
  acceptInvitation,
  createUser,
  createWorkspace,
  inviteUser,
  listInvitations,
  listUsers,
  listWorkspaces,
  login,
  logout,
  updateUser,
  workspaceExists,
} from "../services/auth.js";
import { sendInvitationEmail } from "../services/email.js";
import { runBackupJob, runHealthJob } from "../services/jobs.js";
import { changePlan, createCheckoutSession, getPlan, getUsage, listBillingEvents, listPlans } from "../services/billing.js";
import {
  enqueueDownloadTask,
  listDownloadClients,
  listTasks,
  rerunTask,
  testDownloadClient,
  upsertDownloadClient,
} from "../services/downloads.js";

export async function handleApi(req, res, url) {
  const authContext = await getAuthContext(req);
  const workspaceId = currentWorkspaceId(req, authContext);
  const authError = requireAuthenticated(req, url, authContext);
  if (authError) return json(res, 401, authError);
  if (shouldValidateWorkspace(req, url) && !(await workspaceExists(workspaceId))) {
    return badRequest(res, "Workspace 不存在或已禁用");
  }
  const platformError = needsPlatformAdmin(req, url) ? await requirePlatformAdmin(req) : null;
  if (platformError) return json(res, 403, platformError);
  const permission = requiredPermission(req, url);
  if (permission) {
    const permissionError = await requirePermission(req, permission);
    if (permissionError) return json(res, 403, permissionError);
  } else {
    const adminError = needsAdmin(req, url) ? await requireAdmin(req) : null;
    if (adminError) {
      return json(res, 401, adminError);
    }
  }

  if (req.method === "GET" && url.pathname === "/api/stats") {
    return json(res, 200, await getStats(workspaceId));
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    try {
      const result = await login(await readJsonBody(req));
      await appendAuditLog({
        actor: result.user,
        action: "auth.login",
        targetType: "user",
        targetId: result.user.id,
      });
      return json(res, 200, result);
    } catch (error) {
      return badRequest(res, error.message);
    }
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = getBearerToken(req);
    await logout(token);
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    return json(res, 200, {
      user: authContext.user,
      adminToken: authContext.isAdminToken,
    });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/change-password") {
    if (!authContext.user) return json(res, 401, { error: "需要登录" });
    try {
      const result = await changeOwnPassword(authContext.user.id, await readJsonBody(req));
      await appendAuditLog({
        actor: authContext.user,
        action: "auth.change_password",
        targetType: "user",
        targetId: authContext.user.id,
      });
      return json(res, 200, result);
    } catch (error) {
      return badRequest(res, error.message);
    }
  }

  if (req.method === "POST" && url.pathname === "/api/invitations/accept") {
    try {
      const user = await acceptInvitation(await readJsonBody(req));
      await appendAuditLog({
        actor: user,
        workspaceId: user.workspaceId,
        action: "user.accept_invitation",
        targetType: "user",
        targetId: user.id,
      });
      return json(res, 200, { ok: true, user });
    } catch (error) {
      return badRequest(res, error.message);
    }
  }

  if (req.method === "GET" && url.pathname === "/api/users") {
    return json(res, 200, await listUsers(workspaceId));
  }

  if (req.method === "GET" && url.pathname === "/api/workspaces") {
    const allWorkspaces = await listWorkspaces();
    const workspaces = isPlatformAdmin(authContext)
      ? allWorkspaces
      : allWorkspaces.filter((workspace) => workspace.id === workspaceId);
    return json(res, 200, workspaces);
  }

  if (req.method === "GET" && url.pathname === "/api/billing/plans") {
    return json(res, 200, listPlans());
  }

  if (req.method === "GET" && url.pathname === "/api/billing/current") {
    return json(res, 200, { ...(await getPlan(workspaceId)), usage: await getUsage(workspaceId) });
  }

  if (req.method === "GET" && url.pathname === "/api/billing/events") {
    return json(res, 200, await listBillingEvents(workspaceId));
  }

  if (req.method === "POST" && url.pathname === "/api/billing/checkout") {
    try {
      const body = await readJsonBody(req);
      return json(res, 200, await createCheckoutSession(workspaceId, body.plan, authContext.user));
    } catch (error) {
      return badRequest(res, error.message);
    }
  }

  if (req.method === "POST" && url.pathname === "/api/billing/plan") {
    try {
      const body = await readJsonBody(req);
      const plan = await changePlan(workspaceId, body.plan, authContext.user);
      await appendAuditLog({
        actor: authContext.user,
        workspaceId,
        action: "billing.plan_change",
        targetType: "workspace",
        targetId: workspaceId,
        payload: { plan: body.plan },
      });
      return json(res, 200, plan);
    } catch (error) {
      return badRequest(res, error.message);
    }
  }

  if (req.method === "GET" && url.pathname === "/api/download-clients") {
    return json(res, 200, await listDownloadClients(workspaceId));
  }

  if (req.method === "GET" && url.pathname === "/api/invitations") {
    return json(res, 200, await listInvitations(workspaceId));
  }

  if (req.method === "POST" && url.pathname === "/api/download-clients") {
    try {
      const client = await upsertDownloadClient(await readJsonBody(req), workspaceId);
      await appendAuditLog({ actor: authContext.user, action: "download_client.upsert", targetType: "download_client", targetId: client.id, payload: client });
      return json(res, 200, client);
    } catch (error) {
      return badRequest(res, error.message);
    }
  }

  const downloadTestMatch = url.pathname.match(/^\/api\/download-clients\/([^/]+)\/test$/);
  if (req.method === "POST" && downloadTestMatch) {
    try {
      return json(res, 200, await testDownloadClient(downloadTestMatch[1], workspaceId));
    } catch (error) {
      return badRequest(res, error.message);
    }
  }

  if (req.method === "GET" && url.pathname === "/api/tasks") {
    return json(res, 200, await listTasks(workspaceId));
  }

  if (req.method === "POST" && url.pathname === "/api/tasks") {
    return json(res, 200, await enqueueDownloadTask(await readJsonBody(req), workspaceId));
  }

  const taskRerunMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/rerun$/);
  if (req.method === "POST" && taskRerunMatch) {
    return json(res, 200, await rerunTask(taskRerunMatch[1], workspaceId));
  }

  if (req.method === "POST" && url.pathname === "/api/workspaces") {
    try {
      const workspace = await createWorkspace(await readJsonBody(req));
      await appendAuditLog({
        actor: authContext.user,
        action: "workspace.create",
        targetType: "workspace",
        targetId: workspace.id,
        payload: workspace,
      });
      return json(res, 200, workspace);
    } catch (error) {
      return badRequest(res, error.message);
    }
  }

  if (req.method === "POST" && url.pathname === "/api/users") {
    try {
      const body = await readJsonBody(req);
      const user = await createUser({
        ...body,
        workspaceId: isPlatformAdmin(authContext) ? body.workspaceId || workspaceId : workspaceId,
      });
      await appendAuditLog({
        actor: authContext.user,
        action: "user.create",
        targetType: "user",
        targetId: user.id,
        payload: user,
      });
      return json(res, 200, user);
    } catch (error) {
      return badRequest(res, error.message);
    }
  }

  if (req.method === "POST" && url.pathname === "/api/invitations") {
    try {
      const body = await readJsonBody(req);
      const invite = await inviteUser({
        ...body,
        workspaceId: isPlatformAdmin(authContext) ? body.workspaceId || workspaceId : workspaceId,
      });
      await sendInvitationEmail(invite);
      await appendAuditLog({
        actor: authContext.user,
        workspaceId: invite.workspaceId,
        action: "user.invite",
        targetType: "user",
        targetId: invite.id,
        payload: { email: invite.email, role: invite.role, workspaceId: invite.workspaceId },
      });
      return json(res, 200, invite);
    } catch (error) {
      return badRequest(res, error.message);
    }
  }

  const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (req.method === "PATCH" && userMatch) {
    try {
      const user = await updateUser(userMatch[1], await readJsonBody(req), {
        workspaceId,
        platformAdmin: isPlatformAdmin(authContext),
      });
      await appendAuditLog({
        actor: authContext.user,
        action: "user.update",
        targetType: "user",
        targetId: user.id,
        payload: user,
      });
      return json(res, 200, user);
    } catch (error) {
      return badRequest(res, error.message);
    }
  }

  if (req.method === "GET" && url.pathname === "/api/audit-logs") {
    return json(res, 200, await listAuditLogs({
      workspaceId,
      limit: Number(url.searchParams.get("limit") || 100),
      includeAll: isPlatformAdmin(authContext) && url.searchParams.get("all") === "1",
    }));
  }

  if (req.method === "POST" && url.pathname === "/api/jobs/source-health") {
    const result = await runHealthJob();
    await appendAuditLog({
      actor: authContext.user,
      action: "job.source_health",
      targetType: "job",
      payload: result,
    });
    return json(res, 200, result);
  }

  if (req.method === "POST" && url.pathname === "/api/jobs/backup") {
    const result = await runBackupJob();
    await appendAuditLog({
      actor: authContext.user,
      action: "job.backup",
      targetType: "job",
      payload: result,
    });
    return json(res, 200, result);
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    return json(res, 200, {
      ok: true,
      service: "pt-resource-hub",
      port: Number(process.env.PORT || 4273),
      authRequired: process.env.ALLOW_INSECURE_DEV !== "1",
      workspaceId,
      stats: await getStats(workspaceId),
      checkedAt: new Date().toISOString(),
    });
  }

  if (req.method === "GET" && url.pathname === "/api/backup") {
    return json(res, 200, await exportBackup(workspaceId));
  }

  if (req.method === "GET" && url.pathname === "/api/media") {
    return json(
      res,
      200,
      await listMedia({
        q: url.searchParams.get("q") || "",
        type: url.searchParams.get("type") || "all",
        genre: url.searchParams.get("genre") || "all",
        workspaceId,
      }),
    );
  }

  const mediaMatch = url.pathname.match(/^\/api\/media\/([^/]+)$/);
  if (req.method === "GET" && mediaMatch) {
    const media = await getMedia(mediaMatch[1], workspaceId);
    return media ? json(res, 200, media) : notFound(res);
  }

  const resourceMatch = url.pathname.match(/^\/api\/media\/([^/]+)\/resources$/);
  if (req.method === "GET" && resourceMatch) {
    return json(
      res,
      200,
      await listResources(resourceMatch[1], {
        quality: url.searchParams.get("quality") || "all",
        subtitle: url.searchParams.get("subtitle") || "all",
        workspaceId,
      }),
    );
  }

  if (req.method === "POST" && resourceMatch) {
    try {
      const resource = await addManualResource(resourceMatch[1], await readJsonBody(req), workspaceId);
      await appendAuditLog({
        actor: authContext.user,
        action: "resource.manual_add",
        targetType: "resource",
        targetId: resource.id,
        payload: resource,
      });
      return json(res, 200, resource);
    } catch (error) {
      return badRequest(res, error.message);
    }
  }

  if (req.method === "GET" && url.pathname === "/api/sources") {
    return json(res, 200, await listSources(workspaceId));
  }

  if ((req.method === "POST" || req.method === "PUT") && url.pathname === "/api/sources") {
    try {
      const source = await upsertSource(await readJsonBody(req), workspaceId);
      await appendAuditLog({
        actor: authContext.user,
        action: "source.upsert",
        targetType: "source",
        targetId: source.id,
        payload: source,
      });
      return json(res, 200, source);
    } catch (error) {
      return badRequest(res, error.message);
    }
  }

  const sourceMatch = url.pathname.match(/^\/api\/sources\/([^/]+)$/);
  if (req.method === "DELETE" && sourceMatch) {
    const result = await deleteSource(sourceMatch[1], workspaceId);
    await appendAuditLog({
      actor: authContext.user,
      action: "source.delete",
      targetType: "source",
      targetId: sourceMatch[1],
      payload: result,
    });
    return json(res, 200, result);
  }

  const sourceTestMatch = url.pathname.match(/^\/api\/sources\/([^/]+)\/test$/);
  if (req.method === "POST" && sourceTestMatch) {
    try {
      return json(res, 200, await testSource(sourceTestMatch[1], workspaceId));
    } catch (error) {
      return badRequest(res, error.message);
    }
  }

  const sourceCapsMatch = url.pathname.match(/^\/api\/sources\/([^/]+)\/caps$/);
  if (req.method === "GET" && sourceCapsMatch) {
    try {
      return json(res, 200, await getSourceCapabilities(sourceCapsMatch[1], workspaceId));
    } catch (error) {
      return badRequest(res, error.message);
    }
  }

  if (req.method === "GET" && url.pathname === "/api/sync-logs") {
    return json(res, 200, await loadSyncLogs(workspaceId));
  }

  if (req.method === "GET" && url.pathname === "/api/review/resources") {
    return json(res, 200, await loadReviewQueue(workspaceId));
  }

  const reviewMatch = url.pathname.match(/^\/api\/review\/resources\/([^/]+)$/);
  if (req.method === "POST" && reviewMatch) {
    try {
      const body = await readJsonBody(req);
      const resource = await updateResourceStatus(reviewMatch[1], body.status || "active", workspaceId);
      await appendAuditLog({
        actor: authContext.user,
        action: "resource.review",
        targetType: "resource",
        targetId: reviewMatch[1],
        payload: { status: body.status || "active" },
      });
      return json(res, 200, resource);
    } catch (error) {
      return badRequest(res, error.message);
    }
  }

  if (req.method === "GET" && url.pathname === "/api/tmdb/search") {
    try {
      return json(
        res,
        200,
        await searchTmdb({
          query: url.searchParams.get("q") || "",
          type: url.searchParams.get("type") || "multi",
          language: url.searchParams.get("language") || "zh-CN",
        }),
      );
    } catch (error) {
      return badRequest(res, error.message);
    }
  }

  if (req.method === "POST" && url.pathname === "/api/tmdb/import") {
    try {
      const body = await readJsonBody(req);
      const item = tmdbResultToMediaItem(body);
      const media = await upsertMedia(item, workspaceId);
      await appendAuditLog({
        actor: authContext.user,
        action: "media.import_tmdb",
        targetType: "media",
        targetId: media.id,
      });
      return json(res, 200, media);
    } catch (error) {
      return badRequest(res, error.message);
    }
  }

  const syncMatch = url.pathname.match(/^\/api\/media\/([^/]+)\/sync$/);
  if (req.method === "POST" && syncMatch) {
    try {
      const result = await syncResourcesForMedia(syncMatch[1], workspaceId);
      await appendAuditLog({
        actor: authContext.user,
        action: "media.sync_resources",
        targetType: "media",
        targetId: syncMatch[1],
        payload: result,
      });
      return json(res, 200, result);
    } catch (error) {
      return badRequest(res, error.message);
    }
  }

  return notFound(res);
}

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

function needsAdmin(req, url) {
  if (
    url.pathname === "/api/backup"
    || url.pathname === "/api/users"
    || url.pathname === "/api/workspaces"
    || url.pathname === "/api/invitations"
    || url.pathname === "/api/audit-logs"
    || url.pathname.startsWith("/api/jobs")
    || url.pathname.startsWith("/api/download-clients")
    || url.pathname.startsWith("/api/tasks")
    || url.pathname.startsWith("/api/review")
  ) {
    return true;
  }
  if (req.method === "GET") return false;
  return (
    url.pathname.startsWith("/api/sources")
    || url.pathname.startsWith("/api/review")
    || url.pathname.startsWith("/api/tmdb/import")
    || /^\/api\/media\/[^/]+\/sync$/.test(url.pathname)
    || /^\/api\/media\/[^/]+\/resources$/.test(url.pathname)
  );
}

function needsPlatformAdmin(req, url) {
  return (
    (url.pathname === "/api/workspaces" && req.method === "POST")
    || url.pathname === "/api/audit-logs"
    || url.pathname === "/api/jobs/backup"
  );
}

function requiredPermission(req, url) {
  if (url.pathname.startsWith("/api/billing/") && req.method !== "GET") return "billing:write";
  if (url.pathname.startsWith("/api/sources") && req.method === "GET") return "source:read";
  if (/^\/api\/sources\/[^/]+\/(test|caps)$/.test(url.pathname)) return "source:test";
  if (url.pathname.startsWith("/api/review")) return "resource:review";
  if (url.pathname.startsWith("/api/jobs")) return "job:run";
  if (url.pathname === "/api/download-clients" && req.method === "POST") return "download-client:write";
  if (url.pathname.startsWith("/api/download-clients")) return "job:run";
  if (url.pathname.startsWith("/api/tasks")) return "job:run";
  if (/^\/api\/media\/[^/]+\/sync$/.test(url.pathname)) return "media:sync";
  return null;
}

function currentWorkspaceId(req, authContext) {
  const requested = String(req.headers["x-workspace-id"] || "").trim();
  if (authContext.isAdminToken && requested) return requested;
  if (authContext.user?.role === "admin" && authContext.user.workspaceId === "default" && requested) return requested;
  return authContext.user?.workspaceId || "default";
}

function shouldValidateWorkspace(req, url) {
  if (url.pathname.startsWith("/api/auth/")) return false;
  if (url.pathname === "/api/invitations/accept") return false;
  if (url.pathname === "/api/workspaces" && req.method === "POST") return false;
  if (url.pathname === "/api/billing/plans") return false;
  return true;
}

function requireAuthenticated(req, url, authContext) {
  if (process.env.ALLOW_INSECURE_DEV === "1") return null;
  if (process.env.REQUIRE_AUTH !== "1") return null;
  if (authContext.user || authContext.isAdminToken) return null;
  if (url.pathname === "/api/auth/login") return null;
  if (url.pathname === "/api/invitations/accept") return null;
  if (url.pathname === "/api/billing/plans") return null;
  if (url.pathname === "/api/health") return null;
  return { error: "需要登录" };
}
