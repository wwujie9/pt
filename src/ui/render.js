import { icons } from "./icons.js";

export function renderAppShell() {
  return `
    <header class="topbar">
      <a class="brand" href="#/">
        <span class="brand-mark">${icons.database}</span>
        <span>
          <strong>影源聚合站</strong>
          <small>Media Resource Hub</small>
        </span>
      </a>
      <nav class="nav">
        <a href="#/">发现</a>
        <a href="#/architecture">架构</a>
        <a href="#/admin">管理</a>
      </nav>
    </header>
    <div id="toastHost" class="toast-host" aria-live="polite"></div>
    <main id="view"></main>
  `;
}

export function renderHome({ stats, mediaItems, keyword, filters }) {
  const cards = mediaItems.map(renderMediaCard).join("");

  return `
    <section class="workspace">
      <aside class="sidebar">
        <div class="panel">
          <div class="panel-title">${icons.filter}<span>筛选</span></div>
          <label>关键词</label>
          <div class="search-control">
            ${icons.search}
            <input id="keyword" value="${escapeHtml(keyword)}" placeholder="搜索中文名、原名、类型..." />
          </div>
          <label>类型</label>
          <select id="typeFilter">
            ${option("all", "全部", filters.type)}
            ${option("movie", "电影", filters.type)}
            ${option("tv", "剧集", filters.type)}
          </select>
          <label>题材</label>
          <select id="genreFilter">
            ${["all", "剧情", "科幻", "动画", "历史", "奇幻", "冒险"].map((genre) => option(genre, genre === "all" ? "全部" : genre, filters.genre)).join("")}
          </select>
        </div>
        <div class="panel compact">
          <div class="panel-title">${icons.shield}<span>合规策略</span></div>
          <p>仅展示自有、授权或公共领域资源记录；外部来源通过适配器接入，审核后入库。</p>
        </div>
      </aside>

      <section class="content">
        <section class="hero">
          <div>
            <p class="eyebrow">TMDB 元数据 + 合规资源适配器</p>
            <h1>一个可扩展的影视资源索引工作台</h1>
            <p>参考 Prowlarr 的索引器抽象、Radarr/Sonarr 的质量规则，以及 TMDB 目录站的浏览体验，形成清晰分层的站点原型。</p>
          </div>
          <img src="./public/pr.png" alt="pr.png 需求草图" />
        </section>

        <section class="stats">
          ${stat("影视条目", stats.mediaCount)}
          ${stat("资源记录", stats.resourceCount)}
          ${stat("来源适配器", stats.sourceCount)}
          ${stat("中文资源", stats.zhSubtitleCount)}
        </section>

        <div class="section-head">
          <h2>资源目录</h2>
          <span>${mediaItems.length} 个匹配结果</span>
        </div>
        <section class="media-grid">${cards}</section>
      </section>
    </section>
  `;
}

export function renderDetail({ media, resources, quality, subtitle }) {
  return `
    <section class="detail">
      <div class="detail-backdrop" style="background-image: linear-gradient(90deg, rgba(15,23,42,.92), rgba(15,23,42,.62)), url('${media.backdrop}')"></div>
      <div class="detail-layout">
        <img class="poster" src="${media.poster}" alt="${escapeHtml(media.titleZh)} 海报" />
        <div class="detail-main">
          <a class="back-link" href="#/">返回目录</a>
          <h1>${escapeHtml(media.titleZh)}</h1>
          <p class="original">${escapeHtml(media.originalTitle)} · ${media.year} · ${media.runtime} 分钟</p>
          <div class="badges">
            <span>TMDB ${media.rating}</span>
            ${media.genres.map((genre) => `<span>${escapeHtml(genre)}</span>`).join("")}
            <span>${escapeHtml(media.country)}</span>
          </div>
          <p class="overview">${escapeHtml(media.overview)}</p>
        </div>
      </div>
    </section>

    <section class="resource-board">
      <div class="resource-toolbar">
        <div>
          <h2>可用资源</h2>
          <p>按质量、介质、活跃度、字幕与来源可信度综合排序。</p>
        </div>
        <div class="toolbar-controls">
          <button id="syncButton" class="primary-button" type="button">同步来源</button>
          <select id="qualityFilter">
            ${["all", "2160p", "1080p", "720p"].map((item) => option(item, item === "all" ? "全部清晰度" : item, quality)).join("")}
          </select>
          <select id="subtitleFilter">
            ${option("all", "全部字幕", subtitle)}
            ${option("中文", "中文字幕", subtitle)}
            ${option("多语言", "多语言字幕", subtitle)}
          </select>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>评分</th>
              <th>匹配</th>
              <th>资源标题</th>
              <th>质量</th>
              <th>来源</th>
              <th>音轨 / 字幕</th>
              <th>大小</th>
              <th>活跃</th>
            </tr>
          </thead>
          <tbody>${resources.map(renderResourceRow).join("") || `<tr><td colspan="8" class="empty">暂无匹配资源</td></tr>`}</tbody>
        </table>
      </div>
      <details class="manual-entry">
        <summary>手动添加资源</summary>
        <form id="manualResourceForm" class="manual-form">
          <input name="title" placeholder="资源标题" required />
          <input name="source" placeholder="来源名称" value="Manual Entry" />
          <select name="quality">
            <option value="2160p">2160p</option>
            <option value="1080p">1080p</option>
            <option value="720p">720p</option>
            <option value="SD">SD</option>
          </select>
          <select name="medium">
            <option value="REMUX">REMUX</option>
            <option value="BluRay">BluRay</option>
            <option value="WEB-DL">WEB-DL</option>
            <option value="WEBRip">WEBRip</option>
          </select>
          <input name="codec" placeholder="编码，例如 H.265" />
          <input name="audio" placeholder="音轨，例如 DDP 5.1" />
          <input name="subtitle" placeholder="字幕，例如 中文字幕" />
          <input name="sizeGb" type="number" step="0.1" placeholder="大小 GB" />
          <input name="seeders" type="number" placeholder="活跃数" />
          <input name="url" placeholder="来源链接或内部引用" />
          <button class="primary-button" type="submit">添加</button>
        </form>
      </details>
    </section>
  `;
}

