# 数据库迁移计划：JSON Store 到 SQLite / Prisma

## 背景与目标

当前项目的资源索引数据主要来自三类本地数据：

- `storage/resources.json`：资源列表，包含 `mediaId`、来源、标题、质量、字幕、体积、匹配分、原始 payload 等字段。
- `storage/sync-logs.json`：同步任务日志。
- `server/config/sources.json`：来源配置，包含 `internal`、`rss`、`torznab` 等来源类型和启用状态。

当前代码中已经出现轻量 SQLite 雏形：`server/services/db.js` 使用 Node `node:sqlite` 创建 `storage/app.db`，并在空库时从 JSON 或 seed 数据导入。后续迁移的目标不是一次性重写业务代码，而是保持 `server/services/store.js` 对外函数签名稳定，逐步把 JSON store 的职责收敛到 SQLite。

迁移目标：

- 保留本地开发零配置体验。
- 支持资源、媒体、来源、同步日志、来源健康状态的结构化查询。
- 允许先采用轻量 SQLite，后续再切换 Prisma + SQLite。
- 导入过程可重复、可校验、可回滚。
- 不修改 `src/server` 代码；本计划仅描述迁移策略。

## 推荐路线

### 路线 A：轻量 SQLite 优先

适用场景：

- 当前应用仍是单进程 Node 服务。
- 数据规模处于本地资源索引或小团队内网使用阶段。
- 希望尽快替换 JSON 文件读写，并减少依赖。

实现方式：

- 使用 `node:sqlite` 或 `better-sqlite3`。
- 由 `server/services/db.js` 管理建表、索引、seed/import。
- `server/services/store.js` 继续暴露 `loadMedia`、`loadResources`、`saveResources`、`upsertResources` 等函数。
- 复杂字段先以 JSON 文本保存到 `payload`，同时把常用筛选字段拆成真实列。

优点：

- 迁移成本低。
- 与现有雏形匹配。
- 不需要 Prisma Client 生成流程。
- 方便做本地备份和回滚。

风险：

- schema 版本管理需要自行维护。
- 复杂关联查询和类型提示不如 Prisma 完整。
- 后续切 PostgreSQL 时需要再做一轮适配。

### 路线 B：Prisma + SQLite

适用场景：

- 预计后续会升级到 PostgreSQL。
- 希望使用 Prisma migration 管理 schema 版本。
- 希望获得更清晰的模型定义和类型生成。

实现方式：

- 新增 `prisma/schema.prisma`。
- SQLite 阶段使用 `provider = "sqlite"`。
- 通过 `npx prisma migrate dev` 生成迁移。
- `server/services/store.js` 内部从手写 SQL 替换为 Prisma Client。

优点：

- schema 演进更规范。
- 后续迁移 PostgreSQL 更顺滑。
- 类型约束更好。

风险：

- 引入依赖和生成步骤。
- 对当前轻量项目来说复杂度更高。
- Prisma 的 JSON 字段在 SQLite 中本质仍是文本处理，部分 JSON 查询能力有限。

### 建议结论

短期建议采用路线 A：轻量 SQLite 优先。当前代码已有 `storage/app.db` 和 `node:sqlite` 建表逻辑，继续沿用可以最快完成 JSON store 到数据库的迁移。

中期可以保留 Prisma 作为升级路线：当来源、订阅、用户权限、审计、下载器任务等模块稳定后，再把 schema 固化到 Prisma。

## 目标数据模型

### `media_items`

保存电影、剧集等媒体元数据。当前来源包括 `src/data/media.seed.js` 和 TMDB 导入接口。

```sql
CREATE TABLE media_items (
  id TEXT PRIMARY KEY,
  type TEXT,
  tmdb_id INTEGER,
  imdb_id TEXT,
  title_zh TEXT,
  title_en TEXT,
  original_title TEXT,
  year INTEGER,
  country TEXT,
  language TEXT,
  runtime INTEGER,
  rating REAL,
  poster_url TEXT,
  backdrop_url TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

建议索引：

```sql
CREATE INDEX idx_media_items_type_year ON media_items(type, year);
CREATE INDEX idx_media_items_tmdb_id ON media_items(tmdb_id);
CREATE INDEX idx_media_items_imdb_id ON media_items(imdb_id);
```

字段说明：

- `payload` 保存完整媒体对象，包括 `genres`、`aliases`、`overview` 等暂不拆列字段。
- `title_zh`、`title_en`、`year` 等常用展示和搜索字段拆列，减少 JSON 查询依赖。

### `sources`

保存来源配置。

```sql
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  weight REAL NOT NULL DEFAULT 1,
  base_url TEXT,
  url TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

