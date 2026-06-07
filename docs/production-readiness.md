# 生产 SaaS 交付说明

## 已补齐的生产底座

- 固定端口 `4273`。
- SQLite 本地开发持久化：`storage/app.db`。
- PostgreSQL 生产 runtime adapter、Docker PostgreSQL 与生产 compose。
- PostgreSQL 版本化 migrations 目录与生产索引迁移。
- Redis 多实例共享限流。
- 管理员登录与会话 Token。
- RBAC 角色：`admin`、`operator`、`viewer`。
- 敏感接口默认需要管理员身份。
- 可选 `ADMIN_TOKEN` 运维令牌。
- Workspace 创建、切换与用户归属。
- media / resources / sources / sync logs / source health 数据级 `workspace_id` 隔离。
- 邀请用户流程：pending invitation、过期时间、一次性 token、接受邀请页面、邮件 webhook。
- Starter / Team / Business 套餐限制。
- Starter / Team / Business 套餐限制、用量统计、checkout 事件和套餐切换。
- 下载器配置与任务队列。
- 独立 worker 进程处理 queued task。
- 来源 API Key 加密存储。
- 来源 API Key 前端脱敏展示。
- 审计日志。
- 健康检查 API。
- 备份导出 API。
- Dockerfile 与 docker-compose。
- 烟测脚本。
- SaaS E2E 脚本。
- GitHub Actions CI。
- PostgreSQL 生产 schema、runtime adapter 与迁移检查。
- HTTP 安全响应头。
- API 简易限流。
- 数据库 schema migration 记录。
- 用户创建、禁用、角色修改、密码重置。
- 手动文件级备份脚本。
- 可选后台来源健康检查调度。
- 可选 Webhook 通知。
- Resend / SMTP relay / Webhook 邀请邮件发送。
- Stripe / Lemon Squeezy checkout 与签名 webhook。
- PostgreSQL `pg_dump` 备份与恢复演练脚本。
- Trivy 镜像扫描与 Dependabot。

## 生产环境变量

必须修改：

```env
PORT=4273
REQUIRE_AUTH=1
ALLOW_INSECURE_DEV=0
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-strong-password
ADMIN_TOKEN=replace-with-random-admin-token
CREDENTIAL_SECRET=replace-with-random-credential-secret
```

可选：

```env
TMDB_API_KEY=your-tmdb-api-key
ENABLE_SCHEDULER=1
SCHEDULER_INTERVAL_MS=900000
WEBHOOK_URL=https://example.com/webhook
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=180
BACKUP_DIR=storage/backups
LOGIN_MAX_FAILURES=5
LOGIN_LOCK_MINUTES=15
```

## 首次部署

```powershell
docker compose up --build -d
```

访问：

```text
http://127.0.0.1:4273
```

首次管理员账号来自：

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

如果数据库里已经存在用户，环境变量不会覆盖已有用户密码。需要重置时可清理 `storage/app.db` 后重新启动，或后续接入用户管理重置接口。

## 权限模型

默认情况下敏感读写接口都需要：

- 管理员登录后的 Bearer Token，或
- `x-admin-token` 请求头匹配 `ADMIN_TOKEN`

本地调试可设置：

```env
ALLOW_INSECURE_DEV=1
```

生产环境禁止开启。

## 凭据安全

来源中的 `apiKey` 会使用 `CREDENTIAL_SECRET` 派生密钥进行 AES-256-GCM 加密。

注意：

- 生产环境必须设置随机强 `CREDENTIAL_SECRET`。
- 更换 `CREDENTIAL_SECRET` 会导致旧凭据无法解密。
- 前端只显示脱敏后的 API Key。
- 审计日志会脱敏 token、password、apiKey、cookie、passkey、secret 等字段。

## 备份

备份 API：

```http
GET /api/backup
```

该接口需要管理员身份。

文件级备份建议：

