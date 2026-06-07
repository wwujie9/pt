# 同步日志文档与验收清单

本文档用于验收 PT Resource Hub 的来源接入、Torznab 能力探测、同步日志、资源匹配置信度与 TMDB 配置。所有本地文本文件统一按 UTF-8 无 BOM 保存；在 Windows PowerShell 中读取中文文档时建议显式指定编码。

```powershell
Get-Content -Path docs\integration-checklist.md -Raw -Encoding utf8
```

## 验收前提

- 只接入自有、授权或公共领域资源来源。
- 不修改 `src/server` 代码，不回退他人修改。
- Node.js 版本满足 `package.json` 中的 `>=20`。
- 后端服务固定使用端口 `4273`。
- 如需真实 TMDB 查询，已准备可用的 `TMDB_API_KEY`。
- 如需真实 Torznab 验证，已准备 Prowlarr 或 Jackett 实例、API Key 与至少一个可访问的索引器。

## 固定端口 4273

验收目标：服务必须在 `http://127.0.0.1:4273` 对外提供页面和 API。

启动命令：

```powershell
$env:PORT='4273'
npm run dev:4273
```

验收清单：

- [ ] 访问 `http://127.0.0.1:4273/` 能打开前端页面。
- [ ] 访问 `http://127.0.0.1:4273/api/stats` 返回 JSON。
- [ ] 返回内容中包含媒体数量、资源数量、来源数量等统计字段。
- [ ] 控制台日志显示服务运行在 `http://127.0.0.1:4273`。

## 来源 CRUD

验收目标：来源配置支持列表、新增或更新、删除，且不会泄露敏感凭据到日志或页面说明中。

当前来源配置文件：

```text
server/config/sources.json
```

来源类型：

- `internal`：内部资源库或本地 seed。
- `torznab`：Prowlarr / Jackett / Torznab 兼容接口。
- `rss`：有权限访问的 RSS 订阅源。

