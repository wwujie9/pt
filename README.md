# PT Resource Hub

一个面向授权 PT / Torznab / Jackett / Prowlarr / RSS / 私有库的媒体资源索引与管理工作台。

## 推广定位

当前版本已经可以作为“生产 SaaS 试点版”对外演示和小范围试运行。它不是单纯静态目录页，而是包含资源聚合、租户隔离、用户邀请、套餐限制、支付运营、任务队列、备份恢复和监控告警的一整套后台工作台。

适合推广时强调：

- 面向授权来源的统一资源发现与审核。
- Prowlarr / Jackett / Torznab / RSS 等来源适配能力。
- Workspace 级数据隔离与 PostgreSQL RLS 第二道防线。
- Starter / Team / Business 套餐限制和支付 webhook 自动同步。
- 下载器联动、任务队列和独立 worker。
- PostgreSQL 备份、对象归档、恢复 SLA 演练和生产监控。
- GitHub Actions CI、Docker 镜像构建、Trivy 安全扫描和生产 compose。

建议推广节奏：

- 免费获客期：默认 `FREE_TRIAL_DAYS=180`，前半年先免费获取用户、来源接入案例和自然流量。
- 对客户演示：使用本地或预发环境，登录 `#/admin` 后先走“客户首次使用向导”，再展示运营控制台、来源管理、Workspace、邀请、套餐、支付运营和监控。
- 小范围试点：使用 PostgreSQL + Redis + worker + RLS + HTTPS，先接入客户已有授权来源。
- 量起来后：设置 `ENABLE_ADS=1` 并接入广告 provider，优先在目录侧边栏、详情页资源区等低打扰位置做营收。
- 正式上线：接入真实邮件、支付 sandbox 验证、对象存储备份、监控 webhook、广告审核策略和定期恢复演练。

## 当前交付状态

当前版本已经具备：

- 固定端口 `4273`。
- SQLite 本地数据库：`storage/app.db`，生产推荐 PostgreSQL。
- 媒体目录、详情页、资源列表。
- 来源管理 CRUD。
- Torznab / RSS / internal 适配器。
- Torznab caps 与来源测试。
- 手动资源添加。
- 资源匹配置信度与低置信度审核队列。
- 同步日志。
- TMDB 搜索与导入接口骨架。
- 可选 `ADMIN_TOKEN` 写操作保护。
- 管理员登录、会话 token、用户列表。
- 用户创建、禁用、角色修改、密码重置。
- Workspace 创建、切换与数据级租户隔离。
- media / resources / sources / sync logs / source health 按 `workspace_id` 隔离。
- 邀请用户流程与 workspace 绑定。
- 邀请接受页面、过期时间、一次性 token 与邮件 webhook。
- Starter / Team / Business 套餐限制：用户数、来源数、同步频率。
- 套餐切换、checkout 事件与 workspace 用量统计。
- 下载器配置与任务队列管理。
- 独立 worker 进程处理任务队列状态机。
- workspace 级审计日志。
- 来源 API Key 加密存储与前端脱敏。
- 可选后台健康检查调度。
- 可选 Webhook 通知。
- HTTP 安全响应头。
- API 简易限流。
- 数据库迁移记录。
- 健康检查与备份导出 API。
- 烟测脚本。
- SaaS E2E 脚本与 GitHub Actions CI。
- PostgreSQL runtime adapter、迁移路径与生产 schema。
- PostgreSQL 版本化 migrations 目录。
- PostgreSQL RLS 请求级事务封装、session context 和低权限 runtime role。
- Stripe / Lemon Squeezy checkout 与签名 webhook。
- Resend / SMTP relay / webhook 邮件 provider。
- PostgreSQL `pg_dump` 备份与恢复演练脚本。
- S3/R2/MinIO 对象存储备份归档。
- 恢复 SLA 演练指标。
- 支付发票查询、退款记录、webhook 重放和 sandbox 合同测试。
- 备份生命周期策略与生产监控告警。
- 客户首次使用向导：创建 workspace、邀请成员、添加来源、测试来源、首次同步、查看监控。
- 管理页运营控制台：监控健康、备份新鲜度、任务总量、发票、退款、webhook 重放。
- 免费获客商业策略：前 180 天免费、广告营收开关、广告位与活跃租户阈值配置。
- 现有流量站点嵌入：公开 `embed.js`、UTM 归因、来源站点统计、广告展示/点击统计。
- Redis 多实例共享限流。
- Trivy 镜像安全扫描与 Dependabot。

