export async function fetchStats() {
  return request("/api/stats");
}

export async function login(email, password) {
  const result = await request("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem("sessionToken", result.token);
  return result;
}

export async function fetchMe() {
  return request("/api/auth/me");
}

export async function logout() {
  const result = await request("/api/auth/logout", { method: "POST" });
  localStorage.removeItem("sessionToken");
  localStorage.removeItem("workspaceId");
  localStorage.removeItem("adminToken");
  return result;
}

export async function fetchUsers() {
  return request("/api/users");
}

export async function fetchWorkspaces() {
  return request("/api/workspaces");
}

export async function fetchBillingCurrent() {
  return request("/api/billing/current");
}

export async function fetchBillingEvents() {
  return request("/api/billing/events");
}

export async function fetchBillingInvoices() {
  return request("/api/billing/invoices");
}

export async function createRefund(refund) {
  return request("/api/billing/refunds", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(refund),
  });
}

export async function replayBillingWebhook(eventId) {
  return request("/api/billing/webhook-replays", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventId }),
  });
}

export async function changeBillingPlan(plan) {
  return request("/api/billing/plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan }),
  });
}

export async function fetchBillingPlans() {
  return request("/api/billing/plans");
}

export async function fetchDownloadClients() {
  return request("/api/download-clients");
}

export async function saveDownloadClient(client) {
  return request("/api/download-clients", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(client),
  });
}

export async function testDownloadClient(id) {
  return request(`/api/download-clients/${encodeURIComponent(id)}/test`, { method: "POST" });
}

export async function fetchTasks() {
  return request("/api/tasks");
}

export async function fetchMonitoring() {
  return request("/api/monitoring");
}

export async function runMonitoring() {
  return request("/api/jobs/monitoring", { method: "POST" });
}

export async function createTask(task) {
  return request("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(task),
  });
}

export async function rerunTask(id) {
  return request(`/api/tasks/${encodeURIComponent(id)}/rerun`, { method: "POST" });
}

export async function createWorkspace(workspace) {
  return request("/api/workspaces", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(workspace),
  });
}

export async function inviteUser(invite) {
  return request("/api/invitations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(invite),
  });
}

export async function fetchInvitations() {
  return request("/api/invitations");
}

export async function acceptInvitation(token, password) {
  return request("/api/invitations/accept", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
}

export async function changePassword(oldPassword, newPassword) {
  return request("/api/auth/change-password", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ oldPassword, newPassword }),
  });
}

export async function createUser(user) {
  return request("/api/users", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(user),
  });
}

export async function updateUser(id, patch) {
  return request(`/api/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(patch),
  });
}

export async function fetchAuditLogs() {
  return request("/api/audit-logs?limit=50");
}

export async function fetchMediaList({ keyword, filters }) {
  const params = new URLSearchParams({
    q: keyword,
    type: filters.type,
    genre: filters.genre,
  });
  return request(`/api/media?${params}`);
}

export async function fetchMedia(id) {
  return request(`/api/media/${id}`);
}

export async function fetchResources(mediaId, filters) {
  const params = new URLSearchParams({
    quality: filters.quality,
    subtitle: filters.subtitle,
  });
  return request(`/api/media/${mediaId}/resources?${params}`);
}

export async function addManualResource(mediaId, resource) {
  return request(`/api/media/${mediaId}/resources`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(resource),
  });
}

export async function fetchSources() {
  return request("/api/sources");
}

export async function saveSource(source) {
  return request("/api/sources", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(source),
  });
}

export async function deleteSource(id) {
  return request(`/api/sources/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function testSource(id) {
  return request(`/api/sources/${encodeURIComponent(id)}/test`, {
    method: "POST",
  });
}

export async function fetchSourceCaps(id) {
  return request(`/api/sources/${encodeURIComponent(id)}/caps`);
}

export async function fetchSyncLogs() {
  return request("/api/sync-logs");
}

export async function fetchReviewResources() {
  return request("/api/review/resources");
}

export async function updateReviewResource(id, status) {
  return request(`/api/review/resources/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ status }),
  });
}

export async function searchTmdb(query) {
  const params = new URLSearchParams({ q: query });
  return request(`/api/tmdb/search?${params}`);
}

export async function importTmdbMedia(item) {
  return request("/api/tmdb/import", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(item),
  });
}

export async function syncMediaResources(mediaId) {
  return request(`/api/media/${mediaId}/sync`, {
    method: "POST",
  });
}

async function request(path, options) {
  const adminToken = localStorage.getItem("adminToken");
  const sessionToken = localStorage.getItem("sessionToken");
  const workspaceId = localStorage.getItem("workspaceId");
  const headers = {
    ...(options?.headers || {}),
  };
  if (adminToken) {
    headers["x-admin-token"] = adminToken;
  }
  if (sessionToken) {
    headers.authorization = `Bearer ${sessionToken}`;
  }
  if (workspaceId) {
    headers["x-workspace-id"] = workspaceId;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `请求失败：${response.status}`);
  }
  return response.json();
}