建议索引：

```sql
CREATE INDEX idx_sources_type_enabled ON sources(type, enabled);
```

安全建议：

- `apiKey`、Cookie、passkey 等敏感字段不应长期明文保存在 `payload`。
- MVP 可先沿用当前配置文件，但生产环境应拆到 `source_credentials`，并做加密或环境变量引用。

### `source_credentials`

保存来源凭据。MVP 可暂不实现，但建议预留。

```sql
CREATE TABLE source_credentials (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  credential_type TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rotated_at TEXT,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
);
```

### `resources`

保存标准化资源，是迁移核心表。

```sql
CREATE TABLE resources (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  source_id TEXT,
  source_name TEXT,
  source_type TEXT,
  source_resource_id TEXT,
  title TEXT NOT NULL,
  url TEXT,
  quality TEXT,
  medium TEXT,
  codec TEXT,
  audio TEXT,
  subtitle TEXT,
  size_gb REAL,
  size_bytes INTEGER,
  seeders INTEGER,
  leechers INTEGER,
  published_at TEXT,
  trusted INTEGER NOT NULL DEFAULT 0,
  score INTEGER,
  match_score INTEGER NOT NULL DEFAULT 70,
  status TEXT NOT NULL DEFAULT 'active',
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE SET NULL
);
```

建议索引：

```sql
CREATE INDEX idx_resources_media_id ON resources(media_id);
CREATE INDEX idx_resources_source_id ON resources(source_id);
CREATE INDEX idx_resources_status_score ON resources(status, match_score);
CREATE INDEX idx_resources_quality ON resources(quality);
CREATE INDEX idx_resources_published_at ON resources(published_at);
CREATE UNIQUE INDEX idx_resources_source_resource
  ON resources(source_id, source_resource_id)
  WHERE source_id IS NOT NULL AND source_resource_id IS NOT NULL;
```

字段说明：

- `payload` 保存完整标准化资源对象，保证迁移早期不会丢字段。
- `source_resource_id` 优先从 `payload.raw.sourceResourceId` 读取。
- `size_bytes` 优先从 `payload.raw.sizeBytes` 读取；如果只有 `sizeGb`，可按 `sizeGb * 1024 * 1024 * 1024` 估算。
- `status` 建议枚举语义：`active`、`review`、`rejected`、`archived`。
- `match_score < 65` 的资源可自动进入 `review` 队列。

### `sync_logs`

保存同步任务日志，对应当前 `storage/sync-logs.json`。

```sql
CREATE TABLE sync_logs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  media_id TEXT,
  source_id TEXT,
  source_count INTEGER,
  imported_count INTEGER,
  error_count INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE SET NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE SET NULL
);
```

建议索引：

```sql
CREATE INDEX idx_sync_logs_created_at ON sync_logs(created_at);
CREATE INDEX idx_sync_logs_type_status ON sync_logs(type, status);
CREATE INDEX idx_sync_logs_media_id ON sync_logs(media_id);
```

### `source_health`

保存来源健康检查结果。

```sql
CREATE TABLE source_health (
  source_id TEXT PRIMARY KEY,
  ok INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  checked_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
);
```

### `schema_migrations`

轻量 SQLite 路线建议增加 schema 版本表。

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

用途：

- 避免每次启动只依赖 `CREATE TABLE IF NOT EXISTS`。
- 支持后续增列、建索引、数据修复脚本。
- 配合回滚文档记录每个版本的降级方式。

## Prisma Schema 草案

