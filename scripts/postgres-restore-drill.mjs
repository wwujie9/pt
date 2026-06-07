import { openSync } from "node:fs";
import { spawnSync } from "node:child_process";

const backupFile = process.argv[2];
const restoreUrl = process.env.RESTORE_DATABASE_URL;
const startedAt = Date.now();
const slaSeconds = Number(process.env.RESTORE_SLA_SECONDS || 300);

if (!backupFile) throw new Error("用法：npm run backup:postgres:restore -- <backup.dump>");
if (!restoreUrl) throw new Error("缺少环境变量：RESTORE_DATABASE_URL");

let tables = 0;
if (commandExists("psql") && commandExists("pg_restore")) {
  run("psql", [restoreUrl, "-c", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"]);
  run("pg_restore", ["--no-owner", "--no-acl", "--dbname", restoreUrl, backupFile]);
  tables = Number(runCapture("psql", [restoreUrl, "-t", "-A", "-c", "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"]).trim());
} else {
  run("docker", ["exec", postgresContainer(), "psql", restoreUrl, "-c", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"]);
  const input = openSync(backupFile, "r");
  run("docker", ["exec", "-i", postgresContainer(), "pg_restore", "--no-owner", "--no-acl", "--dbname", restoreUrl], input);
  tables = Number(runCapture("docker", ["exec", postgresContainer(), "psql", restoreUrl, "-t", "-A", "-c", "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"]).trim());
}

const durationMs = Date.now() - startedAt;
const slaMet = durationMs <= slaSeconds * 1000;
if (!tables || tables < 10) throw new Error(`恢复后表数量异常：${tables}`);
if (!slaMet) throw new Error(`恢复耗时 ${durationMs}ms 超过 SLA ${slaSeconds}s`);

console.log(JSON.stringify({
  ok: true,
  restoredFrom: backupFile,
  durationMs,
  slaSeconds,
  slaMet,
  tables,
}, null, 2));

function run(command, args, stdin = "inherit") {
  const result = spawnSync(command, args, { stdio: [stdin, "inherit", "inherit"] });
  if (result.status !== 0) throw new Error(`${command} 执行失败`);
}

function runCapture(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "");
    throw new Error(`${command} 执行失败`);
  }
  return result.stdout || "";
}

function commandExists(command) {
  const probe = spawnSync(command, ["--version"], { stdio: "ignore" });
  return probe.status === 0;
}

function postgresContainer() {
  return process.env.POSTGRES_CONTAINER || "pt-postgres";
}