export function renderArchitecture() {
  return `
    <section class="architecture">
      <div class="section-head">
        <h1>架构分层</h1>
        <span>生产 SaaS 分层与运营闭环</span>
      </div>
      <div class="layer-map">
        ${layer("Presentation UI", "页面渲染、筛选控件、表格、详情页", "src/ui")}
        ${layer("Application Services", "目录查询、资源聚合、状态编排、运营监控", "src/services")}
        ${layer("Domain", "搜索匹配、标题解析、资源排序评分", "src/domain")}
        ${layer("Adapters", "TMDB、Torznab、RSS、下载器、支付和邮件 provider", "src/adapters")}
        ${layer("Data", "PostgreSQL RLS、Redis、对象归档、审计与备份恢复", "server/services")}
      </div>
      <div class="flow">
        <div>Tenant Context</div>
        <span></span>
        <div>Media Catalog</div>
        <span></span>
        <div>Source Adapters</div>
        <span></span>
        <div>Billing & Worker</div>
        <span></span>
        <div>Monitoring</div>
      </div>
    </section>
  `;
}

export function renderAdmin({ adapters, syncLogs, reviewResources, me, users, auditLogs, workspaces, billing, plans, billingEvents, billingInvoices, monitoring, invitations, downloadClients, tasks, mediaItems }) {
  const onboarding = onboardingState({ adapters, syncLogs, workspaces, invitations, monitoring });
  return `
    <section class="admin">
      <div class="section-head">
        <h1>运营控制台</h1>
        <button id="adminRefreshButton" class="icon-button" type="button" title="刷新状态">${icons.refresh}</button>
      </div>
      <div class="admin-token">
        <label>管理员令牌</label>
        <input id="adminToken" placeholder="设置 ADMIN_TOKEN 后，写操作需要在这里填写令牌" />
      </div>
      <p id="adminError" class="admin-error" hidden></p>
      <div class="admin-auth">
        <form id="loginForm" class="login-form">
          <input name="email" type="email" placeholder="管理员邮箱" value="admin@example.local" required />
          <input name="password" type="password" placeholder="管理员密码" required />
          <button class="primary-button" type="submit">登录</button>
        </form>
        <div class="auth-status">
          <span>${me?.user ? `已登录：${escapeHtml(me.user.email)} · ${escapeHtml(me.user.role)}` : "未登录会话"}</span>
          <button id="logoutButton" type="button">退出</button>
        </div>
      </div>
      <div class="admin-token">
        <label>Workspace 切换</label>
        <select id="workspaceSwitch">
          <option value="">当前用户默认</option>
          ${(workspaces || []).map((workspace) => option(workspace.id, `${workspace.name} (${workspace.plan})`, "")).join("")}
        </select>
        <span class="muted">管理员可切换 workspace 查看隔离数据。</span>
      </div>
      <form id="passwordForm" class="admin-token">
        <label>修改密码</label>
        <input name="oldPassword" type="password" placeholder="原密码" />
        <input name="newPassword" type="password" placeholder="新密码，至少 8 位" />
        <button class="primary-button" type="submit">修改</button>
      </form>
      ${renderOnboarding({ onboarding, workspaces, adapters, mediaItems, monitoring })}
      <section class="ops-dashboard">
        <article>
          <strong class="${monitoring?.ok === false ? "danger-text" : "success-text"}">${monitoring?.ok === false ? "告警" : "健康"}</strong>
          <span>生产监控</span>
        </article>
        <article>
          <strong>${monitoring?.metrics?.backup?.latestAgeHours == null ? "-" : formatHours(monitoring.metrics.backup.latestAgeHours)}</strong>
          <span>最近备份</span>
        </article>
        <article>
          <strong>${monitoring?.metrics?.tasks ? Object.values(monitoring.metrics.tasks).reduce((sum, value) => sum + Number(value || 0), 0) : tasks?.length || 0}</strong>
          <span>任务总量</span>
        </article>
        <article>
          <strong>${billingInvoices?.length || 0}</strong>
          <span>发票记录</span>
        </article>
      </section>
      ${renderCommercialStrategy(billing)}
      <div class="admin-grid">
        <section class="admin-panel">
          <div class="panel-heading">
            <h2>生产监控</h2>
            <button id="monitoringRunButton" type="button">立即检查</button>
          </div>
          ${renderMonitoring(monitoring)}
        </section>
        <section class="admin-panel">
          <h2>支付运营</h2>
          <div class="log-list">
            ${(billingInvoices || [])
              .slice(0, 6)
              .map(
                (invoice) => `
                  <article>
                    <strong>${escapeHtml(invoice.provider)} · ${escapeHtml(invoice.status)}</strong>
                    <span>${money(invoice.amountCents, invoice.currency)} · ${escapeHtml(invoice.planName || "未绑定套餐")} · ${escapeHtml(invoice.createdAt || "")}</span>
                    <div class="inline-actions">
                      ${invoice.invoiceUrl ? `<a class="small-action" href="${escapeHtml(invoice.invoiceUrl)}" target="_blank" rel="noreferrer">发票</a>` : ""}
                      ${invoice.invoicePdf ? `<a class="small-action" href="${escapeHtml(invoice.invoicePdf)}" target="_blank" rel="noreferrer">PDF</a>` : ""}
                      <button data-refund-invoice="${escapeHtml(invoice.id)}">退款</button>
                    </div>
                  </article>
                `,
              )
              .join("") || `<p class="muted">暂无发票记录。</p>`}
          </div>
        </section>
      </div>
      <form id="sourceForm" class="source-form">
        <div>
          <label>来源 ID</label>
          <input name="id" placeholder="prowlarr-main" required />
        </div>
        <div>
          <label>名称</label>
          <input name="name" placeholder="Prowlarr Main" required />
        </div>
        <div>
          <label>类型</label>
          <select name="type">
            <option value="torznab">torznab</option>
            <option value="rss">rss</option>
            <option value="internal">internal</option>
            <option value="api">api</option>
            <option value="private">private</option>
          </select>
        </div>
        <div>
          <label>权重</label>
          <input name="weight" type="number" step="0.1" value="1" />
        </div>
        <div class="wide">
          <label>Base URL</label>
          <input name="baseUrl" placeholder="Torznab / Prowlarr / Jackett API URL" />
        </div>
        <div class="wide">
          <label>RSS URL</label>
          <input name="url" placeholder="授权 RSS 地址" />
        </div>
        <div class="wide">
          <label>API Key</label>
          <input name="apiKey" placeholder="凭据仅保存在本地配置中" />
        </div>
        <label class="check-row">
          <input name="enabled" type="checkbox" />
          <span>启用来源</span>
        </label>
        <button class="primary-button" type="submit">保存来源</button>
      </form>
      <div class="adapter-list">
        ${adapters
          .map(
            (adapter) => `
              <article class="adapter">
                <div>
                  <h3>${escapeHtml(adapter.name)}</h3>
                  <p>${escapeHtml(adapter.type)} · ${escapeHtml(adapter.baseUrl || adapter.url || "local")}</p>
                </div>
                <div class="adapter-actions">
                  <span class="status ${adapter.enabled ? "online" : "disabled"}">${adapter.enabled ? "enabled" : "disabled"}</span>
                  <button data-edit-source data-source="${escapeHtml(JSON.stringify(adapter))}">编辑</button>
                  <button data-test-source="${escapeHtml(adapter.id)}">测试</button>
                  <button data-caps-source="${escapeHtml(adapter.id)}">Caps</button>
                  <button data-delete-source="${escapeHtml(adapter.id)}">删除</button>
                </div>
              </article>
            `,
          )
          .join("")}
      </div>
      <div class="admin-grid">
        <section class="admin-panel">
          <h2>Caps 输出</h2>
          <pre id="capsOutput">选择一个来源读取能力。</pre>
        </section>
        <section class="admin-panel">
          <h2>同步日志</h2>
          <div class="log-list">
            ${(syncLogs || [])
              .slice(0, 8)
              .map(
                (log) => `
                  <article>
                    <strong>${escapeHtml(log.status)} · ${escapeHtml(log.type)}</strong>
                    <span>${escapeHtml(log.createdAt)} · 导入 ${log.importedCount ?? 0} · 错误 ${(log.errors || []).length}</span>
                  </article>
                `,
              )
              .join("") || `<p class="muted">暂无同步日志。</p>`}
          </div>
        </section>
      </div>
      <div class="admin-grid">
        <section class="admin-panel">
          <h2>低置信度审核</h2>
          <div class="log-list">
            ${(reviewResources || [])
              .slice(0, 8)
              .map(
                (resource) => `
                  <article>
                    <strong>${escapeHtml(resource.title)}</strong>
                    <span>匹配 ${resource.matchScore ?? 0} · ${escapeHtml(resource.source || "未知来源")}</span>
                    <div class="inline-actions">
                      <button data-review-resource="${escapeHtml(resource.id)}" data-review-status="active">通过</button>
                      <button data-review-resource="${escapeHtml(resource.id)}" data-review-status="rejected">拒绝</button>
                    </div>
                  </article>
                `,
              )
              .join("") || `<p class="muted">暂无需要审核的资源。</p>`}
          </div>
        </section>
        <section class="admin-panel">
          <h2>TMDB 导入</h2>
          <form id="tmdbForm" class="tmdb-form">
            <input name="query" placeholder="搜索电影或剧集，例如 Dune" required />
            <button class="primary-button" type="submit">搜索</button>
          </form>
          <div id="tmdbResults" class="tmdb-results">配置 TMDB_API_KEY 后可导入真实媒体元数据。</div>
        </section>
      </div>
      <div class="admin-grid">
        <section class="admin-panel">
          <h2>下载器</h2>
          <form id="downloadClientForm" class="user-form">
            <input name="id" placeholder="client-id" required />
            <input name="name" placeholder="名称" required />
            <select name="type"><option value="qbittorrent">qBittorrent</option><option value="transmission">Transmission</option></select>
            <input name="baseUrl" placeholder="http://127.0.0.1:8080" />
            <input name="username" placeholder="用户名" />
            <input name="password" type="password" placeholder="密码" />
            <label class="check-row"><input name="enabled" type="checkbox" /><span>启用</span></label>
            <button class="primary-button" type="submit">保存下载器</button>
          </form>
          <div class="log-list">
            ${(downloadClients || []).map((client) => `<article><strong>${escapeHtml(client.name)}</strong><span>${escapeHtml(client.type)} · ${escapeHtml(client.baseUrl || "")} · ${client.enabled ? "enabled" : "disabled"}</span><div class="inline-actions"><button data-test-download="${escapeHtml(client.id)}">测试</button></div></article>`).join("") || `<p class="muted">暂无下载器。</p>`}
          </div>
        </section>
        <section class="admin-panel">
          <h2>任务队列</h2>
          <form id="taskForm" class="user-form">
            <input name="title" placeholder="任务标题" required />
            <select name="clientId">
              <option value="">不指定下载器</option>
              ${(downloadClients || []).map((client) => option(client.id, client.name, "")).join("")}
            </select>
            <input name="resourceId" placeholder="资源 ID（可选）" />
            <button class="primary-button" type="submit">创建任务</button>
          </form>
          <div class="log-list">
            ${(tasks || []).map((task) => `<article><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.type)} · ${escapeHtml(task.status)} · ${escapeHtml(task.createdAt || "")}</span><div class="inline-actions"><button data-rerun-task="${escapeHtml(task.id)}">重跑</button></div></article>`).join("") || `<p class="muted">暂无任务。</p>`}
          </div>
        </section>
      </div>
      <div class="admin-grid">
        <section class="admin-panel">
          <h2>套餐</h2>
          <div class="log-list">
            <article>
              <strong>${escapeHtml(billing?.name || "unknown")}</strong>
              <span>用户 ${billing?.limits?.users ?? "-"} · 来源 ${billing?.limits?.sources ?? "-"} · 同步间隔 ${billing?.limits?.syncIntervalMinutes ?? "-"} 分钟 · ${commercialLabel(billing?.commercial)}</span>
            </article>
            ${(plans || [])
              .map((plan) => `<article><strong>${escapeHtml(plan.name)}</strong><span>users ${plan.limits.users} · sources ${plan.limits.sources} · sync ${plan.limits.syncIntervalMinutes}m · 免费 ${plan.commercial?.trialDays ?? 180} 天</span><div class="inline-actions"><button data-change-plan="${escapeHtml(plan.name)}">切换</button></div></article>`)
              .join("")}
            <article>
              <strong>当前用量</strong>
              <span>用户 ${billing?.usage?.users ?? 0} · 邀请 ${billing?.usage?.pendingInvitations ?? 0} · 来源 ${billing?.usage?.sources ?? 0} · 任务 ${billing?.usage?.tasks ?? 0}</span>
            </article>
            ${(billingEvents || []).slice(0, 6).map((event) => `
              <article>
                <strong>${escapeHtml(event.type)}</strong>
                <span>${escapeHtml(event.status)} · ${escapeHtml(event.createdAt || "")}</span>
                ${event.payload?.raw ? `<div class="inline-actions"><button data-replay-webhook="${escapeHtml(event.id)}">重放 webhook</button></div>` : ""}
              </article>
            `).join("")}
          </div>
        </section>
        <section class="admin-panel">
          <h2>Workspace</h2>
          <form id="workspaceForm" class="user-form">
            <input name="name" placeholder="Workspace 名称" required />
            <select name="plan">
              <option value="starter">starter</option>
              <option value="team">team</option>
              <option value="business">business</option>
            </select>
            <button class="primary-button" type="submit">创建 Workspace</button>
          </form>
          <div class="log-list">
            ${(workspaces || [])
              .map(
                (workspace) => `
                  <article>
                    <strong>${escapeHtml(workspace.name)}</strong>
                    <span>${escapeHtml(workspace.id)} · ${escapeHtml(workspace.plan)} · ${workspace.enabled ? "enabled" : "disabled"}</span>
                  </article>
                `,
              )
              .join("") || `<p class="muted">暂无 workspace 或需要管理员权限。</p>`}
          </div>
        </section>
        <section class="admin-panel">
          <h2>权限配置</h2>
          <div class="permission-matrix">
            ${permissionRow("admin", "全部后台配置、用户、Workspace、计费、来源和审计")}
            ${permissionRow("operator", "来源查看/测试、资源审核、媒体同步、健康检查、任务队列")}
            ${permissionRow("viewer", "来源查看、目录浏览、资源检索")}
          </div>
          <p class="muted">权限由后端 RBAC 执行，邀请或编辑用户角色后立即生效。</p>
        </section>
        <section class="admin-panel">
          <h2>用户</h2>
          <form id="inviteForm" class="user-form">
            <input name="email" type="email" placeholder="邀请邮箱" required />
            <input name="name" placeholder="姓名" />
            <select name="workspaceId">
              ${(workspaces || []).map((workspace) => option(workspace.id, workspace.name, "")).join("")}
            </select>
            <select name="role">
              <option value="viewer">viewer</option>
              <option value="operator">operator</option>
              <option value="admin">admin</option>
            </select>
            <button class="primary-button" type="submit">邀请用户</button>
          </form>
          <p id="inviteOutput" class="muted"></p>
          <div class="log-list">
            ${(invitations || [])
              .slice(0, 5)
              .map((invite) => `<article><strong>${escapeHtml(invite.email)}</strong><span>${escapeHtml(invite.role)} · ${escapeHtml(invite.status)} · 过期 ${escapeHtml(invite.expiresAt || "")}</span></article>`)
              .join("") || `<p class="muted">暂无邀请。</p>`}
          </div>
          <form id="userForm" class="user-form">
            <input name="email" type="email" placeholder="邮箱" required />
            <input name="name" placeholder="姓名" required />
            <select name="workspaceId">
              ${(workspaces || []).map((workspace) => option(workspace.id, workspace.name, "")).join("")}
            </select>
            <select name="role">
              <option value="admin">admin</option>
              <option value="operator">operator</option>
              <option value="viewer">viewer</option>
            </select>
            <input name="password" type="password" placeholder="初始密码" required />
            <button class="primary-button" type="submit">创建用户</button>
          </form>
          <div class="log-list">
            ${(users || [])
              .slice(0, 8)
              .map(
                (user) => `
                  <article>
                    <strong>${escapeHtml(user.email)}</strong>
                    <span>${escapeHtml(user.name)} · ${escapeHtml(user.workspaceId || "default")} · ${escapeHtml(user.role)} · ${user.enabled ? "enabled" : "disabled"}</span>
                    <div class="inline-actions">
                      <select data-user-workspace="${escapeHtml(user.id)}">
                        ${(workspaces || []).map((workspace) => option(workspace.id, workspace.name, user.workspaceId || "default")).join("")}
                      </select>
                      <select data-user-role="${escapeHtml(user.id)}">
                        ${["admin", "operator", "viewer"].map((role) => option(role, role, user.role)).join("")}
                      </select>
                      <button data-user-toggle="${escapeHtml(user.id)}" data-enabled="${user.enabled}">${user.enabled ? "禁用" : "启用"}</button>
                      <button data-user-reset="${escapeHtml(user.id)}">重置密码</button>
                    </div>
                  </article>
                `,
              )
              .join("") || `<p class="muted">暂无用户或需要管理员权限。</p>`}
          </div>
        </section>
        <section class="admin-panel">
          <h2>审计日志</h2>
          <div class="log-list">
            ${(auditLogs || [])
              .slice(0, 8)
              .map(
                (log) => `
                  <article>
                    <strong>${escapeHtml(log.action)}</strong>
                    <span>${escapeHtml(log.createdAt)} · ${escapeHtml(log.actorEmail || "system")} · ${escapeHtml(log.targetType || "")}:${escapeHtml(log.targetId || "")}</span>
                  </article>
                `,
              )
              .join("") || `<p class="muted">暂无审计日志或需要管理员权限。</p>`}
          </div>
        </section>
      </div>
    </section>
  `;
}

