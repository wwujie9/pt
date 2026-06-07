import { Client } from "pg";

const migrationUrl = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
const appUser = process.env.POSTGRES_APP_USER || "pt_app";
const appPassword = process.env.POSTGRES_APP_PASSWORD || "pt_app_password";
const databaseName = process.env.POSTGRES_DB || databaseNameFromUrl(migrationUrl);

if (!migrationUrl) throw new Error("缺少 DATABASE_MIGRATION_URL 或 DATABASE_URL");
assertIdentifier(appUser, "POSTGRES_APP_USER");
assertIdentifier(databaseName, "POSTGRES_DB");

const client = new Client({ connectionString: migrationUrl });
await client.connect();

try {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${literal(appUser)}) THEN
        CREATE ROLE ${ident(appUser)} LOGIN PASSWORD ${literal(appPassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      ELSE
        ALTER ROLE ${ident(appUser)} WITH LOGIN PASSWORD ${literal(appPassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      END IF;
    END
    $$;
  `);
  await client.query(`GRANT CONNECT ON DATABASE ${ident(databaseName)} TO ${ident(appUser)}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${ident(appUser)}`);
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ident(appUser)}`);
  await client.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${ident(appUser)}`);
  await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${ident(appUser)}`);
  await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${ident(appUser)}`);
  await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${ident(appUser)}`);
  await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO ${ident(appUser)}`);
  console.log(JSON.stringify({ ok: true, appUser, databaseName }, null, 2));
} finally {
  await client.end();
}

function databaseNameFromUrl(urlText) {
  if (!urlText) return "pt_resource_hub";
  const url = new URL(urlText);
  return decodeURIComponent(url.pathname.replace(/^\//, "")) || "pt_resource_hub";
}

function assertIdentifier(value, name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(value))) {
    throw new Error(`${name} 只能包含字母、数字、下划线，且不能以数字开头`);
  }
}

function ident(value) {
  return `"${String(value).replace(/"/g, "\"\"")}"`;
}

function literal(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
