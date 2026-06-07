# PT Resource Hub 生产 SaaS 执行路线图

## 目标

把当前代码库从“生产可部署”推进到“客户可持续运营”的 SaaS 产品。路线图以固定端口 `4273`、PostgreSQL、Redis、独立 worker、CI/CD、真实邮件、真实支付、备份恢复、安全扫描和租户级隔离为核心验收线。

## 当前基线

已完成并推送到 `wwujie9/pt`：

- Node 22 应用，固定端口 `4273`。
- PostgreSQL runtime adapter。
- Docker PostgreSQL、本地 compose、生产 compose。
- Workspace 多租户数据隔离。
- 用户、角色、邀请、一次性 token、邀请过期。
- Starter / Team / Business 套餐限制。
- 账单事件、checkout、套餐切换。
- 下载器配置、任务队列、独立 worker。
- PostgreSQL 版本化 migrations 目录。
- RLS 启用 SQL 脚本。
- Stripe / Lemon Squeezy checkout 和签名 webhook。
- Resend / SMTP relay / generic webhook 邮件 provider。
- PostgreSQL `pg_dump` 备份和恢复演练脚本。
- Redis 多实例共享限流。
- GitHub Actions CI/CD、GHCR 镜像发布、SSH 部署模板。
- Trivy 镜像扫描、Dependabot。

## 阶段 1：预发环境落地

目标：先把部署链路完整跑通，不接真实钱、不动生产客户数据。

任务：

- 创建预发服务器目录：`/opt/pt-staging`。
- 配置 `.env.production`，但使用 staging 域名和测试密钥。
- 启动生产 compose：

```bash
docker compose --env-file .env.production -f deploy/docker-compose.prod.yml up -d
```

- 配置反向代理 HTTPS，推荐 Caddy 或 Nginx。
- 验证：

```bash
curl -fsS https://staging.example.com/api/health
```

- 运行 smoke：

```bash
APP_URL=https://staging.example.com npm run test:smoke
```

- 只在可清理预发库运行 SaaS E2E：

```bash
APP_URL=https://staging.example.com npm run test:e2e
```

验收：

- `/api/health` 返回 `ok: true`。
- 登录、workspace 创建、邀请、来源、下载任务、账单路径全部通过。
- app / worker / postgres / redis 都为 healthy 或 running。
- CI 在 GitHub Actions 中全绿。

## 阶段 2：CI/CD 发布闭环

目标：main 分支合并后自动构建镜像，按需自动部署。

任务：

- GitHub repository variables：

```text
ENABLE_SSH_DEPLOY=1
```

- GitHub repository secrets：

```text
DEPLOY_HOST
DEPLOY_USER
DEPLOY_SSH_KEY
DEPLOY_PORT
DEPLOY_PATH
```

- 确认 GHCR 包可拉取。
- 确认服务器上 `DEPLOY_PATH` 已 clone 仓库。
- 手动触发 CD workflow。
- 确认远端部署后版本更新。

验收：

- `CI` workflow 全绿。
- `CD` workflow 成功发布镜像。
- 服务器 `docker compose ps` 显示新镜像已运行。
- 回滚方式明确：使用上一条 GHCR tag 或 commit SHA 重新设置 `APP_IMAGE`。

## 阶段 3：真实邮件启用

目标：邀请用户邮件可真实投递。

推荐先用 Resend：

```env
EMAIL_PROVIDER=resend
EMAIL_FROM=PT Resource Hub <noreply@example.com>
RESEND_API_KEY=re_xxx
PUBLIC_APP_URL=https://app.example.com
```

任务：

- 配置发信域名 SPF / DKIM / DMARC。
- 在预发环境邀请测试用户。
- 确认邮件进入收件箱，不进垃圾箱。
- 确认邀请链接可打开并成功创建用户。
- 确认过期 token 和重复使用 token 会被拒绝。

验收：

- 邮件送达率可接受。
- 邀请链接域名正确。
- 审计日志记录 `user.invite` 和 `user.accept_invitation`。

## 阶段 4：真实支付启用

目标：完成商业化支付闭环。

Stripe sandbox：

```env
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_STARTER=price_xxx
STRIPE_PRICE_TEAM=price_xxx
STRIPE_PRICE_BUSINESS=price_xxx
```

Webhook：

```text
POST https://app.example.com/api/billing/webhooks/stripe
```

任务：

- 创建 Stripe / Lemon 测试商品和价格。
- 测试 checkout 创建。
- 测试支付成功 webhook。
- 测试 webhook 签名错误被拒绝。
- 测试支付成功后 workspace 套餐自动切换。
- 测试降级套餐时超额数据被拦截。

