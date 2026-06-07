import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../server/services/db.js";

if (db.driver !== "postgres") {
  console.log("RLS 只适用于 PostgreSQL，当前 driver 已跳过。");
  await db.close?.();
  process.exit(0);
}

const sql = readFileSync(resolve("deploy/rls/enable-workspace-rls.sql"), "utf8");
await db.withRlsBypass(() => db.exec(sql));
console.log(JSON.stringify({ ok: true, rls: "enabled" }, null, 2));
await db.close?.();
