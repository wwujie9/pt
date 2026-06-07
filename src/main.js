import {
  fetchMedia,
  fetchMediaList,
  fetchResources,
  fetchSources,
  fetchStats,
  fetchMe,
  fetchUsers,
  fetchWorkspaces,
  fetchBillingCurrent,
  fetchBillingEvents,
  fetchBillingInvoices,
  fetchBillingPlans,
  createRefund,
  replayBillingWebhook,
  changeBillingPlan,
  fetchDownloadClients,
  saveDownloadClient,
  testDownloadClient,
  fetchTasks,
  fetchMonitoring,
  runMonitoring,
  createTask,
  rerunTask,
  createWorkspace,
  inviteUser,
  fetchInvitations,
  acceptInvitation,
  changePassword,
  createUser,
  updateUser,
  fetchAuditLogs,
  fetchSourceCaps,
  fetchSyncLogs,
  fetchReviewResources,
  addManualResource,
  saveSource,
  searchTmdb,
  syncMediaResources,
  testSource,
  deleteSource,
  importTmdbMedia,
  updateReviewResource,
  login,
  logout,
} from "./services/api-client.js";
import {
  renderAdmin,
  renderAppShell,
  renderArchitecture,
  renderInvite,
  renderDetail,
  renderHome,
} from "./ui/render.js";

const state = {
  keyword: "",
  filters: {
    type: "all",
    genre: "all",
  },
  resourceFilters: {
    quality: "all",
    subtitle: "all",
  },
};

document.querySelector("#app").innerHTML = renderAppShell();
window.addEventListener("hashchange", renderRoute);
renderRoute();

async function renderRoute() {
  const view = document.querySelector("#view");
  const hash = window.location.hash || "#/";

  if (hash.startsWith("#/media/")) {
    const id = hash.replace("#/media/", "");
    view.innerHTML = `<section class="loading">正在读取影视详情...</section>`;
    const [media, resources] = await Promise.all([
      fetchMedia(id),
      fetchResources(id, state.resourceFilters),
    ]);
    view.innerHTML = renderDetail({
      media,
      resources,
      quality: state.resourceFilters.quality,
      subtitle: state.resourceFilters.subtitle,
    });
    bindDetailEvents();
    return;
  }

  if (hash === "#/invite" || window.location.pathname === "/invite") {
    const token = new URLSearchParams(window.location.search).get("token") || "";
    view.innerHTML = renderInvite({ token });
    bindInviteEvents();
    return;
  }

  if (hash === "#/architecture") {
    view.innerHTML = renderArchitecture();
    return;
  }

  if (hash === "#/admin") {
    view.innerHTML = `<section class="loading">正在读取来源状态...</section>`;
    const [adapters, syncLogs, reviewResources, me, users, auditLogs, workspaces, billing, plans, billingEvents, billingInvoices, monitoring, invitations, downloadClients, tasks, mediaItems] = await Promise.all([
      fetchSources().catch(() => []),
      fetchSyncLogs().catch(() => []),
      fetchReviewResources().catch(() => []),
      fetchMe().catch(() => ({ user: null })),
      fetchUsers().catch(() => []),
      fetchAuditLogs().catch(() => []),
      fetchWorkspaces().catch(() => []),
      fetchBillingCurrent().catch(() => null),
      fetchBillingPlans().catch(() => []),
      fetchBillingEvents().catch(() => []),
      fetchBillingInvoices().catch(() => []),
      fetchMonitoring().catch(() => null),
      fetchInvitations().catch(() => []),
      fetchDownloadClients().catch(() => []),
      fetchTasks().catch(() => []),
      fetchMediaList({ keyword: "", filters: { type: "all", genre: "all" } }).catch(() => []),
    ]);
    view.innerHTML = renderAdmin({ adapters, syncLogs, reviewResources, me, users, auditLogs, workspaces, billing, plans, billingEvents, billingInvoices, monitoring, invitations, downloadClients, tasks, mediaItems });
    bindAdminEvents();
    return;
  }

  view.innerHTML = `<section class="loading">正在读取资源目录...</section>`;
  const [stats, mediaItems] = await Promise.all([
    fetchStats(),
    fetchMediaList({ keyword: state.keyword, filters: state.filters }),
  ]);
  view.innerHTML = renderHome({
    stats,
    mediaItems,
    keyword: state.keyword,
    filters: state.filters,
  });
  bindHomeEvents();
}

