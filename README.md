# PT Resource Hub

一个面向授权 PT / Torznab / Jackett / Prowlarr / RSS / 私有库的媒体资源索引与管理工作台。

## 当前交付状态

当前版本是客户可试用版，已经具备：

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
- 支付 sandbox webhook 合同测试。
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
POST /api/billing/checkout
POST /api/billing/plan
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
