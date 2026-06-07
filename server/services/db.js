import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { mediaItems } from "../../src/data/media.seed.js";
import { resources as seedResources } from "../../src/data/resources.seed.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const storageDir = resolve(root, "storage");
const dbFile = resolve(storageDir, "app.db");
const resourcesFile = resolve(storageDir, "resources.json");
const syncLogsFile = resolve(storageDir, "sync-logs.json");
const sourcesFile = resolve(root, "server/config/sources.json");
const sourceExampleFile = resolve(root, "server/config/sources.example.json");

mkdirSync(storageDir, { recursive: true });

const driver = process.env.DATABASE_DRIVER || "sqlite";

export const db = driver === "postgres"
  ? await createPostgresAdapter()
  : createSqliteAdapter();

await runMigrations();
await seedIfEmpty();

export const paths = {
  dbFile,
  resourcesFile,
  sourcesFile,
  syncLogsFile,
};

function createSqliteAdapter() {
  const sqlite = new DatabaseSync(dbFile);
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA foreign_keys = ON");

  return {
    driver: "sqlite",
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        get: async (...args) => statement.get(...normalizeSqliteArgs(args)),
        all: async (...args) => statement.all(...normalizeSqliteArgs(args)),
        run: async (...args) => statement.run(...normalizeSqliteArgs(args)),
      };
    },
    exec: async (sql) => sqlite.exec(sql),
    columns: async (table) => sqlite.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name),
    close: async () => sqlite.close(),
  };
}

function normalizeSqliteArgs(args) {
  return args.map((arg) => typeof arg === "boolean" ? (arg ? 1 : 0) : arg);
}

async function createPostgresAdapter() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_DRIVER=postgres 时必须设置 DATABASE_URL");
  }
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "1" ? { rejectUnauthorized: false } : undefined,
  });

  return {
    driver: "postgres",
    prepare(sql) {
      return {
        get: async (...args) => {
          const result = await pool.query(toPostgresSql(sql), args);
          return result.rows[0] || null;
        },
        all: async (...args) => {
          const result = await pool.query(toPostgresSql(sql), args);
          return result.rows;
        },
        run: async (...args) => {
          const result = await pool.query(toPostgresSql(sql), args);
          return { changes: result.rowCount };
        },
      };
    },
    exec: async (sql) => {
      await pool.query(toPostgresSql(sql));
    },
    columns: async (table) => {
      const result = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
        [table],
      );
      return result.rows.map((row) => row.column_name);
    },
    close: async () => pool.end(),
  };
}

function toPostgresSql(sql) {
  let next = sql.trim();
  next = next.replace(/json_extract\(payload,\s*'\$\.year'\)/gi, "(payload->>'year')::int");
  next = next.replace(/enabled\s*=\s*1/gi, "enabled = TRUE");
  next = transformInsertOrReplace(next);
  let index = 0;
  return next.replace(/\?/g, () => `$${++index}`);
}