function bindAdminEvents() {
  const showAdminError = (error) => {
    const output = document.querySelector("#adminError");
    if (!output) return;
    output.hidden = false;
    output.textContent = error?.message || String(error);
  };
  document.querySelector("#adminRefreshButton")?.addEventListener("click", () => renderRoute());
  const tokenInput = document.querySelector("#adminToken");
  tokenInput.value = localStorage.getItem("adminToken") || "";
  tokenInput.addEventListener("change", () => {
    if (tokenInput.value.trim()) {
      localStorage.setItem("adminToken", tokenInput.value.trim());
    } else {
      localStorage.removeItem("adminToken");
    }
  });

  document.querySelector("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await login(data.get("email"), data.get("password"));
    await renderRoute();
  });

  const workspaceSelect = document.querySelector("#workspaceSwitch");
  workspaceSelect.value = localStorage.getItem("workspaceId") || "";
  workspaceSelect.addEventListener("change", async () => {
    if (workspaceSelect.value) localStorage.setItem("workspaceId", workspaceSelect.value);
    else localStorage.removeItem("workspaceId");
    await renderRoute();
  });

  document.querySelector("#workspaceForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const workspace = await createWorkspace({
        name: data.get("name"),
        plan: data.get("plan"),
      });
      localStorage.setItem("workspaceId", workspace.id);
      form.reset();
      await renderRoute();
    } catch (error) {
      showAdminError(error);
    }
  });

  document.querySelector("#onboardingWorkspaceForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const workspace = await createWorkspace({
        name: data.get("name"),
        plan: data.get("plan"),
      });
      localStorage.setItem("workspaceId", workspace.id);
      form.reset();
      await renderRoute();
    } catch (error) {
      showAdminError(error);
    }
  });

  document.querySelector("#userForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await createUser({
        email: data.get("email"),
        name: data.get("name"),
        workspaceId: data.get("workspaceId") || localStorage.getItem("workspaceId") || "default",
        role: data.get("role"),
        password: data.get("password"),
      });
      form.reset();
      await renderRoute();
    } catch (error) {
      showAdminError(error);
    }
  });

  document.querySelector("#inviteForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const invite = await inviteUser({
        email: data.get("email"),
        name: data.get("name"),
        role: data.get("role"),
        workspaceId: data.get("workspaceId") || localStorage.getItem("workspaceId") || "default",
      });
      document.querySelector("#inviteOutput").textContent = `邀请已创建，临时密码：${invite.inviteToken}`;
      form.reset();
    } catch (error) {
      showAdminError(error);
    }
  });

  document.querySelector("#onboardingInviteForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const invite = await inviteUser({
        email: data.get("email"),
        name: data.get("name"),
        role: data.get("role"),
        workspaceId: data.get("workspaceId") || localStorage.getItem("workspaceId") || "default",
      });
      const output = document.querySelector("#onboardingInviteOutput");
      if (output) output.textContent = `邀请已创建，接受链接 token：${invite.inviteToken}`;
      form.reset();
      await renderRoute();
    } catch (error) {
      showAdminError(error);
    }
  });

  document.querySelector("#downloadClientForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await saveDownloadClient({
        id: data.get("id"),
        name: data.get("name"),
        type: data.get("type"),
        enabled: data.get("enabled") === "on",
        baseUrl: data.get("baseUrl"),
        username: data.get("username"),
        password: data.get("password"),
      });
      form.reset();
      await renderRoute();
    } catch (error) {
      showAdminError(error);
    }
  });

  document.querySelectorAll("[data-test-download]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.textContent = "测试中";
      try {
        const result = await testDownloadClient(button.dataset.testDownload);
        button.textContent = result.ok ? "可用" : "失败";
      } catch (error) {
        button.textContent = "失败";
        showAdminError(error);
      }
    });
  });

  document.querySelector("#taskForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await createTask({ title: data.get("title"), clientId: data.get("clientId"), resourceId: data.get("resourceId") });
      form.reset();
      await renderRoute();
    } catch (error) {
      showAdminError(error);
    }
  });

  document.querySelectorAll("[data-rerun-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await rerunTask(button.dataset.rerunTask);
        await renderRoute();
      } catch (error) {
        showAdminError(error);
      }
    });
  });

  document.querySelectorAll("[data-change-plan]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await changeBillingPlan(button.dataset.changePlan);
        await renderRoute();
      } catch (error) {
        showAdminError(error);
      }
    });
  });

  document.querySelector("#monitoringRunButton")?.addEventListener("click", async () => {
    try {
      await runMonitoring();
      await renderRoute();
    } catch (error) {
      showAdminError(error);
    }
  });

  document.querySelector("#onboardingMonitoringButton")?.addEventListener("click", async () => {
    try {
      await runMonitoring();
      await renderRoute();
    } catch (error) {
      showAdminError(error);
    }
  });

  document.querySelectorAll("[data-replay-webhook]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await replayBillingWebhook(button.dataset.replayWebhook);
        await renderRoute();
      } catch (error) {
        showAdminError(error);
      }
    });
  });

  document.querySelectorAll("[data-refund-invoice]").forEach((button) => {
    button.addEventListener("click", async () => {
      const amount = prompt("请输入退款金额，单位为分；留空则按原账单金额记录");
      if (amount === null) return;
      try {
        await createRefund({
          billingEventId: button.dataset.refundInvoice,
          amountCents: amount.trim() ? Number(amount) : undefined,
          reason: "requested_by_customer",
        });
        await renderRoute();
      } catch (error) {
        showAdminError(error);
      }
    });
  });

  document.querySelectorAll("[data-user-role]").forEach((select) => {
    select.addEventListener("change", async () => {
      try {
        await updateUser(select.dataset.userRole, { role: select.value });
        await renderRoute();
      } catch (error) {
        showAdminError(error);
      }
    });
  });

  document.querySelectorAll("[data-user-workspace]").forEach((select) => {
    select.addEventListener("change", async () => {
      try {
        await updateUser(select.dataset.userWorkspace, { workspaceId: select.value });
        await renderRoute();
      } catch (error) {
        showAdminError(error);
      }
    });
  });

  document.querySelectorAll("[data-user-toggle]").forEach((button) => {
    button.addEventListener("click", async () => {
      await updateUser(button.dataset.userToggle, { enabled: button.dataset.enabled !== "true" });
      await renderRoute();
    });
  });

  document.querySelectorAll("[data-user-reset]").forEach((button) => {
    button.addEventListener("click", async () => {
      const password = prompt("请输入新密码，至少 8 位");
      if (!password) return;
      await updateUser(button.dataset.userReset, { password });
      await renderRoute();
    });
  });

  document.querySelector("#logoutButton").addEventListener("click", async () => {
    await logout().catch(() => localStorage.removeItem("sessionToken"));
    await renderRoute();
  });

  document.querySelector("#passwordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await changePassword(data.get("oldPassword"), data.get("newPassword"));
    localStorage.removeItem("sessionToken");
    form.reset();
    await renderRoute();
  });

  const form = document.querySelector("#sourceForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const source = {
      id: data.get("id"),
      name: data.get("name"),
      type: data.get("type"),
      enabled: data.get("enabled") === "on",
      weight: data.get("weight"),
      baseUrl: data.get("baseUrl"),
      apiKey: data.get("apiKey"),
      url: data.get("url"),
    };
    await saveSource(source);
    form.reset();
    await renderRoute();
  });

  document.querySelector("#onboardingSourceForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const source = {
        id: data.get("id"),
        name: data.get("name"),
        type: data.get("type"),
        enabled: data.get("enabled") === "on",
        weight: data.get("weight"),
        baseUrl: data.get("baseUrl"),
        apiKey: data.get("apiKey"),
        url: data.get("url"),
      };
      await saveSource(source);
      form.reset();
      await renderRoute();
    } catch (error) {
      showAdminError(error);
    }
  });

  document.querySelectorAll("[data-onboarding-test-source]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "测试中";
      try {
        const result = await testSource(button.dataset.onboardingTestSource);
        button.textContent = result.ok ? "测试通过" : "测试失败";
        await renderRoute();
      } catch (error) {
        button.textContent = "测试失败";
        showAdminError(error);
      } finally {
        setTimeout(() => {
          if (button.isConnected) button.disabled = false;
        }, 1200);
      }
    });
  });

  document.querySelector("#onboardingSyncForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await syncMediaResources(data.get("mediaId"));
      await renderRoute();
    } catch (error) {
      showAdminError(error);
    }
  });

  document.querySelectorAll("[data-edit-source]").forEach((button) => {
    button.addEventListener("click", () => {
      const source = JSON.parse(button.dataset.source);
      form.elements.id.value = source.id || "";
      form.elements.name.value = source.name || "";
      form.elements.type.value = source.type || "torznab";
      form.elements.enabled.checked = Boolean(source.enabled);
      form.elements.weight.value = source.weight || 1;
      form.elements.baseUrl.value = source.baseUrl || "";
      form.elements.apiKey.value = source.apiKey || "";
      form.elements.url.value = source.url || "";
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  document.querySelectorAll("[data-delete-source]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm(`确认删除来源 ${button.dataset.deleteSource}？`)) return;
      await deleteSource(button.dataset.deleteSource);
      await renderRoute();
    });
  });

  document.querySelectorAll("[data-test-source]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "测试中";
      try {
        const result = await testSource(button.dataset.testSource);
        button.textContent = result.ok ? "可用" : "失败";
      } catch (error) {
        button.textContent = error.message;
      } finally {
        setTimeout(() => {
          if (button.isConnected) button.disabled = false;
        }, 1200);
      }
    });
  });

  document.querySelectorAll("[data-caps-source]").forEach((button) => {
    button.addEventListener("click", async () => {
      const output = document.querySelector("#capsOutput");
      output.textContent = "读取中...";
      try {
        output.textContent = JSON.stringify(await fetchSourceCaps(button.dataset.capsSource), null, 2);
      } catch (error) {
        output.textContent = error.message;
      }
    });
  });

  document.querySelectorAll("[data-review-resource]").forEach((button) => {
    button.addEventListener("click", async () => {
      await updateReviewResource(button.dataset.reviewResource, button.dataset.reviewStatus);
      await renderRoute();
    });
  });

  const tmdbForm = document.querySelector("#tmdbForm");
  tmdbForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = new FormData(tmdbForm).get("query");
    const output = document.querySelector("#tmdbResults");
    output.textContent = "搜索中...";
    try {
      const result = await searchTmdb(query);
      if (!result.configured) {
        output.textContent = result.message;
        return;
      }
      output.innerHTML = result.items
        .slice(0, 8)
        .map(
          (item) => {
            const encodedItem = encodeURIComponent(JSON.stringify(item));
            return `
            <article class="tmdb-result">
              <div>
                <strong>${escapeHtml(item.title || item.originalTitle || "未知标题")}</strong>
                <span>${escapeHtml(item.type || "unknown")} · ${escapeHtml(item.year || "未知年份")} · TMDB ${escapeHtml(item.rating || 0)}</span>
              </div>
              <button data-import-tmdb="${escapeHtml(encodedItem)}">导入</button>
            </article>
          `;
          },
        )
        .join("");
      bindTmdbImportEvents();
    } catch (error) {
      output.textContent = error.message;
    }
  });
}