如果后续选择 Prisma + SQLite，可按以下模型起步：

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model MediaItem {
  id            String     @id
  type          String?
  tmdbId        Int?       @map("tmdb_id")
  imdbId        String?    @map("imdb_id")
  titleZh       String?    @map("title_zh")
  titleEn       String?    @map("title_en")
  originalTitle String?    @map("original_title")
  year          Int?
  country       String?
  language      String?
  runtime       Int?
  rating        Float?
  posterUrl     String?    @map("poster_url")
  backdropUrl   String?    @map("backdrop_url")
  payload       String
  createdAt     DateTime   @default(now()) @map("created_at")
  updatedAt     DateTime   @updatedAt @map("updated_at")
  resources     Resource[]

  @@index([type, year])
  @@index([tmdbId])
  @@index([imdbId])
  @@map("media_items")
}

model Source {
  id          String          @id
  name        String
  type        String
  enabled     Boolean         @default(false)
  weight      Float           @default(1)
  baseUrl     String?         @map("base_url")
  url         String?
  payload     String
  createdAt   DateTime        @default(now()) @map("created_at")
  updatedAt   DateTime        @updatedAt @map("updated_at")
  resources   Resource[]
  credentials SourceCredential?
  health      SourceHealth?

  @@index([type, enabled])
  @@map("sources")
}

model SourceCredential {
  id               String   @id
  sourceId         String   @map("source_id")
  credentialType   String   @map("credential_type")
  encryptedPayload String   @map("encrypted_payload")
  createdAt        DateTime @default(now()) @map("created_at")
  rotatedAt        DateTime? @map("rotated_at")
  source           Source   @relation(fields: [sourceId], references: [id], onDelete: Cascade)

  @@map("source_credentials")
}

model Resource {
  id               String    @id
  mediaId          String    @map("media_id")
  sourceId         String?   @map("source_id")
  sourceName       String?   @map("source_name")
  sourceType       String?   @map("source_type")
  sourceResourceId String?   @map("source_resource_id")
  title            String
  url              String?
  quality          String?
  medium           String?
  codec            String?
  audio            String?
  subtitle         String?
  sizeGb           Float?    @map("size_gb")
  sizeBytes        BigInt?   @map("size_bytes")
  seeders          Int?
  leechers         Int?
  publishedAt      DateTime? @map("published_at")
  trusted          Boolean   @default(false)
  score            Int?
  matchScore       Int       @default(70) @map("match_score")
  status           String    @default("active")
  payload          String
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")
  media            MediaItem @relation(fields: [mediaId], references: [id], onDelete: Cascade)
  source           Source?   @relation(fields: [sourceId], references: [id], onDelete: SetNull)

  @@index([mediaId])
  @@index([sourceId])
  @@index([status, matchScore])
  @@index([quality])
  @@index([publishedAt])
  @@map("resources")
}

model SyncLog {
  id            String   @id
  type          String
  status        String
  mediaId       String?  @map("media_id")
  sourceId      String?  @map("source_id")
  sourceCount   Int?     @map("source_count")
  importedCount Int?     @map("imported_count")
  errorCount    Int      @default(0) @map("error_count")
  errorSummary  String?  @map("error_summary")
  payload       String
  createdAt     DateTime @default(now()) @map("created_at")

  @@index([createdAt])
  @@index([type, status])
  @@index([mediaId])
  @@map("sync_logs")
}

