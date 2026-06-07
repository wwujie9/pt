import { openSync } from "node:fs";
import { spawnSync } from "node:child_process";

const backupFile = process.argv[2];
const restoreUrl = process.env.RESTORE_DATABASE_URL;

if (!backupFile) throw new Error("用法：npm run backup:postgres:restore -- <backup.dump>");
if (!restoreUrl) throw new Error("缺少环境变量：RESTORE_DATABASE_URL");

if (commandExists("psql") && commandExists("pg_restore")) {
  run("psql", [restoreUrl, "-c", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"]);
  run("pg_restore", ["--no-owner", "--no-acl", "--dbname", restoreUrl, backupFile]);
  run("psql", [restoreUrl, "-c", "SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema = 'public';"]);
} else {
  run("docker", ["exec", postgresContainer(), "psql", restoreUrl, "-c", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"]);
  const input = openSync(backupFile, "r");
  run("docker", ["exec", "-i", postgresContainer(), "pg_restore", "--no-owner", "--no-acl", "--dbname", restoreUrl], input);
  run("docker", ["exec", postgresContainer(), "psql", restoreUrl, "-c", "SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema = 'public';"]);
}

console.log(JSON.stringify({ ok: true, restoredFrom: backupFile }, null, 2));

function run(command, args, stdin = "inherit") {
  const result = spawnSync(command, args, { stdio: [stdin, "inherit", "inherit"] });
  if (result.status !== 0) throw new Error(`${command} 执行失败`);
}

function commandExists(command) {
  const probe = spawnSync(command, ["--version"], { stdio: "ignore" });
  return probe.status === 0;
}

function postgresContainer() {
  return process.env.POSTGRES_CONTAINER || "pt-postgres";
}
