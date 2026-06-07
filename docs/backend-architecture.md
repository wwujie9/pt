# 后端架构方案

## 目标

后端目标不是做单个站点爬虫，而是做一个可扩展的资源索引与编排平台：

- 统一接入用户有权限访问的 PT、Torznab、Jackett、Prowlarr、RSS、API、私有库。
- 统一标准化资源字段。
- 对资源进行解析、去重、质量评分和排序。
- 支持手动同步、定时同步、订阅匹配、通知投递。
- 为后续 PostgreSQL、Prisma、Redis、BullMQ、下载器联动预留清晰边界。

当前代码已实现第一阶段可运行骨架：

- `server/index.js`：HTTP 服务和静态页面服务。
- `server/routes/api.js`：API 路由层。
- `server/services/*`：应用服务层。
- `server/adapters/*`：来源适配器层。
- `server/domain/*`：领域标准化逻辑。
- `server/config/sources.json`：来源配置。
- `storage/resources.json`：本地资源持久化文件。

## 分层

```text
Browser UI
  -> API Routes
    -> Application Services
      -> Domain Rules
      -> Source Adapters
      -> Store
```

### API Routes

负责 HTTP 输入输出，不写业务规则。

当前文件：

- `server/routes/api.js`

当前接口：

- `GET /api/stats`
- `GET /api/media`
- `GET /api/media/:id`
- `GET /api/media/:id/resources`
- `GET /api/sources`
- `POST /api/media/:id/sync`

### Application Services

负责组织业务流程。

当前文件：

- `server/services/catalog.js`
- `server/services/store.js`
- `server/services/sync.js`

职责：

- 读取媒体目录。
- 读取资源列表。
- 读取来源配置。
- 调用适配器同步资源。
- 写入标准化资源。

### Domain Rules

负责纯业务规则，不直接访问网络。

当前文件：

- `server/domain/resource-normalizer.js`
- `src/domain/resource-parser.js`
- `src/domain/resource-ranking.js`
- `src/domain/media-search.js`

职责：

- 标题解析。
- 质量识别。
- 字幕识别。
- 来源可信度判断。
- 资源评分与排序。
- 资源标准化。

### Source Adapters

负责协议转换，不做审批和最终决策。

当前文件：

- `server/adapters/internal-adapter.js`
- `server/adapters/rss-adapter.js`
- `server/adapters/torznab-adapter.js`
- `server/adapters/index.js`

当前支持：

- `internal`：内部资源库。
- `rss`：授权 RSS。
- `torznab`：Prowlarr / Jackett / Torznab 兼容接口。

后续可增加：

- `newznab`
- `official-api`
- `private-library`
- `radarr`
- `sonarr`
- `qbittorrent`
- `transmission`
- `plex`
- `jellyfin`
- `emby`

### Store

当前使用 JSON 文件，便于本地直接运行。

当前文件：

- `storage/resources.json`
- `server/config/sources.json`

后续迁移 PostgreSQL 时，保持服务函数签名不变，只替换 `server/services/store.js` 内部实现。

## 推荐数据库模型

### `media_items`

保存电影、剧集、季、集等元数据。

字段建议：

- `id`
- `type`
- `tmdb_id`
- `imdb_id`
- `tvdb_id`
- `title`
- `original_title`
- `year`
- `overview`
- `poster_url`
- `backdrop_url`
- `rating`
- `metadata_json`
- `created_at`
- `updated_at`

### `sources`

保存来源配置。

字段建议：

- `id`
- `name`
- `type`
- `base_url`
- `enabled`
- `weight`
- `tags`
- `capabilities_json`
- `health_status`
- `last_checked_at`
- `created_at`
- `updated_at`

敏感字段不直接放在这里，应放入加密凭据表。

### `source_credentials`

保存加密凭据。

字段建议：

- `id`
- `source_id`
- `credential_type`
- `encrypted_payload`
- `created_at`
- `rotated_at`

### `resources`

保存标准化资源。

字段建议：

- `id`
- `media_item_id`
- `source_id`
- `source_resource_id`
- `title`
- `info_ref`
- `download_ref`
- `quality`
- `medium`
- `codec`
- `audio`
- `subtitle`
- `size_bytes`
- `seeders`
- `leechers`
- `published_at`
- `score`
- `match_score`
- `status`
- `raw_payload_json`
- `created_at`
- `updated_at`

### `sync_jobs`

保存同步任务。

字段建议：

- `id`
- `type`
- `source_id`
- `media_item_id`
- `status`
- `started_at`
- `finished_at`
- `processed_count`
- `imported_count`
- `error_count`
- `error_summary`

