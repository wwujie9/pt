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

重要：不要在当前版本直接对生产库执行该脚本。启用 RLS 前必须完成连接级租户上下文注入，例如每个请求在事务内执行：

```sql
SET LOCAL app.workspace_id = '<workspace_id>';
```

推荐启用阶段：

1. 预发库执行 RLS 脚本。
2. 增加请求级事务封装和 `SET LOCAL app.workspace_id`。
3. 对所有 workspace API 跑 SaaS E2E。
4. 确认平台管理员全局审计和备份路径有单独策略。
5. 再对生产启用。

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
6. 在预发环境开发请求级事务和 `SET LOCAL app.workspace_id`。
7. 预发启用 RLS，跑完整 E2E。
8. 生产启用 RLS。