验收：

- `billing_events` 中有 checkout 和 payment 记录。
- webhook 签名校验通过。
- 支付成功后套餐与用量限制生效。
- 手动模式仍可作为 fallback。

## 阶段 5：备份与恢复演练

目标：证明数据可恢复，而不是只“有备份文件”。

任务：

- 配置备份目录：

```env
PG_BACKUP_DIR=storage/postgres-backups
POSTGRES_CONTAINER=pt-postgres
```

- 执行备份：

```bash
DATABASE_URL=postgres://pt:password@postgres:5432/pt_resource_hub npm run backup:postgres
```

- 创建独立恢复库，例如 `pt_restore`。
- 执行恢复演练：

```bash
RESTORE_DATABASE_URL=postgres://pt:password@postgres:5432/pt_restore npm run backup:postgres:restore -- storage/postgres-backups/xxx.dump
```

- 记录恢复耗时和数据完整性检查结果。
- 后续接对象存储归档，例如 S3 / R2 / MinIO。

验收：

- 备份文件可生成。
- 恢复库能恢复出完整 schema。
- 恢复后核心表数量、workspace 数、用户数、来源数符合预期。
- 明确 RPO / RTO。

## 阶段 6：Redis 与多实例能力

目标：让 API 横向扩展时限流不失效。

任务：

- 生产启用：

```env
REDIS_URL=redis://redis:6379
```

- 压测登录、媒体列表、来源列表等接口。
- 停止 Redis，确认服务降级到进程内限流但不中断。
- 恢复 Redis，确认限流继续走共享计数。

验收：

- 多副本部署下限流一致。
- Redis 异常不会导致全站不可用。
- 监控中能看到 Redis 连接失败日志。

## 阶段 7：RLS 深度租户隔离

目标：把租户隔离从服务层过滤升级到数据库强约束。

当前状态：

- 已有 RLS SQL：`deploy/rls/enable-workspace-rls.sql`。
- 还未默认启用。

必须先完成：

- 请求级事务封装。
- 每个请求设置：

```sql
SET LOCAL app.workspace_id = '<workspace_id>';
```

- 平台管理员路径设计绕行策略，例如专用连接、专用 role 或显式 all-workspace policy。
- worker 任务处理时设置任务所属 workspace。
- backup / audit / platform admin 路径单独验证。

预发验收：

- 普通租户无法查询其它 workspace 数据。
- 管理员切换 workspace 仍正常。
- 平台管理员全局审计路径可控。
- SaaS E2E 全绿。
- 手工 SQL 漏写 `workspace_id` 时仍被 RLS 阻断。

生产启用：

```bash
docker exec -i pt-postgres psql "$DATABASE_URL" < deploy/rls/enable-workspace-rls.sql
```

## 阶段 8：安全与供应链治理

目标：避免依赖、镜像、密钥和部署链路成为客户风险。

任务：

- GitHub 开启 secret scanning。
- GitHub 开启 branch protection，要求 CI 通过。
- Dependabot PR 每周处理。
- Trivy high / critical 漏洞必须修复或记录豁免。
- 后续增加 SBOM：

```text
syft / cyclonedx
```

- 后续增加镜像签名：

```text
cosign
```

验收：

- main 分支不能绕过 CI 直接合并。
- 镜像高危漏洞不会进入发布。
- `.env.production` 不在仓库和镜像上下文中。

## 阶段 9：客户交付清单

交付前必须确认：

- 域名和 HTTPS 已配置。
- 管理员初始账号已改强密码。
- `CREDENTIAL_SECRET` 已存入密钥管理器。
- PostgreSQL volume 已持久化。
- Redis 已启用。
- worker 已启动。
- 邮件 provider 已验证。
- 支付 sandbox 已验证，生产支付密钥待客户确认后切换。
- 备份和恢复演练已完成。
- CI/CD 已跑通。
- 客户有部署手册和回滚手册。

## 优先级建议

P0：

- 预发部署。
- CI/CD 自动部署验证。
- 邮件 provider。
- 备份恢复演练。

P1：

- 支付 sandbox。
- Redis 多实例压测。
- branch protection / secret scanning。

P2：

- RLS 请求级事务改造。
- SBOM / 镜像签名。
- 对象存储备份归档。
- 支付发票、退款、webhook 重放。

## 下一轮开发建议

建议下一轮专注 RLS 真实启用所需的请求级事务封装，因为这是当前最有技术深度、也最能提升客户信任的生产能力。完成后，租户隔离将从“应用层纪律”升级为“数据库强约束”。