export function renderInvite({ token }) {
  return `
    <section class="admin">
      <div class="section-head">
        <h1>接受邀请</h1>
        <span>设置密码后即可加入 workspace</span>
      </div>
      <form id="acceptInviteForm" class="admin-panel user-form">
        <input name="token" value="${escapeHtml(token)}" placeholder="邀请 token" required />
        <input name="password" type="password" placeholder="设置密码，至少 8 位" required />
        <button class="primary-button" type="submit">接受邀请</button>
      </form>
      <p id="inviteAcceptOutput" class="muted"></p>
    </section>
  `;
}

function renderMediaCard(item) {
  return `
    <a class="media-card" href="#/media/${item.id}">
      <img src="${item.poster}" alt="${escapeHtml(item.titleZh)} 海报" />
      <div>
        <h3>${escapeHtml(item.titleZh)}</h3>
        <p>${escapeHtml(item.titleEn)} · ${item.year}</p>
        <div class="badges small">
          <span>${item.type === "movie" ? "电影" : "剧集"}</span>
          <span>资源 ${item.resourceCount}</span>
          <span>TMDB ${item.rating}</span>
        </div>
      </div>
    </a>
  `;
}

function renderResourceRow(resource) {
  return `
    <tr>
      <td><strong>${resource.score}</strong></td>
      <td>${resource.matchScore ?? 70}</td>
      <td class="title-cell">${escapeHtml(resource.title)}</td>
      <td><span class="quality">${resource.quality}</span><span class="muted">${resource.medium}</span></td>
      <td>${escapeHtml(resource.source)}<span class="muted">${escapeHtml(resource.sourceType)}</span></td>
      <td>${escapeHtml(resource.audio)}<span class="muted">${escapeHtml(resource.subtitle)}</span></td>
      <td>${resource.sizeGb} GB</td>
      <td>${resource.seeders}</td>
    </tr>
  `;
}