列表验收：

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:4273/api/sources' -Method Get
```

- [ ] 返回数组。
- [ ] 每个来源至少包含 `id`、`name`、`type`、`enabled`。
- [ ] 已禁用来源不会参与同步。

新增或更新验收：

```powershell
$body = @{
  id = 'authorized-rss-check'
  name = 'Authorized RSS Check'
  type = 'rss'
  enabled = $false
  weight = 0.8
  url = 'https://example.com/authorized-feed.xml'
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Uri 'http://127.0.0.1:4273/api/sources' `
  -Method Post `
  -ContentType 'application/json; charset=utf-8' `
  -Body $body
```

- [ ] 返回刚写入的来源对象。
- [ ] 再次 `GET /api/sources` 可以看到该来源。
- [ ] 同一个 `id` 再次提交会更新来源，而不是重复追加。

删除验收：

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:4273/api/sources/authorized-rss-check' -Method Delete
```

- [ ] 返回 `deleted: true`。
- [ ] 再次 `GET /api/sources` 不再包含该来源。
- [ ] 删除不存在来源时不会影响其他来源。

## Torznab caps/test

验收目标：Torznab 来源可做连通性测试，并可读取能力信息。

来源示例：

```json
{
  "id": "prowlarr-torznab",
  "name": "Prowlarr Torznab",
  "type": "torznab",
  "enabled": true,
  "weight": 1,
  "baseUrl": "http://127.0.0.1:9696/api/v1/search",
  "apiKey": "replace-with-your-prowlarr-api-key"
}
```

连通性测试：

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:4273/api/sources/prowlarr-torznab/test' -Method Post
```

验收清单：

- [ ] 返回 `ok: true` 或明确的失败原因。
- [ ] API Key 无效时返回认证或请求失败信息。
- [ ] 来源不存在时返回可理解的错误信息。

能力探测：

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:4273/api/sources/prowlarr-torznab/caps' -Method Get
```

验收清单：

- [ ] 请求会向 Torznab 接口追加 `t=caps`。
- [ ] 返回内容包含 categories、limits 或原始 caps 摘要。
- [ ] Prowlarr / Jackett 返回非 2xx 时，接口返回 `Torznab caps 请求失败：状态码` 这类明确错误。
- [ ] caps 响应不应把 API Key 写入同步日志或前端页面。

## 同步日志

验收目标：手动同步会记录同步日志，日志可通过 API 读取，并落盘到本地 JSON。

同步入口：

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:4273/api/media/m-002/sync' -Method Post
```

日志入口：

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:4273/api/sync-logs' -Method Get
```

本地存储：

```text
storage/sync-logs.json
```

验收清单：

- [ ] 同步响应包含媒体 ID、来源数量、导入数量或错误摘要。
- [ ] `GET /api/sync-logs` 返回最近同步记录。
- [ ] 每条日志至少能追踪同步类型、媒体 ID、来源数量、导入数量、错误数量和时间。
- [ ] 单个来源失败时，其他可用来源仍可继续同步。
- [ ] 错误日志只记录脱敏后的错误摘要，不记录 API Key、Cookie、Passkey、下载 URL 等敏感信息。
- [ ] 日志文件可用 `Get-Content -Raw -Encoding utf8` 正常读取中文。

## 资源匹配置信度

验收目标：同步后的资源需要保留匹配置信度或可解释评分，低置信度结果可被识别并进入后续审核流程。

当前可验收字段：

- `matchScore`：资源与媒体条目的匹配置信度。
- `trusted`：来源是否可信。
- `score`：资源综合排序分数。
- `sourceId` / `source` / `sourceType`：来源标识。

资源列表入口：

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:4273/api/media/m-002/resources?quality=2160p&subtitle=中文' -Method Get
```

验收清单：

- [ ] 返回资源包含来源信息、质量信息、字幕信息、发布时间、体积、做种数等字段。
- [ ] 资源包含 `matchScore` 或可推导的匹配分值。
- [ ] 排序结果综合考虑质量、介质、做种数、字幕、来源可信度和匹配置信度。
- [ ] `matchScore` 低于内部阈值的资源不应静默合并为强匹配，应标记为待审核或在后续审核队列中处理。
- [ ] 同一来源同一资源 ID 重复同步时应 upsert，而不是生成重复资源。

建议验收分层：

- 高置信度：标题、年份、季集、来源唯一 ID 高度一致，可自动合并。
- 中置信度：来源 guid 或 info hash 一致，但标题存在轻微差异，可自动合并并保留原始字段。
- 低置信度：只有模糊标题相似，体积或年份差异明显，应进入待审核队列。

## TMDB API Key 配置

验收目标：未配置 TMDB API Key 时系统应优雅降级；配置后可执行真实 TMDB 查询。

临时配置：

```powershell
$env:TMDB_API_KEY='replace-with-your-tmdb-api-key'
$env:PORT='4273'
npm run dev:4273
```

查询验收：

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:4273/api/tmdb/search?q=Dune&type=movie&language=zh-CN' -Method Get
```

验收清单：

- [ ] 未配置 `TMDB_API_KEY` 时，接口返回“未配置 TMDB_API_KEY，当前仅使用本地媒体目录。”这类可理解提示。
- [ ] 配置 `TMDB_API_KEY` 后，接口返回 TMDB 搜索结果。
- [ ] `type` 支持 `multi`、`movie`、`tv` 等 TMDB 支持的搜索类型。
- [ ] `language=zh-CN` 时优先返回中文元数据。
- [ ] TMDB 请求失败时返回明确 HTTP 状态或错误摘要。
- [ ] 不把 TMDB API Key 写入仓库文件、同步日志或页面输出。

## 用 Prowlarr 接入验证

验收目标：通过 Prowlarr 的 Torznab 聚合接口验证来源测试、caps、同步和资源入库。

Prowlarr 准备：

- 在 Prowlarr 中添加至少一个你有权限使用的索引器。
- 在 Settings 或 General 中复制 API Key。
- 确认 Prowlarr 本机地址，例如 `http://127.0.0.1:9696`。
- 使用 Prowlarr 的 Torznab 搜索接口作为 `baseUrl`，例如 `http://127.0.0.1:9696/api/v1/search`。

写入来源：

```powershell
$body = @{
  id = 'prowlarr-torznab'
  name = 'Prowlarr Torznab'
  type = 'torznab'
  enabled = $true
  weight = 1
  baseUrl = 'http://127.0.0.1:9696/api/v1/search'
  apiKey = 'replace-with-your-prowlarr-api-key'
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Uri 'http://127.0.0.1:4273/api/sources' `
  -Method Post `
  -ContentType 'application/json; charset=utf-8' `
  -Body $body
```

验证顺序：

- [ ] `POST /api/sources/prowlarr-torznab/test` 返回来源可用。
- [ ] `GET /api/sources/prowlarr-torznab/caps` 返回 Prowlarr 聚合能力。
- [ ] `POST /api/media/m-002/sync` 可以从 Prowlarr 返回候选资源。
- [ ] `GET /api/media/m-002/resources` 能看到来源为 `Prowlarr Torznab` 的资源。
- [ ] `GET /api/sync-logs` 能看到本次同步日志。
- [ ] Prowlarr 中禁用索引器或使用错误 API Key 后，系统返回明确错误而不是空白失败。

## 用 Jackett 接入验证

验收目标：通过 Jackett 的 Torznab 兼容接口验证同一套 Torznab 适配路径。

Jackett 准备：

- 在 Jackett 中添加至少一个你有权限使用的索引器。
- 复制 Jackett API Key。
- 从索引器页面复制 Torznab Feed 地址。
- 常见地址形态为 `http://127.0.0.1:9117/api/v2.0/indexers/{indexer}/results/torznab/`。

写入来源：

```powershell
$body = @{
  id = 'jackett-torznab'
  name = 'Jackett Torznab'
  type = 'torznab'
  enabled = $true
  weight = 0.95
  baseUrl = 'http://127.0.0.1:9117/api/v2.0/indexers/all/results/torznab/'
  apiKey = 'replace-with-your-jackett-api-key'
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Uri 'http://127.0.0.1:4273/api/sources' `
  -Method Post `
  -ContentType 'application/json; charset=utf-8' `
  -Body $body
```

验证顺序：

- [ ] `POST /api/sources/jackett-torznab/test` 返回来源可用。
- [ ] `GET /api/sources/jackett-torznab/caps` 返回 Jackett caps。
- [ ] `POST /api/media/m-002/sync` 后资源可入库。
- [ ] `GET /api/media/m-002/resources` 能看到来源为 `Jackett Torznab` 的资源。
- [ ] `GET /api/sync-logs` 能定位 Jackett 来源的同步成功或失败摘要。
- [ ] Jackett 索引器不可用时，错误被记录为来源级失败，不影响其他来源同步。

## 最终验收矩阵

| 项目 | 通过标准 |
| --- | --- |
| 固定端口 4273 | 页面和 API 均从 `http://127.0.0.1:4273` 可访问 |
| 来源 CRUD | `GET /api/sources`、`POST /api/sources`、`DELETE /api/sources/:id` 行为符合预期 |
| Torznab test | `POST /api/sources/:id/test` 返回连通状态或明确错误 |
| Torznab caps | `GET /api/sources/:id/caps` 返回能力摘要或明确错误 |
| 同步日志 | `POST /api/media/:id/sync` 后 `GET /api/sync-logs` 可追踪记录 |
| 资源匹配置信度 | 资源包含 `matchScore` 或可解释评分，低置信度不静默强合并 |
| TMDB API Key | 未配置时优雅降级，配置后可执行真实查询 |
| Prowlarr 验证 | Prowlarr 来源可 test、caps、sync、入库、查日志 |
| Jackett 验证 | Jackett 来源可 test、caps、sync、入库、查日志 |
| 敏感信息 | API Key、Cookie、Passkey、下载 URL 不进入日志或文档示例真实值 |

## 变更摘要

- [docs/integration-checklist.md] Docs: 新增同步日志文档与验收清单，覆盖固定端口、来源 CRUD、Torznab caps/test、同步日志、资源匹配置信度、TMDB 配置及 Prowlarr/Jackett 接入验证。