model SourceHealth {
  sourceId  String   @id @map("source_id")
  ok        Boolean  @default(false)
  message   String?
  checkedAt DateTime @map("checked_at")
  payload   String
  source    Source   @relation(fields: [sourceId], references: [id], onDelete: Cascade)

  @@map("source_health")
}
```

注意：

- SQLite 中 Prisma `Json` 能力受限，建议继续使用 `String` 保存 JSON 文本，应用层 `JSON.parse`。
- 如果未来切 PostgreSQL，可把 `payload` 类型升级为 `Json`，并补充 GIN 索引。

## 迁移步骤

### 第 0 步：冻结写入窗口

迁移前需要短暂停止服务写入：

1. 停止 Node 服务或关闭同步入口。
2. 确认没有正在执行的 `POST /api/media/:id/sync`。
3. 记录当前 JSON 文件大小、条数和最后修改时间。

建议记录：

```powershell
Get-Item -Path storage\resources.json, storage\sync-logs.json | Select-Object Name, Length, LastWriteTime
```

### 第 1 步：备份当前数据

创建迁移批次目录：

```text
storage/backups/YYYYMMDD-HHMMSS/
```

备份内容：

- `storage/resources.json`
- `storage/sync-logs.json`
- `server/config/sources.json`
- `storage/app.db`，如果已存在
- `storage/app.db-wal` 和 `storage/app.db-shm`，如果启用了 WAL

备份要求：

- 备份文件不要覆盖历史批次。
- 备份后计算条数，确保 JSON 可解析。
- 如果 JSON 解析失败，应停止迁移并人工确认编码或文件损坏情况。

### 第 2 步：创建数据库 schema

轻量 SQLite 路线：

1. 创建 `storage/app.db`。
2. 开启基础 PRAGMA：

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

3. 执行建表 SQL。
4. 插入 `schema_migrations` 版本记录。

Prisma 路线：

1. 设置 `DATABASE_URL="file:./storage/app.db"` 或按实际路径配置。
2. 创建 `prisma/schema.prisma`。
3. 执行 `prisma migrate dev` 或 `prisma migrate deploy`。
4. 确认生成的表名、字段名与 store 层读取逻辑一致。

### 第 3 步：导入媒体数据

导入来源：

- 优先导入数据库中已有媒体记录。
- 空库时从 `src/data/media.seed.js` 导入。
- TMDB 导入接口后续写入 `media_items`。

字段映射：

| JSON 字段 | 数据库字段 |
| --- | --- |
| `id` | `media_items.id` |
| `type` | `media_items.type` |
| `tmdbId` | `media_items.tmdb_id` |
| `imdbId` | `media_items.imdb_id` |
| `titleZh` | `media_items.title_zh` |
| `titleEn` | `media_items.title_en` |
| `originalTitle` | `media_items.original_title` |
| `year` | `media_items.year` |
| `poster` | `media_items.poster_url` |
| `backdrop` | `media_items.backdrop_url` |
| 完整对象 | `media_items.payload` |

导入策略：

- 使用 `INSERT OR REPLACE` 或 `ON CONFLICT(id) DO UPDATE`。
- `created_at` 对老数据使用当前时间。
- `updated_at` 对老数据使用当前时间，若 payload 中有更新时间则优先使用。

### 第 4 步：导入来源配置

导入来源：

- 主来源：`server/config/sources.json`
- fallback：`server/config/sources.example.json`

字段映射：

| JSON 字段 | 数据库字段 |
| --- | --- |
| `id` | `sources.id` |
| `name` | `sources.name` |
| `type` | `sources.type` |
| `enabled` | `sources.enabled` |
| `weight` | `sources.weight` |
| `baseUrl` | `sources.base_url` |
| `url` | `sources.url` |
| 完整对象 | `sources.payload` |

处理规则：

- `enabled` 写入 `0` 或 `1`。
- `weight` 缺省为 `1`。
- 敏感字段迁移早期可保留在 `payload`，但需要在生产上线前移入凭据管理。

### 第 5 步：导入资源数据

导入来源：

- `storage/resources.json`

字段映射：

| JSON 字段 | 数据库字段 |
| --- | --- |
| `id` | `resources.id` |
| `mediaId` | `resources.media_id` |
| `sourceId` | `resources.source_id` |
| `source` | `resources.source_name` |
| `sourceType` | `resources.source_type` |
| `raw.sourceResourceId` | `resources.source_resource_id` |
| `title` | `resources.title` |
| `url` | `resources.url` |
| `quality` | `resources.quality` |
| `medium` | `resources.medium` |
| `codec` | `resources.codec` |
| `audio` | `resources.audio` |
| `subtitle` | `resources.subtitle` |
| `sizeGb` | `resources.size_gb` |
| `raw.sizeBytes` | `resources.size_bytes` |
| `seeders` | `resources.seeders` |
| `leechers` | `resources.leechers` |
| `publishedAt` | `resources.published_at` |
| `trusted` | `resources.trusted` |
| `score` | `resources.score` |
| `matchScore` | `resources.match_score` |
| `status` | `resources.status` |
| 完整对象 | `resources.payload` |
| `updatedAt` | `resources.updated_at` |

导入规则：

- `match_score` 缺省为 `70`。
- `status` 缺省为 `active`。
- 如果 `match_score < 65` 且 JSON 中没有 `status`，导入为 `review`。
- `source_id` 缺失时可尝试按 `source` 名称匹配 `sources.name`。
- `media_id` 不存在于 `media_items` 时，先记录为异常；不要静默丢弃。
- `payload` 必须保存完整原始对象，便于回滚和字段补充。

### 第 6 步：导入同步日志

导入来源：

- `storage/sync-logs.json`

字段映射：

| JSON 字段 | 数据库字段 |
| --- | --- |
| `id` | `sync_logs.id` |
| `type` | `sync_logs.type` |
| `status` | `sync_logs.status` |
| `mediaId` | `sync_logs.media_id` |
| `sourceId` | `sync_logs.source_id` |
| `sourceCount` | `sync_logs.source_count` |
| `importedCount` | `sync_logs.imported_count` |
| `errors.length` | `sync_logs.error_count` |
| `errors` | `sync_logs.error_summary` |
| 完整对象 | `sync_logs.payload` |
| `createdAt` | `sync_logs.created_at` |

导入规则：

- `created_at` 优先使用 `createdAt`。
- `error_summary` 可保存 `errors` 的 JSON 字符串或前几条摘要。
- 缺失 `id` 时使用 `job-` + 时间戳 + 随机后缀生成。

### 第 7 步：切换 store 层读写

目标是只替换持久化实现，不改变业务层调用方式。

需要保持的函数契约：

- `loadMedia()`
- `loadResources()`
- `loadReviewQueue()`
- `updateResourceStatus(id, status)`
- `saveResources(resources)`
- `loadSources()`
- `saveSources(sources)`
- `loadSyncLogs()`
- `appendSyncLog(log)`
- `upsertResources(incoming)`
- `upsertMedia(item)`
- `updateSourceHealth(sourceId, health)`
- `loadSourceHealth()`

切换策略：

- 第一次发布可以保留 JSON fallback：SQLite 不存在或为空时从 JSON 导入。
- 正常运行后，写入只进入 SQLite。
- JSON 文件保留为迁移前备份，不再作为实时状态源。
- 所有写入使用事务，避免同步过程中部分资源导入成功、部分失败。

### 第 8 步：验收和观察

验收通过后再恢复同步入口或重启服务。

观察重点：

- API 返回数量是否一致。
- 资源排序和筛选是否保持一致。
- 审核队列是否仍按 `status = review` 或 `match_score < 65` 返回。
- 同步日志是否能正常追加。
- 来源配置修改后是否能持久化。

## 数据导入脚本设计

建议新增一次性导入脚本，例如：

```text
server/scripts/import-json-store.js
```

脚本职责：

- 显式以 UTF-8 读取 JSON。
- 在开始前备份 JSON 和旧 DB。
- 创建 schema。
- 在一个事务中导入 sources、media_items、resources、sync_logs。
- 输出导入前后计数。
- 对异常数据输出报告，不要自动删除。

伪代码：

```js
const batchId = new Date().toISOString().replace(/[:.]/g, "-");