function stat(label, value) {
  return `<article><strong>${value}</strong><span>${label}</span></article>`;
}

function layer(title, desc, path) {
  return `
    <article>
      <strong>${title}</strong>
      <p>${desc}</p>
      <code>${path}</code>
    </article>
  `;
}

function permissionRow(role, desc) {
  return `
    <article>
      <strong>${role}</strong>
      <span>${desc}</span>
    </article>
  `;
}

function onboardingState({ adapters, syncLogs, workspaces, invitations, monitoring }) {
  const enabledSource = (adapters || []).find((source) => source.enabled);
  const testedSource = (adapters || []).find((source) => source.health);
  const firstSync = (syncLogs || []).find((log) => log.type === "media-resource-sync");
  const steps = [
    { key: "workspace", done: (workspaces || []).length > 0, title: "创建 workspace", desc: "为客户建立独立租户空间，并自动切换到该 workspace。" },
    { key: "invite", done: (invitations || []).length > 0, title: "邀请成员", desc: "发送一次性邀请 token，验证团队协作和 RBAC 流程。" },
    { key: "source", done: Boolean(enabledSource), title: "添加来源", desc: "接入 Torznab、RSS 或 internal 授权来源，并启用同步。" },
    { key: "test", done: Boolean(testedSource), title: "测试来源", desc: "确认来源连通性，健康结果会进入监控和来源状态。" },
    { key: "sync", done: Boolean(firstSync), title: "首次同步", desc: "选一部媒体触发同步，让客户看到资源进入审核和排序链路。" },
    { key: "monitoring", done: Boolean(monitoring), title: "查看监控", desc: "展示备份、任务、来源健康和告警阈值，完成生产运营闭环。" },
  ];
  return {
    enabledSource,
    testedSource,
    firstSync,
    completed: steps.filter((step) => step.done).length,
    steps,
  };
}