## 启动

```powershell
npm run dev
```

独立任务 worker：

```powershell
npm run worker
```

访问：

```text
http://127.0.0.1:4273
```

## 环境变量

可参考 `.env.example`。

PowerShell 临时设置：

```powershell
$env:PORT='4273'
$env:TMDB_API_KEY='你的 TMDB API Key'
$env:ADMIN_TOKEN='你的管理员令牌'
$env:REQUIRE_AUTH='1'
$env:ALLOW_INSECURE_DEV='0'
$env:ADMIN_EMAIL='admin@example.local'
$env:ADMIN_PASSWORD='请改成强密码'
$env:CREDENTIAL_SECRET='请改成随机长密钥'
$env:RATE_LIMIT_WINDOW_MS='60000'
$env:RATE_LIMIT_MAX='180'
$env:BACKUP_DIR='storage/backups'
$env:LOGIN_MAX_FAILURES='5'
$env:LOGIN_LOCK_MINUTES='15'
npm run dev
```

如果设置了 `ADMIN_TOKEN`，管理页需要填写管理员令牌后才能执行保存来源、删除来源、同步来源、手动添加资源、审核资源、导入 TMDB 等写操作。

生产默认要求管理员登录或 `ADMIN_TOKEN`。仅本地调试时可设置 `ALLOW_INSECURE_DEV=1` 放开敏感接口。

## 数据库驱动

默认使用 SQLite：

```env
DATABASE_DRIVER=sqlite
```

切换 PostgreSQL：

```env
DATABASE_DRIVER=postgres
DATABASE_URL=postgres://user:password@host:5432/pt_resource_hub
```

PostgreSQL 启动时会执行 `deploy/postgres-schema.sql` 并使用同一套服务层 API。未设置 `DATABASE_URL` 时服务会拒绝启动，避免误以为已经切库。

## Docker

```powershell
docker compose up --build
```

本地 Docker 推广验收一键跑：

```powershell
npm run demo:docker
```

该命令会启动 `postgres`、`redis`、`pt-resource-hub`、`pt-resource-worker`，准备演示数据，生成 PostgreSQL 备份，并执行 smoke、SaaS E2E、支付 sandbox 合同、监控检查和商业策略校验。默认访问地址是 `http://127.0.0.1:4273`。

上线前务必修改 `docker-compose.yml` 中的：

- `ADMIN_PASSWORD`
- `ADMIN_TOKEN`
- `CREDENTIAL_SECRET`

生产服务器推荐使用 GHCR 镜像与 PostgreSQL：

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production -f deploy/docker-compose.prod.yml up -d
```

完整风险清单、CI/CD 和发布步骤见 `docs/risk-and-deployment-plan.md`。
高级生产能力启用步骤见 `docs/advanced-production-capabilities.md`。
生产 SaaS 执行路线图见 `docs/execution-roadmap.md`。

## 烟测

服务启动后运行：

```powershell
npm run test:smoke
```

SaaS E2E：

```powershell
npm run test:e2e
```

注意：`test:e2e` 会创建测试 workspace、来源、邀请用户、下载器和任务。只在本地测试库、CI 临时环境或可清理的预发环境运行，不要把 `APP_URL` 指向生产环境。

文件级备份：

```powershell
npm run backup
```

数据库迁移记录：

```sql
SELECT * FROM schema_migrations;
```

命令行检查：

```powershell
npm run db:migrations
```

生产运营检查：

```powershell
npm run demo:docker
npm run demo:seed
npm run monitoring:check
npm run backup:lifecycle
```

## 演示路径

推荐用这条路径做首次客户演示：

1. 运行 `npm run demo:seed` 准备演示 workspace、演示来源、邀请、同步日志、账单发票和监控状态。
2. 打开 `http://127.0.0.1:4273/#/admin` 并登录管理员。
3. 在 workspace 切换器选择 `Demo Customer Workspace`。
4. 在“客户首次使用向导”查看完成态，或重新按步骤创建 workspace、邀请成员、添加来源。
5. 点击“测试第一个来源”，确认来源健康状态写入。
6. 选择一部媒体执行首次同步，查看同步日志和低置信度审核。
7. 点击“运行监控检查”，展示备份、任务、来源健康和告警状态。
8. 切到支付运营区，展示发票、退款记录和 webhook 重放能力。
9. 切到“流量归因 / 广告位配置”，复制 `embed.js` 到现有流量站点，展示访问归因、广告展示和点击统计。