backupFiles(batchId, [
  "storage/resources.json",
  "storage/sync-logs.json",
  "server/config/sources.json",
  "storage/app.db",
]);

db.exec("BEGIN");
try {
  createSchema();
  importSources();
  importMediaItems();
  importResources();
  importSyncLogs();
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

printCounts();
```

导入脚本输出示例：

```text
[migration] backup=storage/backups/20260607-160000
[migration] sources: json=3 db=3
[migration] media_items: seed=4 db=4
[migration] resources: json=8 db=8
[migration] sync_logs: json=1 db=1
[migration] status=success
```

## 回滚方案

### 回滚触发条件

满足任一条件应回滚：

- 数据库建表或导入失败。
- 导入后计数不一致且无法解释。
- 关键 API 返回 500。
- 资源列表、媒体列表、同步日志出现明显缺失。
- 同步写入后出现重复资源或状态错乱。

### 回滚步骤

1. 停止 Node 服务。
2. 保留失败现场：

```text
storage/app.db
storage/app.db-wal
storage/app.db-shm
```

3. 从备份目录恢复迁移前文件：

```text
storage/resources.json
storage/sync-logs.json
server/config/sources.json
```

4. 如果代码已切换到 SQLite store，则恢复到迁移前 store 实现，或临时启用 JSON fallback。
5. 重启服务。
6. 执行 API 验收，确认返回到迁移前状态。

### 轻量 SQLite 文件级回滚

如果只是数据库内容错误，且 store 代码仍支持从 JSON 重新 seed：

1. 停止服务。
2. 移动当前 DB 到失败批次目录：

```text
storage/backups/YYYYMMDD-HHMMSS-failed/app.db
```

3. 删除或更名 `storage/app.db`、`storage/app.db-wal`、`storage/app.db-shm`。
4. 重启服务，让空库重新从 JSON 导入。

### Prisma 回滚

Prisma 路线需要区分 schema 回滚和数据回滚：

- schema 回滚：使用上一版 migration 或恢复旧 DB 文件。
- 数据回滚：优先恢复迁移前 SQLite 文件，不建议用反向 SQL 手工删除，因为容易误删迁移期间新增数据。

## 验收 SQL

以下 SQL 可用于迁移后检查。

### 基础计数

```sql
SELECT COUNT(*) AS media_count FROM media_items;
SELECT COUNT(*) AS source_count FROM sources;
SELECT COUNT(*) AS enabled_source_count FROM sources WHERE enabled = 1;
SELECT COUNT(*) AS resource_count FROM resources;
SELECT COUNT(*) AS sync_log_count FROM sync_logs;
```

### 资源按媒体分布

```sql
SELECT media_id, COUNT(*) AS resource_count
FROM resources
GROUP BY media_id
ORDER BY resource_count DESC, media_id ASC;
```

### 低置信度审核队列

```sql
SELECT id, media_id, title, match_score, status, updated_at
FROM resources
WHERE status = 'review' OR match_score < 65
ORDER BY updated_at DESC
LIMIT 100;
```

### 字幕统计

```sql
SELECT COUNT(*) AS zh_subtitle_count
FROM resources
WHERE subtitle LIKE '%中文%';
```

### 来源健康状态

```sql
SELECT s.id, s.name, s.type, s.enabled, h.ok, h.message, h.checked_at
FROM sources s
LEFT JOIN source_health h ON h.source_id = s.id
ORDER BY s.id;
```

### 重复资源检查

```sql
SELECT source_id, source_resource_id, COUNT(*) AS duplicate_count
FROM resources
WHERE source_id IS NOT NULL AND source_resource_id IS NOT NULL
GROUP BY source_id, source_resource_id
HAVING COUNT(*) > 1;
```

### 孤儿资源检查

```sql
SELECT r.id, r.media_id, r.title
FROM resources r
LEFT JOIN media_items m ON m.id = r.media_id
WHERE m.id IS NULL;
```

### JSON payload 可用性检查

```sql
SELECT id
FROM resources
WHERE payload IS NULL OR payload = '' OR json_valid(payload) = 0;
```

## 验收 API

迁移前后应对比以下接口返回。

### 统计接口

```http
GET /api/stats
```

验收点：

- `mediaCount` 与 `media_items` 数量一致。
- `resourceCount` 与 `resources` 数量一致。
- `sourceCount` 与 `sources` 数量一致。
- `enabledSourceCount` 与 `sources.enabled = 1` 数量一致。
- `zhSubtitleCount` 与 SQL 字幕统计一致。

### 媒体列表

```http
GET /api/media
GET /api/media?q=沙丘
GET /api/media?type=movie
```

验收点：

- 媒体数量和迁移前一致。
- `resourceCount` 计算正确。
- 搜索和类型过滤结果稳定。

### 媒体详情

```http
GET /api/media/m-001
```

验收点：

- 返回完整媒体 payload。
- `titleZh`、`titleEn`、`poster`、`backdrop` 等字段未丢失。

### 资源列表

```http
GET /api/media/m-001/resources
GET /api/media/m-001/resources?quality=2160p
GET /api/media/m-001/resources?subtitle=中文
```

验收点：

- 资源数量和迁移前一致。
- 质量、字幕筛选结果一致。
- 排序仍符合 `sortResources` 规则。
- `raw`、`updatedAt` 等 payload 字段仍存在。

### 来源列表

```http
GET /api/sources
```

验收点：

- 来源数量一致。
- `enabled`、`type`、`weight`、`baseUrl`、`url` 保持正确。
- 敏感字段按迁移策略保留或迁移到凭据表。

### 同步日志

```http
GET /api/sync-logs
```

验收点：

- 最新日志按 `created_at DESC` 返回。
- `errors`、`sourceCount`、`importedCount` 等字段未丢失。

### 审核队列

```http
GET /api/review/resources
```

验收点：

- 返回 `status = review` 或 `matchScore < 65` 的资源。
- 最多返回 100 条。
- 排序按更新时间倒序。

### 状态更新

```http
POST /api/review/resources/{resourceId}
Content-Type: application/json

{
  "status": "active"
}
```

验收点：

- 数据库 `resources.status` 更新。
- `resources.payload` 中的 `status` 和 `updatedAt` 同步更新。
- 再次读取资源列表时状态一致。

### 手动同步

```http
POST /api/media/m-001/sync
```

验收点：

- 新资源可以 upsert。
- 已存在资源不会重复插入。
- 同步完成后 `sync_logs` 追加一条日志。
- 失败时不会留下半事务数据。

## 数据一致性规则

迁移后建议保持以下规则：

- `resources.media_id` 必须存在于 `media_items.id`。
- `resources.source_id` 如果非空，应存在于 `sources.id`。
- `resources.payload` 必须是合法 JSON。
- `resources.payload.mediaId` 与 `resources.media_id` 应一致。
- `resources.payload.sourceId` 与 `resources.source_id` 应尽量一致；旧数据缺失时允许为空。
- `sync_logs.payload` 必须保留完整原始日志。
- `enabled`、`trusted`、`ok` 在 SQLite 中统一使用 `0` 或 `1`。

## 上线分阶段计划

### 阶段 1：只读导入验证

- 创建 SQLite schema。
- 从 JSON 导入数据。
- 不切换生产读写。
- 执行验收 SQL 和 API 对比。

通过标准：

- JSON 条数与 DB 条数一致。
- API 对比无明显差异。
- payload 字段无丢失。

### 阶段 2：读路径切换

- `load*` 函数改为读取 SQLite。
- 写路径仍可短期保留 JSON 或双写。
- 观察资源列表、媒体列表、来源列表、同步日志。

通过标准：

- 所有 GET API 正常。
- 页面加载、筛选、排序正常。

### 阶段 3：写路径切换

- `save*`、`upsert*`、`appendSyncLog` 改为写 SQLite。
- 所有写操作使用事务。
- JSON 不再作为实时状态源。

通过标准：

- 审核状态更新成功。
- 手动同步成功。
- 同步日志追加成功。
- 重启服务后数据仍存在。

### 阶段 4：清理和长期维护

- JSON 文件保留为历史备份或 seed。
- 新增 schema migration 机制。
- 增加定期 SQLite 备份。
- 评估是否升级 Prisma 或 PostgreSQL。

## 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| JSON 字段不稳定 | 导入时字段缺失或类型不一致 | 保存完整 `payload`，常用字段缺省处理 |
| 来源凭据明文保存 | 安全风险 | 后续拆分 `source_credentials`，使用加密或环境变量 |
| 重复资源 | 资源列表膨胀、排序异常 | 增加 `source_id + source_resource_id` 唯一索引和弱去重策略 |
| 外键不匹配 | 资源无法关联媒体 | 导入前校验 `media_id`，异常写报告 |
| SQLite 并发写限制 | 同步任务并发时写入等待 | WAL、事务短小化、队列化同步 |
| Prisma 引入复杂度 | 本地启动步骤变多 | 短期使用轻量 SQLite，稳定后再升级 |

## 后续演进

- 增加 `subscriptions` 表，支持订阅匹配。
- 增加 `audit_logs` 表，记录来源修改、同步、审核操作。
- 增加 `download_tasks` 表，衔接 qBittorrent、Transmission、Radarr、Sonarr。
- 增加 `quality_profiles` 表，固化质量偏好和评分解释。
- 当数据量和多用户需求增长时，迁移到 PostgreSQL，并将 `payload` 升级为原生 JSONB。

## 变更摘要

- [docs/database-migration-plan.md] Docs: 新增 JSON store 迁移到轻量 SQLite / Prisma + SQLite 的策略、表结构、导入步骤、回滚方案、验收 SQL 与 API 清单。