### `subscriptions`

保存用户订阅。

字段建议：

- `id`
- `user_id`
- `media_item_id`
- `keyword`
- `quality_profile_id`
- `enabled`
- `last_matched_at`
- `created_at`
- `updated_at`

### `audit_logs`

保存审计日志。

字段建议：

- `id`
- `actor_user_id`
- `action`
- `target_type`
- `target_id`
- `safe_metadata_json`
- `ip`
- `created_at`

## SourceAdapter 接口

当前代码已经按这个方向组织：

```ts
type SourceAdapter = {
  source: SourceConfig;
  search(input: SearchInput): Promise<RawSourceResource[]>;
};
```

建议完整接口：

```ts
type SourceAdapter = {
  source: SourceConfig;
  testConnection(): Promise<SourceHealth>;
  getCapabilities?(): Promise<SourceCapabilities>;
  search(input: SearchInput): Promise<RawSourceResource[]>;
};
```

`SearchInput`：

```ts
type SearchInput = {
  media: MediaItem;
  query?: string;
  season?: number;
  episode?: number;
  categories?: string[];
};
```

`RawSourceResource`：

```ts
type RawSourceResource = {
  sourceResourceId: string;
  title: string;
  url?: string;
  publishedAt?: string;
  sizeBytes?: number;
  seeders?: number;
  leechers?: number;
  raw?: unknown;
};
```

## 同步流程

当前实现：

```text
POST /api/media/:id/sync
  -> syncResourcesForMedia(mediaId)
    -> load media
    -> load enabled sources
    -> create adapter
    -> adapter.search
    -> normalizeExternalResource
    -> upsertResources
```

后续增强：

- 同步任务入队。
- 每个来源独立限流。
- 每个来源独立失败重试。
- 记录同步日志。
- 记录来源健康状态。
- 支持 RSS 增量水位。
- 支持 Torznab caps 缓存。

## 匹配与去重

当前去重：

- 使用 `sourceId + sourceResourceId/url/title` 生成资源 ID。
- `upsertResources` 按资源 ID 覆盖更新。

后续建议：

- 强去重：`source_id + source_resource_id`。
- 中等去重：`info_hash` 或来源 guid。
- 弱去重：标题归一化 + 体积 + 年份 + 季集 + 发布组。
- 低置信度合并进入审核队列。

## 质量评分

当前评分维度：

- 清晰度。
- 介质。
- seeders。
- 字幕。
- 来源可信度。

后续建议引入：

- 来源权重。
- 体积合理性。
- 编码偏好。
- HDR / Dolby Vision。
- 音频规格。
- 发布组偏好。
- 黑白名单。
- Custom Format。
- 用户订阅偏好。

评分结果应可解释：

```text
总分 91
+ 2160p
+ WEB-DL
+ 多语言字幕
+ 来源可信
- 体积偏大
```

## 权限与审计

MVP 可以先单管理员模式。

后续角色：

- 普通用户。
- 可信用户。
- 审核员。
- 管理员。
- 超级管理员。

必须审计：

- 来源新增、编辑、删除。
- 凭据更新。
- 手动同步。
- 资源下架。
- 订阅变更。
- 下载器任务提交。

日志必须脱敏：

- API Key。
- Cookie。
- Passkey。
- 下载 URL。
- 私有源详情链接。

## 合规边界

系统只接入用户有权限访问的来源：

- PT 授权源。
- Torznab。
- Jackett。
- Prowlarr。
- RSS。
- API。
- 私有库。

不实现：

- 绕过登录。
- 绕过验证码。
- 绕过 Cloudflare。
- 未授权 HTML 抓取。
- 账号共享。
- Passkey 共享。
- 伪造上传量。
- 规避 HnR 或 ratio 规则。

## 近期开发顺序

1. 将 `sources.json` 管理页面做成可编辑。
2. 给 Torznab 适配器增加 `caps` 测试接口。
3. 增加同步日志。
4. 增加资源低置信度审核队列。
5. 将 JSON 存储替换为 SQLite 或 PostgreSQL。
6. 引入 Prisma schema。
7. 引入 BullMQ 同步队列。
8. 增加用户与管理员权限。
9. 接 TMDB 真实搜索与详情。
10. 增加订阅通知。

## 变更摘要

- [docs/backend-architecture.md] Docs: 新增真实可整合 PT 资源站后端分层、数据模型、适配器接口、同步链路、评分、审计与后续演进方案。