function bindInviteEvents() {
  document.querySelector("#acceptInviteForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const output = document.querySelector("#inviteAcceptOutput");
    output.textContent = "正在接受邀请...";
    try {
      await acceptInvitation(data.get("token"), data.get("password"));
      output.textContent = "邀请已接受，请返回管理页登录。";
      form.reset();
    } catch (error) {
      output.textContent = error.message;
    }
  });
}

function bindTmdbImportEvents() {
  document.querySelectorAll("[data-import-tmdb]").forEach((button) => {
    button.addEventListener("click", async () => {
      const item = JSON.parse(decodeURIComponent(button.dataset.importTmdb));
      button.disabled = true;
      button.textContent = "导入中";
      await importTmdbMedia(item);
      button.textContent = "已导入";
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function bindHomeEvents() {
  document.querySelector("#keyword").addEventListener("input", (event) => {
    state.keyword = event.target.value;
    renderRoute();
    document.querySelector("#keyword")?.focus();
  });

  document.querySelector("#typeFilter").addEventListener("change", (event) => {
    state.filters.type = event.target.value;
    renderRoute();
  });

  document.querySelector("#genreFilter").addEventListener("change", (event) => {
    state.filters.genre = event.target.value;
    renderRoute();
  });
}

function bindDetailEvents() {
  document.querySelector("#qualityFilter").addEventListener("change", (event) => {
    state.resourceFilters.quality = event.target.value;
    renderRoute();
  });

  document.querySelector("#subtitleFilter").addEventListener("change", (event) => {
    state.resourceFilters.subtitle = event.target.value;
    renderRoute();
  });

  document.querySelector("#syncButton").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const mediaId = window.location.hash.replace("#/media/", "");
    button.disabled = true;
    button.textContent = "同步中";
    try {
      const result = await syncMediaResources(mediaId);
      button.textContent = `已导入 ${result.importedCount}`;
      await renderRoute();
    } catch (error) {
      button.textContent = error.message;
    } finally {
      setTimeout(() => {
        if (button.isConnected) button.disabled = false;
      }, 1000);
    }
  });

  document.querySelector("#manualResourceForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const mediaId = window.location.hash.replace("#/media/", "");
    const data = new FormData(form);
    await addManualResource(mediaId, {
      title: data.get("title"),
      source: data.get("source"),
      quality: data.get("quality"),
      medium: data.get("medium"),
      codec: data.get("codec"),
      audio: data.get("audio"),
      subtitle: data.get("subtitle"),
      sizeGb: data.get("sizeGb"),
      seeders: data.get("seeders"),
      url: data.get("url"),
    });
    form.reset();
    await renderRoute();
  });
}
