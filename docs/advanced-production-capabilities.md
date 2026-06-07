# 高级生产能力启用手册

## 1. PostgreSQL 版本化迁移

生产 PostgreSQL 启动时会先执行 `deploy/postgres-schema.sql` 作为基线，再按文件名顺序执行：

```text
deploy/migrations/postgres/*.sql
```

命名格式：

```text
0011_add_xxx.sql
0012_backfill_xxx.sql
```

每个文件只会执行一次，执行记录写入：

```sql
SELECT * FROM schema_migrations ORDER BY version;
```

当前新增：

```text
0010_production_indexes.sql
```

用于补齐生产常用索引：任务队列、会话过期、邀请 token、账单事件等。

## 2. PostgreSQL RLS

RLS 脚本位于：

```text
deploy/rls/enable-workspace-rls.sql
```

它会为核心租户表启用 Row Level Security，并使用：

```sql
current_setting('app.workspace_id', true)
```

作为租户上下文。

当前版本已经完成请求级事务封装和 PostgreSQL session context 注入。每个租户请求会在事务内设置：

```sql
SET LOCAL app.workspace_id = '<workspace_id>';
```

同时，认证、迁移、平台全局审计、支付 webhook 等路径使用受控 bypass：

```sql
SET LOCAL app.rls_bypass = '1';
```

生产必须使用两个数据库连接身份：

- `DATABASE_MIGRATION_URL`：owner / migration 账号，用于 DDL、迁移、seed 和 provision。
- `DATABASE_URL`：低权限 app runtime 账号，必须是 `NOSUPERUSER NOBYPASSRLS`。

创建运行账号：

```bash
DATABASE_URL=postgres://pt:password@postgres:5432/pt_resource_hub \
POSTGRES_APP_USER=pt_app \
POSTGRES_APP_PASSWORD=replace-with-strong-password \
npm run db:provision-app-role
```

启用 RLS：

```bash
DATABASE_URL=postgres://pt_app:app-password@postgres:5432/pt_resource_hub \
DATABASE_MIGRATION_URL=postgres://pt:password@postgres:5432/pt_resource_hub \
npm run db:rls:enable
```

验证：

```bash
DATABASE_URL=postgres://pt_app:app-password@postgres:5432/pt_resource_hub \
DATABASE_MIGRATION_URL=postgres://pt:password@postgres:5432/pt_resource_hub \
npm run test:rls
```

启用检查：

1. 预发库执行 `db:provision-app-role`。
2. 预发库执行 `db:rls:enable`。
3. 执行 `npm run test:rls`。
4. 以 app runtime 账号启动服务。
5. 执行 smoke、SaaS E2E、worker run once。
6. 再对生产启用。

## 3. 真实支付

默认：

```env
PAYMENT_PROVIDER=manual
```

Stripe：

```env
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_STARTER=price_xxx
STRIPE_PRICE_TEAM=price_xxx
STRIPE_PRICE_BUSINESS=price_xxx
```

Webhook URL：

```text
POST /api/billing/webhooks/stripe
```

Lemon Squeezy：

```env
PAYMENT_PROVIDER=lemon
LEMON_API_KEY=xxx
LEMON_WEBHOOK_SECRET=xxx
LEMON_STORE_ID=123
LEMON_VARIANT_STARTER=123
LEMON_VARIANT_TEAM=456
LEMON_VARIANT_BUSINESS=789
```

Webhook URL：

```text
POST /api/billing/webhooks/lemon
```

Webhook 会校验签名、记录 `billing_events`，并在支付成功后按 metadata/custom data 中的 `workspaceId` 和 `planName` 自动切换套餐。

## 4. 真实邮件

默认本地输出：

```env
EMAIL_PROVIDER=console
```

Resend：

```env
EMAIL_PROVIDER=resend
EMAIL_FROM=PT Resource Hub <noreply@example.com>
RESEND_API_KEY=re_xxx
```

SMTP relay webhook：

```env
EMAIL_PROVIDER=smtp-relay
EMAIL_FROM=PT Resource Hub <noreply@example.com>
SMTP_RELAY_URL=https://mail-relay.example.com/send
```

通用 webhook：

```env
EMAIL_PROVIDER=webhook
EMAIL_WEBHOOK_URL=https://example.com/email-webhook
```

邀请邮件会包含接受邀请链接、角色、workspaceId 和过期时间。

## 5. PostgreSQL 备份与恢复演练

备份：

```bash
DATABASE_URL=postgres://pt:password@postgres:5432/pt_resource_hub \
npm run backup:postgres
```

如果宿主机没有 `pg_dump`，脚本会自动使用 `POSTGRES_CONTAINER` 指定的容器，默认：

```env
POSTGRES_CONTAINER=pt-postgres
```

恢复演练：

```bash
RESTORE_DATABASE_URL=postgres://pt:password@postgres:5432/pt_restore \
npm run backup:postgres:restore -- storage/postgres-backups/xxx.dump
```

恢复演练必须使用独立测试库，不要把 `RESTORE_DATABASE_URL` 指向生产库。

## 6. 多实例 Redis 限流

未配置 Redis 时，限流使用进程内 Map，只适合单实例。

多实例生产配置：

```env
REDIS_URL=redis://redis:6379
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=180
```

生产 compose 已包含 Redis：

```bash
docker compose --env-file .env.production -f deploy/docker-compose.prod.yml up -d redis app worker
```

如果 Redis 短暂不可用，服务会回退到进程内限流并输出警告，避免 API 整体不可用。

## 7. 镜像安全扫描

CI Docker job 会执行 Trivy：

```text
severity: CRITICAL,HIGH
exit-code: 1
```

也就是说镜像存在高危或严重漏洞时，CI 会失败。

Dependabot 已启用：

```text
.github/dependabot.yml
```

覆盖：

- npm
- GitHub Actions
- Docker

## 8. 推荐上线顺序

1. 保持 `PAYMENT_PROVIDER=manual`，先跑通 PostgreSQL + Redis + worker。
2. 启用 Resend 或 SMTP relay，验证邀请邮件投递。
3. 启用 Stripe/Lemon sandbox，验证 checkout 和 webhook。
4. 配置 `backup:postgres` 定时任务，并做一次恢复演练。
5. 合并 Trivy/Dependabot 的安全修复。
6. 预发启用 RLS，跑 `test:rls`、smoke、SaaS E2E、worker。
7. 生产启用 RLS。
8. 对 branch protection、备份恢复和支付 sandbox 做上线前复核。