```text
storage/app.db
storage/app.db-wal
storage/app.db-shm
```

建议每日备份 `storage` 目录。

手动文件级备份：

```powershell
npm run backup
```

默认备份目录：

```text
storage/backups
```

## 安全头与限流

服务默认返回：

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Content-Security-Policy`

限流环境变量：

```env
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=180
```

## 数据库迁移记录

SQLite 内置迁移记录表：

```sql
SELECT * FROM schema_migrations;
```

当前迁移：

- `0001 initial_sqlite_schema`
- `0002 auth_audit_and_source_health`
- `0003 workspace_login_security`
- `0004 workspace_data_isolation`
- `0005 download_clients_and_tasks`
- `0006 audit_workspace_scope`
- `0007 invitations`
- `0008 billing_usage`
- `0009 worker_task_attempts`

## 多租户与权限

当前版本已经具备真实 workspace 隔离：

- 默认 workspace：`default`
- 用户归属字段：`workspaceId`
- Workspace API：`GET /api/workspaces`、`POST /api/workspaces`
- 管理员可通过 `x-workspace-id` 切换管理目标 workspace。
- 普通用户只访问自己所属 workspace。
- 备份导出只导出当前 workspace 数据。
- 审计日志写入 `workspace_id`，平台管理员可查看全局审计，租户视图按 workspace 过滤。

## Worker

启动 API 服务后，可单独启动任务 worker：

```powershell
npm run worker
```

可选配置：

```env
WORKER_ID=worker-1
WORKER_INTERVAL_MS=3000
```

当前 worker 已具备 queued -> running -> completed/failed 状态机；真实 qBittorrent / Transmission 协议执行点位于 `server/worker.js`。

当前权限矩阵：

| 角色 | 权限 |
|---|---|
| admin | 全部权限 |
| operator | source:read、source:test、resource:review、media:sync、job:run；不能修改下载器凭据或执行备份 |
| viewer | source:read |

## 登录安全

登录失败会记录到 `login_attempts`。

配置：

```env
LOGIN_MAX_FAILURES=5
LOGIN_LOCK_MINUTES=15
```

## 烟测

服务启动后运行：

```powershell
npm run test:smoke
```

SaaS E2E：

```powershell
npm run test:e2e
```

注意：E2E 会写入测试 workspace、来源、邀请用户、下载器和任务。只允许在测试库、CI 临时环境或可清理的预发环境运行，不要对生产 `APP_URL` 执行。

Docker 环境可进入容器执行，或从宿主机设置：

```powershell
$env:APP_URL='http://127.0.0.1:4273'
$env:SMOKE_ADMIN_EMAIL='admin@example.com'
$env:SMOKE_ADMIN_PASSWORD='replace-with-strong-password'
npm run test:smoke
```

## 上线前检查

- 已修改 `ADMIN_PASSWORD`。
- 已修改 `ADMIN_TOKEN`。
- 已修改 `CREDENTIAL_SECRET`。
- 已确认 `ALLOW_INSECURE_DEV=0`。
- 已配置 HTTPS 反向代理。
- 已配置存储目录备份。
- 已配置 TMDB API Key。
- 已测试 Prowlarr 或 Jackett Torznab 来源。
- 已运行烟测。
- 已运行 SaaS E2E。
- 已启动 worker 并确认任务可被消费。
- 已查看 `/api/health`。
- 已确认审计日志能记录写操作。

## 仍建议后续增强

- 邮件服务接入，发送真实邀请邮件。
- 邮件投递状态、退信处理和重试队列。
- 支付发票、退款、webhook 重放和 sandbox 合同测试。
- Worker 真实下载器协议执行、失败重试和死信队列。
- 更完整的 TMDB 详情导入。
- HTTPS 与域名部署自动化。
- PostgreSQL Row Level Security。
- 版本化迁移目录和回滚策略。
- SBOM、镜像签名和对象存储归档。
