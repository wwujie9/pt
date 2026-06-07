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
        <span>可从静态原型迁移到 Next.js / API 服务</span>
      </div>
      <div class="layer-map">
        ${layer("Presentation UI", "页面渲染、筛选控件、表格、详情页", "src/ui")}
        ${layer("Application Services", "目录查询、资源聚合、状态编排", "src/services")}
        ${layer("Domain", "搜索匹配、标题解析、资源排序评分", "src/domain")}
        ${layer("Adapters", "TMDB、内部资源源、授权索引、公共源", "src/adapters")}
        ${layer("Data", "seed 数据；后续替换为 PostgreSQL / Prisma", "src/data")}
      </div>
      <div class="flow">
        <div>TMDB Metadata</div>
        <span></span>
        <div>Media Catalog</div>
        <span></span>
        <div>Source Adapters</div>
        <span></span>
        <div>Ranking Engine</div>
        <span></span>
        <div>Resource Table</div>
      </div>
    </section>
  `;
}

export function renderAdmin({ adapters, syncLogs, reviewResources, me, users, auditLogs, workspaces, billing, plans, billingEvents, invitations, downloadClients, tasks }) {
  return `
    <section class="admin">
      <div class="section-head">
        <h1>来源管理</h1>
        <a class="icon-button" href="#/admin" title="刷新状态">${icons.refresh}</a>
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
              <span>用户 ${billing?.limits?.users ?? "-"} · 来源 ${billing?.limits?.sources ?? "-"} · 同步间隔 ${billing?.limits?.syncIntervalMinutes ?? "-"} 分钟</span>
            </article>
            ${(plans || [])
              .map((plan) => `<article><strong>${escapeHtml(plan.name)}</strong><span>users ${plan.limits.users} · sources ${plan.limits.sources} · sync ${plan.limits.syncIntervalMinutes}m</span><div class="inline-actions"><button data-change-plan="${escapeHtml(plan.name)}">切换</button></div></article>`)
              .join("")}
            <article>
              <strong>当前用量</strong>
              <span>用户 ${billing?.usage?.users ?? 0} · 邀请 ${billing?.usage?.pendingInvitations ?? 0} · 来源 ${billing?.usage?.sources ?? 0} · 任务 ${billing?.usage?.tasks ?? 0}</span>
            </article>
            ${(billingEvents || []).slice(0, 4).map((event) => `<article><strong>${escapeHtml(event.type)}</strong><span>${escapeHtml(event.status)} · ${escapeHtml(event.createdAt || "")}</span></article>`).join("")}
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
