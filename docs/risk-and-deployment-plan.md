# 风险盘点与生产部署计划

## 目标

把 PT Resource Hub 作为可交付 SaaS 部署到生产环境，默认使用 PostgreSQL runtime、独立 worker、固定端口 `4273`、GitHub Actions 自动化 CI/CD，并保留 SQLite 作为本地轻量开发路径。

## 当前主要风险与处理方案

| 风险 | 影响 | 当前处理 | 后续强化 |
|---|---|---|---|
| 密钥进入仓库或镜像 | 管理员、数据库、来源凭据泄露 | `.gitignore` / `.dockerignore` 已排除 `.env.production`、数据库和备份 | 生产启用 GitHub secret scanning 与服务器密钥轮换制度 |
| PostgreSQL 与 SQLite 方言差异 | 线上运行时与本地测试不一致 | CI 同时跑 SQLite 与 PostgreSQL E2E | 后续新增专门 SQL adapter 单元测试 |
| 迁移机制仍偏轻量 | 大版本 schema 变更缺少回滚和分阶段发布 | 已增加 `deploy/migrations/postgres/*.sql` 版本化执行 | 后续补 up/down、迁移锁和回滚演练 |
| Worker 长驻进程难以 CI 验证 | 队列代码可能只在 API 层可见 | 新增 `WORKER_RUN_ONCE=1`，CI 可单次验证 | 接入真实 qBittorrent / Transmission 后增加集成测试容器 |
| 支付 provider 配置错误 | 用户付款后套餐不同步 | 已支持 Stripe / Lemon Squeezy checkout 与签名 webhook | 增加 sandbox 合同测试和 webhook 重放工具 |
| 邮件 provider 配置错误 | 邀请邮件投递失败 | 已支持 Resend / SMTP relay / generic webhook | 增加投递状态表和重试队列 |
| 生产备份未演练 | 数据丢失后恢复不确定 | 已增加 PostgreSQL `pg_dump` 备份与恢复演练脚本 | 增加定时备份、对象存储归档和恢复 SLA |
| 多租户隔离依赖服务层过滤 | SQL 漏写 workspace 条件会造成串租户 | E2E 已覆盖关键 workspace 隔离路径 | 增加 PostgreSQL Row Level Security 作为第二道防线 |
| Redis 限流不可用 | 多副本限流降级到单实例内存 | 已支持 `REDIS_URL`，不可用时降级进程内限流 | 生产监控 Redis 健康与限流错误率 |
| 容器镜像供应链 | 基础镜像和依赖可能有 CVE | 已增加 Trivy / Dependabot | 后续增加 SBOM 和镜像签名 |
| 推广演示只看到 API 能力 | 客户难以感知 SaaS 运营价值 | 管理页已增加运营控制台、支付运营、生产监控和备份状态 | 后续补客户 onboarding 向导和仪表盘截图 |

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
- Redis service 容器
- PostgreSQL `npm run db:migrations`
- PostgreSQL smoke / SaaS E2E
- PostgreSQL worker 单次消费验证
- 支付 sandbox 合同测试：发票、退款记录、webhook 重放
- PostgreSQL 备份、对象归档、恢复 SLA 演练
- 备份生命周期策略 dry-run
- 生产监控检查
- Docker image build
- Trivy 镜像安全扫描

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
- 管理页运营控制台显示健康状态、最近备份和任务队列。
- 支付运营区能查询发票，预发环境可执行 webhook 重放和退款记录。
- 创建 workspace、邀请用户、来源数量限制、下载任务队列已在预发验证。
- 已执行一次备份和一次恢复演练。

## 后续增强优先级

1. 客户 onboarding 向导：创建 workspace、邀请首个用户、添加第一个来源、跑首次同步。
2. 邮件投递状态表、重试队列和退信处理。
3. Redis 任务队列锁和多 worker 横向扩展。
4. 迁移锁、down migration 和回滚演练。
5. SBOM、镜像签名和发布准入策略。
6. 业务指标仪表盘：活跃租户、来源成功率、同步成功率、付费转化和退款率。