function transformInsertOrReplace(sql) {
  const match = sql.match(/^INSERT\s+OR\s+REPLACE\s+INTO\s+([a-z_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([\s\S]*)\)$/i);
  if (!match) return sql;
  const [, table, columnsText, valuesText] = match;
  const columns = columnsText.split(",").map((column) => column.trim());
  const conflictKey = {
    login_attempts: "email",
    source_health: "source_id",
  }[table] || "id";
  const updateColumns = columns.filter((column) => column !== conflictKey && column !== "created_at");
  const assignments = updateColumns.map((column) => `${column} = EXCLUDED.${column}`).join(", ");
  return `
    INSERT INTO ${table} (${columns.join(", ")})
    VALUES (${valuesText})
    ON CONFLICT (${conflictKey}) DO UPDATE SET ${assignments}
  `;
}

async function runMigrations() {
  if (db.driver === "postgres") {
    await db.exec(readFileSync(resolve(root, "deploy/postgres-schema.sql"), "utf8"));
    await recordMigration("0001", "initial_postgres_schema");
    await recordMigration("0002", "auth_audit_and_source_health");
    await recordMigration("0003", "workspace_login_security");
    await recordMigration("0004", "workspace_data_isolation");
    await recordMigration("0005", "download_clients_and_tasks");
    await recordMigration("0006", "audit_workspace_scope");
    await recordMigration("0007", "invitations");
    await recordMigration("0008", "billing_usage");
    await recordMigration("0009", "worker_task_attempts");
    return;
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS media_items (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      media_id TEXT NOT NULL,
      source_id TEXT,
      match_score INTEGER DEFAULT 70,
      status TEXT NOT NULL DEFAULT 'active',
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      type TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sync_logs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS source_health (
      source_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      ok INTEGER NOT NULL DEFAULT 0,
      message TEXT,
      checked_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      password_hash TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      actor_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'starter',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      email TEXT PRIMARY KEY,
      failed_count INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS download_clients (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      type TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      locked_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS billing_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'recorded',
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS usage_snapshots (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      period TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await recordMigration("0001", "initial_sqlite_schema");
  await recordMigration("0002", "auth_audit_and_source_health");
  await recordMigration("0003", "workspace_login_security");
  await ensureColumn("users", "workspace_id", "TEXT NOT NULL DEFAULT 'default'");
  await ensureColumn("media_items", "workspace_id", "TEXT NOT NULL DEFAULT 'default'");
  await ensureColumn("resources", "workspace_id", "TEXT NOT NULL DEFAULT 'default'");
  await ensureColumn("sources", "workspace_id", "TEXT NOT NULL DEFAULT 'default'");
  await ensureColumn("sync_logs", "workspace_id", "TEXT NOT NULL DEFAULT 'default'");
  await ensureColumn("source_health", "workspace_id", "TEXT NOT NULL DEFAULT 'default'");
  await recordMigration("0004", "workspace_data_isolation");
  await recordMigration("0005", "download_clients_and_tasks");
  await ensureColumn("audit_logs", "workspace_id", "TEXT NOT NULL DEFAULT 'default'");
  await recordMigration("0006", "audit_workspace_scope");
  await recordMigration("0007", "invitations");
  await recordMigration("0008", "billing_usage");
  await ensureColumn("tasks", "attempts", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("tasks", "locked_at", "TEXT");
  await recordMigration("0009", "worker_task_attempts");
}

async function seedIfEmpty() {
  const workspaceCount = countValue(await db.prepare("SELECT COUNT(*) AS count FROM workspaces").get());
  if (workspaceCount === 0) {
    await db.prepare(`
      INSERT INTO workspaces (id, name, plan, enabled, created_at, updated_at)
      VALUES ('default', 'Default Workspace', 'starter', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run();
  }

  const mediaCount = countValue(await db.prepare("SELECT COUNT(*) AS count FROM media_items").get());
  if (mediaCount === 0) {
    const insertMedia = db.prepare(`
      INSERT INTO media_items (id, workspace_id, payload, created_at, updated_at)
      VALUES (?, 'default', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    for (const item of mediaItems) {
      await insertMedia.run(item.id, JSON.stringify(item));
    }
  }

  const sourceCount = countValue(await db.prepare("SELECT COUNT(*) AS count FROM sources").get());
  if (sourceCount === 0) {
    const sources = readJsonSync(sourcesFile, readJsonSync(sourceExampleFile, []));
    const insertSource = db.prepare(`
      INSERT INTO sources (id, workspace_id, type, enabled, payload, created_at, updated_at)
      VALUES (?, 'default', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    for (const source of sources) {
      await insertSource.run(source.id, source.type, Boolean(source.enabled), JSON.stringify(source));
    }
  }

  const resourceCount = countValue(await db.prepare("SELECT COUNT(*) AS count FROM resources").get());
  if (resourceCount === 0) {
    const resources = readJsonSync(resourcesFile, seedResources);
    const insertResource = db.prepare(`
      INSERT INTO resources (id, workspace_id, media_id, source_id, match_score, status, payload, created_at, updated_at)
      VALUES (?, 'default', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    for (const resource of resources) {
      await insertResource.run(
        resource.id,
        resource.mediaId,
        resource.sourceId || resource.source || "",
        Number(resource.matchScore || 70),
        resource.status || "active",
        JSON.stringify(resource),
      );
    }
  }

  const logCount = countValue(await db.prepare("SELECT COUNT(*) AS count FROM sync_logs").get());
  if (logCount === 0) {
    const logs = readJsonSync(syncLogsFile, []);
    const insertLog = db.prepare(`
      INSERT INTO sync_logs (id, workspace_id, type, status, payload, created_at)
      VALUES (?, 'default', ?, ?, ?, ?)
    `);
    for (const log of logs) {
      await insertLog.run(log.id, log.type || "sync", log.status || "unknown", JSON.stringify(log), log.createdAt || new Date().toISOString());
    }
  }
}

function readJsonSync(filePath, fallback) {
  try {
    if (!existsSync(filePath)) return fallback;
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function countValue(row) {
  return Number(row?.count || 0);
}

async function recordMigration(version, name) {
  if (db.driver === "postgres") {
    await db.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (version) DO NOTHING
    `).run(version, name);
    return;
  }
  await db.prepare(`
    INSERT OR IGNORE INTO schema_migrations (version, name, applied_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `).run(version, name);
}

async function ensureColumn(table, column, definition) {
  const columns = await db.columns(table);
  if (columns.includes(column)) return;
  await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