function renderOnboarding({ onboarding, workspaces, adapters, mediaItems, monitoring }) {
  const firstSource = (adapters || [])[0];
  const selectedWorkspace = workspaces?.[0]?.id || "default";
  return `
    <section class="onboarding">
      <div class="onboarding-head">
        <div>
          <p class="eyebrow">客户首次使用向导</p>
          <h2>从 0 到 1 跑通一个 SaaS 租户</h2>
        </div>
        <strong>${onboarding.completed}/${onboarding.steps.length}</strong>
      </div>
      ${onboarding.completed === onboarding.steps.length ? `
        <div class="onboarding-complete">
          <strong>试点环境已就绪</strong>
          <span>可以继续配置真实邮件、支付 sandbox、对象存储归档、RLS 生产角色和监控 webhook。</span>
        </div>
      ` : ""}
      <div class="onboarding-steps">
        ${onboarding.steps.map((step, index) => `
          <article class="${step.done ? "done" : ""}">
            <span>${step.done ? "完成" : String(index + 1).padStart(2, "0")}</span>
            <strong>${step.title}</strong>
            <p>${step.desc}</p>
          </article>
        `).join("")}
      </div>
      <div class="onboarding-actions">
        <form id="onboardingWorkspaceForm" class="onboarding-form">
          <strong>1. 创建 workspace</strong>
          <input name="name" placeholder="客户公司或团队名称" required />
          <select name="plan">
            <option value="starter">starter</option>
            <option value="team">team</option>
            <option value="business">business</option>
          </select>
          <button class="primary-button" type="submit">创建并切换</button>
        </form>
        <form id="onboardingInviteForm" class="onboarding-form">
          <strong>2. 邀请成员</strong>
          <input name="email" type="email" placeholder="member@example.com" required />
          <input name="name" placeholder="成员姓名" />
          <select name="workspaceId">
            ${(workspaces || []).map((workspace) => option(workspace.id, workspace.name, selectedWorkspace)).join("") || option("default", "Default Workspace", "default")}
          </select>
          <select name="role">
            <option value="operator">operator</option>
            <option value="viewer">viewer</option>
            <option value="admin">admin</option>
          </select>
          <button class="primary-button" type="submit">发送邀请</button>
          <p id="onboardingInviteOutput" class="muted"></p>
        </form>
        <form id="onboardingSourceForm" class="onboarding-form wide">
          <strong>3. 添加来源</strong>
          <input name="id" placeholder="prowlarr-main" required />
          <input name="name" placeholder="Prowlarr Main" required />
          <select name="type">
            <option value="torznab">torznab</option>
            <option value="rss">rss</option>
            <option value="internal">internal</option>
          </select>
          <input name="baseUrl" placeholder="Torznab / Prowlarr / Jackett API URL" />
          <input name="url" placeholder="RSS URL" />
          <input name="apiKey" placeholder="API Key" />
          <input name="weight" type="number" step="0.1" value="1" />
          <label class="check-row"><input name="enabled" type="checkbox" checked /><span>启用</span></label>
          <button class="primary-button" type="submit">保存来源</button>
        </form>
        <div class="onboarding-form">
          <strong>4. 测试来源</strong>
          <select disabled>
            ${(adapters || []).map((source) => option(source.id, source.name, firstSource?.id || "")).join("") || option("", "暂无来源", "")}
          </select>
          <button class="primary-button" type="button" data-onboarding-test-source="${escapeHtml(firstSource?.id || "")}" ${firstSource ? "" : "disabled"}>测试第一个来源</button>
          <p class="muted">${firstSource?.health ? `最近状态：${firstSource.health.ok ? "可用" : "失败"}` : "测试后会写入来源健康状态。"}</p>
        </div>
        <form id="onboardingSyncForm" class="onboarding-form">
          <strong>5. 首次同步</strong>
          <select name="mediaId">
            ${(mediaItems || []).slice(0, 20).map((item) => option(item.id, item.titleZh || item.titleEn || item.id, "")).join("")}
          </select>
          <button class="primary-button" type="submit" ${(mediaItems || []).length ? "" : "disabled"}>同步选中媒体</button>
          <p class="muted">同步会触发来源聚合、排序和低置信度审核。</p>
        </form>
        <div class="onboarding-form">
          <strong>6. 查看监控</strong>
          <button id="onboardingMonitoringButton" class="primary-button" type="button">运行监控检查</button>
          <p class="muted">${monitoring ? `当前状态：${monitoring.ok ? "健康" : "有告警"}` : "需要平台管理员权限。"}</p>
        </div>
      </div>
    </section>
  `;
}