## 现有流量站点接入

把下面脚本放到已有站点的资源页、榜单页或专题页即可嵌入资源榜单：

```html
<script src="http://127.0.0.1:4273/embed.js?workspaceId=demo-workspace&limit=6&utm_campaign=existing-traffic"></script>
```

支持三种展示模式：

```html
<!-- 海报网格，适合专题页或资源列表页 -->
<script src="http://127.0.0.1:4273/embed.js?workspaceId=demo-workspace&mode=poster-grid&limit=6&utm_campaign=existing-traffic"></script>

<!-- 列表模式，适合文章侧栏 -->
<script src="http://127.0.0.1:4273/embed.js?workspaceId=demo-workspace&mode=list&limit=6&utm_campaign=existing-traffic"></script>

<!-- 紧凑模式，适合导航下方、移动端模块或小广告位 -->
<script src="http://127.0.0.1:4273/embed.js?workspaceId=demo-workspace&mode=compact&limit=4&utm_campaign=existing-traffic"></script>
```

也可以改标题和 CTA：

```html
<script src="http://127.0.0.1:4273/embed.js?workspaceId=demo-workspace&mode=list&title=今日资源榜&cta=前半年免费"></script>
```

嵌入脚本会自动：

- 读取公开目录摘要：`GET /api/public/catalog`
- 记录外部访问归因：`POST /api/growth/visit`
- 记录广告展示 / 点击：`POST /api/public/ads/events`
- 在后台“流量归因”面板展示来源站点、campaign、展示、点击和 CTR
- 在后台“增长漏斗”展示访问、成员、来源、同步以及关键转化率

默认广告不会强行开启：

```env
ENABLE_ADS=0
```

当免费期积累到足够活跃租户或自然流量后，再设置：

```env
ENABLE_ADS=1
AD_PROVIDER=manual
AD_PLACEMENT=catalog-sidebar
```

后台可以先配置广告位素材，等 `ENABLE_ADS=1` 后公开 widget 会自动带出启用广告位。

反向代理模板：

- `deploy/Caddyfile`
- `deploy/nginx.conf`

当前角色权限：

- `admin`：全部权限
- `operator`：来源读取/测试、资源审核、媒体同步、健康检查、任务运行；不能修改下载器凭据或执行备份
- `viewer`：来源读取

## 关键 API

```text
GET  /api/health
GET  /api/stats
GET  /api/media
GET  /api/media/:id/resources
POST /api/media/:id/resources
POST /api/media/:id/sync
GET  /api/sources
POST /api/sources
DELETE /api/sources/:id
POST /api/sources/:id/test
GET  /api/sources/:id/caps
GET  /api/review/resources
POST /api/review/resources/:id
GET  /api/tmdb/search?q=dune
POST /api/tmdb/import
GET  /api/backup
GET  /api/workspaces
POST /api/workspaces
GET  /api/billing/plans
GET  /api/billing/current
POST /api/invitations
GET  /api/invitations
POST /api/invitations/accept
GET  /api/billing/events
GET  /api/billing/invoices
POST /api/billing/checkout
POST /api/billing/plan
POST /api/billing/refunds
POST /api/billing/webhook-replays
GET  /api/public/catalog
POST /api/growth/visit
GET  /api/growth/metrics
GET  /api/ads/placements
POST /api/ads/placements
POST /api/public/ads/events
GET  /api/monitoring
POST /api/jobs/monitoring
GET  /api/download-clients
POST /api/download-clients
POST /api/download-clients/:id/test
GET  /api/tasks
POST /api/tasks
POST /api/tasks/:id/rerun
```

管理员可通过请求头切换租户：

```http
x-workspace-id: workspace-id
```

## 来源接入

推荐通过 Prowlarr 或 Jackett 暴露 Torznab 接口，然后在管理页新增：

```json
{
  "id": "prowlarr-main",
  "name": "Prowlarr Main",
  "type": "torznab",
  "enabled": true,
  "weight": 1,
  "baseUrl": "http://127.0.0.1:9696/api/v1/search",
  "apiKey": "your-api-key"
}
```

## 合规边界

本项目只接入你有权限访问的 PT、Torznab、Jackett、Prowlarr、RSS、API 或私有库。不提供未授权站点抓取、绕过登录、验证码绕过、反爬绕过、passkey 共享、伪造上传量或规避站点规则的功能。
