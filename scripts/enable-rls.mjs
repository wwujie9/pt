import { readFileSync } from "node:fs";
import { resolve } from "node:path";

if ((process.env.DATABASE_DRIVER || "sqlite") !== "postgres") {
  console.log("RLS 只适用于 PostgreSQL，当前 driver 已跳过。");
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("启用 RLS 需要 DATABASE_MIGRATION_URL 或 DATABASE_URL");

const { Pool } = await import("pg");
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "1" ? { rejectUnauthorized: false } : undefined,
});
const sql = readFileSync(resolve("deploy/rls/enable-workspace-rls.sql"), "utf8");
try {
  await pool.query(sql);
  console.log(JSON.stringify({ ok: true, rls: "enabled" }, null, 2));
} finally {
  await pool.end();
}
