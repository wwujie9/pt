# 风险盘点与生产部署计划

## 目标

把 PT Resource Hub 作为可交付 SaaS 部署到生产环境，默认使用 PostgreSQL runtime、独立 worker、固定端口 `4273`、GitHub Actions 自动化 CI/CD，并保留 SQLite 作为本地轻量开发路径。

## 当前主要风险与处理方案

| 风险 | 影响 | 当前处理 | 后续强化 |
|---|---|---|---|
| 密钥进入仓库或镜像 | 管理员、数据库、来源凭据泄露 | `.gitignore` / `.dockerignore` 已排除 `.env.production`、数据库和备份 | 生产启用 GitHub secret scanning 与服务器密钥轮换制度 |
| PostgreSQL 与 SQLite 方言差异 | 线上运行时与本地测试不一致 | CI 同时跑 SQLite 与 PostgreSQL E2E | 后续新增专门 SQL adapter 单元测试 |
| 迁移机制仍偏轻量 | 大版本 schema 变更缺少回滚和分阶段发布 | `schema_migrations` 记录与 `deploy/postgres-schema.sql` 幂等建表 | 引入版本化迁移目录，如 `deploy/migrations/*.sql`，支持 up/down 和锁表 |
| Worker 长驻进程难以 CI 验证 | 队列代码可能只在 API 层可见 | 新增 `WORKER_RUN_ONCE=1`，CI 可单次验证 | 接入真实 qBittorrent / Transmission 后增加集成测试容器 |
| 支付仍是 manual provider | 商业闭环不完整 | 已有 checkout / billing event / plan change 抽象 | 接 Stripe / Lemon Squeezy / Paddle webhook 并验证签名 |
| 邮件发送仍依赖 webhook | 邀请交付受外部 webhook 影响 | 已有 invitation token、过期、一次性使用 | 接 SMTP / Resend / Postmark provider，并记录投递状态 |
| 生产备份缺少自动恢复演练 | 数据丢失后恢复不确定 | 文件级 backup 脚本与 workspace backup API | 增加 PostgreSQL `pg_dump` 定时备份和月度恢复演练 |
| 多租户隔离依赖服务层过滤 | SQL 漏写 workspace 条件会造成串租户 | E2E 已覆盖关键 workspace 隔离路径 | 增加 PostgreSQL Row Level Security 作为第二道防线 |
| 速率限制为进程内存 | 多副本部署时限流不共享 | 当前单实例可用 | 多实例时迁移到 Redis limiter |
| 容器镜像供应链 | 基础镜像和依赖可能有 CVE | CI 可构建镜像 | 增加 Trivy / Dependabot 扫描 |

## 标准部署架构

```mermaid
flowchart LR
  Dev["开发者 push main"] --> CI["GitHub Actions CI"]
  CI --> Tests["SQLite + PostgreSQL E2E"]
  Tests --> Build["Docker build"]
  Build --> GHCR["GHCR 镜像"]
  GHCR --> CD["GitHub Actions CD"]
  CD --> SSH["SSH 到生产服务器"]
  SSH --> Compose["docker compose prod"]
  Compose --> App["app: 4273"]
  Compose --> Worker["worker"]
  Compose --> PG["PostgreSQL volume"]
```

## CI 流程

触发条件：

- `push` 到 `main` / `master`
- Pull Request

执行内容：

- `npm ci`
- `npm run check:syntax`
- SQLite `npm run db:migrations`
- SQLite smoke / SaaS E2E
- PostgreSQL service 容器
- PostgreSQL `npm run db:migrations`
- PostgreSQL smoke / SaaS E2E
- PostgreSQL worker 单次消费验证
- Docker image build

## CD 流程

触发条件：

- `push` 到 `main`
- `v*` tag
- 手动 `workflow_dispatch`

执行内容：

- 构建镜像：`ghcr.io/wwujie9/pt:<sha-or-tag>`
- 同步 `latest`
- 当仓库变量 `ENABLE_SSH_DEPLOY=1` 时，SSH 到生产服务器部署

生产服务器需要提前准备：

```bash
git clone https://github.com/wwujie9/pt.git /opt/pt
cd /opt/pt
cp .env.production.example .env.production
```

必须修改 `.env.production`：

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_TOKEN`
- `CREDENTIAL_SECRET`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `PUBLIC_APP_URL`

手动部署命令：

```bash
docker compose --env-file .env.production -f deploy/docker-compose.prod.yml up -d
```

查看状态：

```bash
docker compose --env-file .env.production -f deploy/docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:4273/api/health
```

## GitHub 配置

Repository variables：

```text
ENABLE_SSH_DEPLOY=1
```

Repository secrets：

```text
DEPLOY_HOST=your.server.ip
DEPLOY_USER=deploy
DEPLOY_SSH_KEY=-----BEGIN OPENSSH PRIVATE KEY-----
DEPLOY_PORT=22
DEPLOY_PATH=/opt/pt
```

如果只需要构建和发布镜像，不配置 `ENABLE_SSH_DEPLOY` 即可，CD 会停在 GHCR 发布阶段。

## 发布前检查清单

- CI 已全绿。
- GHCR 镜像能正常拉取。
- 生产 `.env.production` 已创建且不在 Git 仓库内。
- `ALLOW_INSECURE_DEV=0`。
- `REQUIRE_AUTH=1`。
- `CREDENTIAL_SECRET` 长度足够且已经备份到密钥管理器。
- PostgreSQL volume 已挂载到持久化磁盘。
- 反向代理已启用 HTTPS。
- `/api/health` 返回 `ok: true`。
- 管理员登录成功。
- 创建 workspace、邀请用户、来源数量限制、下载任务队列已在预发验证。
- 已执行一次备份和一次恢复演练。

## 后续增强优先级

1. 版本化数据库迁移目录，替换当前启动时幂等建表。
2. PostgreSQL Row Level Security。
3. SMTP / Resend / Postmark 邮件 provider。
4. Stripe / Paddle 支付 webhook 和发票。
5. Redis 限流、任务队列锁和多 worker 横向扩展。
6. Trivy 镜像扫描与 Dependabot。
7. 自动 `pg_dump` 备份、对象存储归档、恢复演练脚本。