function renderMonitoring(monitoring) {
  if (!monitoring) return `<p class="muted">登录平台管理员后可查看生产监控。</p>`;
  const alerts = monitoring.alerts || [];
  return `
    <div class="monitoring-summary">
      <span class="${monitoring.ok ? "status online" : "status danger"}">${monitoring.ok ? "healthy" : "alerting"}</span>
      <span>检查时间 ${escapeHtml(monitoring.checkedAt || "-")}</span>
    </div>
    <div class="log-list">
      <article>
        <strong>数据库与备份</strong>
        <span>${escapeHtml(monitoring.metrics?.driver || "-")} · 最新备份 ${monitoring.metrics?.backup?.latestAgeHours == null ? "-" : formatHours(monitoring.metrics.backup.latestAgeHours)} · 文件 ${monitoring.metrics?.backup?.fileCount ?? 0}</span>
      </article>
      <article>
        <strong>任务队列</strong>
        <span>${Object.entries(monitoring.metrics?.tasks || {}).map(([key, value]) => `${key} ${value}`).join(" · ") || "暂无任务"}</span>
      </article>
      <article>
        <strong>来源健康</strong>
        <span>失败 ${monitoring.metrics?.sources?.failed ?? 0} · 最近检查 ${escapeHtml(monitoring.metrics?.sources?.latestCheckedAt || "-")}</span>
      </article>
      ${alerts.map((alert) => `<article class="alert-row"><strong>${escapeHtml(alert.metric)}</strong><span>${escapeHtml(alert.message)} · ${escapeHtml(alert.value ?? "-")} / ${escapeHtml(alert.threshold ?? "-")}</span></article>`).join("")}
    </div>
  `;
}

