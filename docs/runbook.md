# PT Resource Hub 运行手册

## 当前能力

- 前端页面通过 `/api/*` 读取数据，不再直接读取静态 seed。
- Node 后端提供媒体目录、资源列表、来源配置、手动同步接口。
- 来源适配器支持三类入口：
  - `internal`：内部资源库或本地 seed。
  - `torznab`：Prowlarr / Jackett / Torznab 兼容接口。
  - `rss`：有权限访问的 RSS 订阅源。
- 同步链路为：来源适配器 -> 资源标准化 -> 去重 upsert -> SQLite 持久化。
- 本地数据库位于 `storage/app.db`，生产迁移路径见 `docs/postgresql-migration.md`。

## 启动

```powershell
npm run dev
```

默认地址：

```text
http://127.0.0.1:4273
```

如果端口被占用：

```powershell
$env:PORT='4273'; npm run dev
```

## 来源配置

复制示例配置：

```powershell
Copy-Item -LiteralPath server\config\sources.example.json -Destination server\config\sources.json
```

编辑：

```text
server/config/sources.json
```

示例：

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

## API

### 统计

```http
GET /api/stats
```

### 媒体列表

```http
GET /api/media?q=dune&type=movie&genre=科幻
```

### 媒体详情

```http
GET /api/media/m-002
```

### 资源列表

```http
GET /api/media/m-002/resources?quality=2160p&subtitle=中文
```

### 来源列表

```http
GET /api/sources
```

### 手动同步资源

```http
POST /api/media/m-002/sync
```

## 后续数据库替换点

当前 `server/services/store.js` 使用 SQLite 存储。迁移 PostgreSQL 时，需要保留服务函数签名并替换数据库适配层与 SQL 方言：

- `loadMedia`
- `loadResources`
- `saveResources`
- `loadSources`
- `upsertResources`

## 合规边界

本项目只接入你有权限使用的 PT、Torznab、Jackett、Prowlarr、RSS、API、私有库或授权来源。不实现绕过登录、破解反爬、规避站点规则或未经授权抓取。
