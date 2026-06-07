# PostgreSQL 生产迁移路径

当前运行时使用内置 SQLite，生产 SaaS 建议迁移到 PostgreSQL。迁移目标是保持现有 API 行为不变，只替换 `server/services/db.js` 与查询执行适配层。

当前代码已经提供 PostgreSQL runtime adapter。设置 `DATABASE_DRIVER=postgres` 后，服务会使用 `pg` 连接 `DATABASE_URL`，启动时执行 `deploy/postgres-schema.sql` 并记录迁移版本。

注意：不要在没有 `DATABASE_URL` 的情况下设置 `DATABASE_DRIVER=postgres`；服务会明确拒绝启动，避免静默回退 SQLite。

## 目标状态

- 使用 PostgreSQL 15+。
- 所有业务表保留 `workspace_id`。
- `payload` 从 SQLite TEXT JSON 迁移为 PostgreSQL `JSONB`。
- `created_at`、`updated_at` 使用 `TIMESTAMPTZ`。
- API 侧继续以 workspace header / 用户归属做租户隔离。

## 迁移步骤

1. 准备数据库：

```bash
createdb pt_resource_hub
psql "$DATABASE_URL" -f deploy/postgres-schema.sql
```

2. 暂停写入：

```powershell
$env:REQUIRE_AUTH='1'
$env:ALLOW_INSECURE_DEV='0'
```

3. 导出 SQLite 备份：

```powershell
npm run backup
```

4. 迁移数据：

```text
workspaces        -> workspaces
users             -> users
media_items       -> media_items(payload::jsonb)
sources           -> sources(payload::jsonb)
resources         -> resources(payload::jsonb)
sync_logs         -> sync_logs(payload::jsonb)
source_health     -> source_health(payload::jsonb)
audit_logs        -> audit_logs(payload::jsonb)
sessions          -> sessions
login_attempts    -> login_attempts
download_clients  -> download_clients(payload::jsonb)
tasks             -> tasks(payload::jsonb)
schema_migrations -> schema_migrations
```

5. 切换运行时：

```env
DATABASE_URL=postgres://user:password@host:5432/pt_resource_hub
DATABASE_DRIVER=postgres
```

6. 回归验证：

```powershell
npm run db:migrations
npm run test:smoke
npm run test:e2e
```

`test:e2e` 会写入测试数据，只能对测试库或迁移演练库执行。

## 查询适配建议

先抽象一个最小 `db` 接口，保持服务层改动可控：

```text
prepare(sql).get(...args)
prepare(sql).all(...args)
prepare(sql).run(...args)
exec(sql)
```

PostgreSQL 适配器需要处理：

- `?` 占位符转换为 `$1`、`$2`。
- `INSERT OR REPLACE` 改写为 `INSERT ... ON CONFLICT (...) DO UPDATE`。
- `CURRENT_TIMESTAMP` 保留为 `NOW()` 或 PostgreSQL 默认值。
- JSON 字段写入时使用 `JSON.stringify(payload)`，列类型为 `JSONB`。

## 租户隔离验收

迁移后必须验证：

- 新建 workspace 后 `/api/media`、`/api/sources` 返回空列表。
- 同一个来源业务 ID 可以在不同 workspace 内重复使用。
- 非 admin 用户只能读取自己 `workspace_id` 的数据。
- admin 使用 `x-workspace-id` 可切换管理不同 workspace。
- `/api/backup` 只导出当前 workspace 数据。

## 回滚策略

- 切换前保留完整 `storage` 目录备份。
- 首次 PostgreSQL 上线采用只读窗口完成导入。
- 如 E2E 失败，回退到 SQLite 数据文件并恢复原环境变量。