function renderCommercialStrategy(billing) {
  const commercial = billing?.commercial;
  if (!commercial) return "";
  return `
    <section class="growth-strategy">
      <article>
        <strong>前 ${commercial.trialDays ?? 180} 天免费</strong>
        <span>${commercial.trialActive ? `剩余 ${commercial.trialRemainingDays ?? "-"} 天` : "免费期已结束"} · 计费模式 ${escapeHtml(commercial.billingMode || "manual")}</span>
      </article>
      <article>
        <strong>${commercial.ads?.enabled ? "广告营收已启用" : "广告营收待启用"}</strong>
        <span>${escapeHtml(commercial.ads?.provider || "manual")} · ${escapeHtml(commercial.ads?.placement || "catalog-sidebar")} · 建议 ${commercial.ads?.minActiveWorkspaces ?? 50}+ 活跃租户后开启</span>
      </article>
      <article>
        <strong>推广策略</strong>
        <span>${escapeHtml(commercial.acquisitionMode || "free_first")} · 先用免费期换取用户与流量，后续用广告位和付费套餐变现。</span>
      </article>
    </section>
  `;
}

function commercialLabel(commercial) {
  if (!commercial) return "商业策略未配置";
  if (commercial.trialActive) return `免费期剩余 ${commercial.trialRemainingDays ?? "-"} 天`;
  return `计费模式 ${commercial.billingMode || "manual"}`;
}

function formatHours(hours) {
  const value = Number(hours);
  if (!Number.isFinite(value)) return "-";
  if (value < 1) return `${Math.max(1, Math.round(value * 60))} 分钟`;
  return `${value.toFixed(1)} 小时`;
}

function money(amountCents, currency = "USD") {
  const amount = Number(amountCents || 0) / 100;
  return `${currency} ${amount.toFixed(2)}`;
}

function option(value, label, current) {
  return `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
