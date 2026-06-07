const { db } = await import("../server/services/db.js");

const rows = await db.prepare("SELECT version, name, applied_at FROM schema_migrations ORDER BY version").all();
console.log(JSON.stringify(rows, null, 2));

const required = new Map([
  ["0001", db.driver === "postgres" ? "initial_postgres_schema" : "initial_sqlite_schema"],
  ["0002", "auth_audit_and_source_health"],
  ["0003", "workspace_login_security"],
  ["0004", "workspace_data_isolation"],
  ["0005", "download_clients_and_tasks"],
  ["0006", "audit_workspace_scope"],
  ["0007", "invitations"],
  ["0008", "billing_usage"],
  ["0009", "worker_task_attempts"],
]);
if (db.driver === "postgres") {
  required.set("0010", "production_indexes");
}
required.set("0011", "growth_embed_and_ads");
const existing = new Set(rows.map((row) => row.version));
const missing = [...required.keys()].filter((version) => !existing.has(version));
const nameMismatch = rows.filter((row) => required.has(row.version) && required.get(row.version) !== row.name);

if (missing.length) {
  console.error(`Missing migrations: ${missing.join(", ")}`);
  process.exit(1);
}

if (nameMismatch.length) {
  console.error(`Migration name mismatch: ${nameMismatch.map((row) => `${row.version}:${row.name}`).join(", ")}`);
  process.exit(1);
}

const requiredColumns = {
  users: ["workspace_id", "email", "role", "password_hash"],
  media_items: ["workspace_id", "payload"],
  resources: ["workspace_id", "media_id", "source_id", "payload"],
  sources: ["workspace_id", "type", "payload"],
  sync_logs: ["workspace_id", "type", "status", "payload"],
  source_health: ["workspace_id", "source_id", "payload"],
  login_attempts: ["email", "failed_count", "locked_until"],
  download_clients: ["workspace_id", "type", "payload"],
  audit_logs: ["workspace_id", "payload"],
  invitations: ["workspace_id", "email", "token_hash", "status", "expires_at"],
  billing_events: ["workspace_id", "type", "payload"],
  usage_snapshots: ["workspace_id", "period", "payload"],
  tasks: ["workspace_id", "type", "status", "payload", "attempts", "locked_at"],
  traffic_events: ["workspace_id", "source_site", "utm_campaign", "payload"],
  ad_placements: ["workspace_id", "placement", "title", "target_url", "payload"],
  ad_events: ["workspace_id", "placement_id", "event_type", "payload"],
};

for (const [table, columns] of Object.entries(requiredColumns)) {
  const existingColumns = new Set(await db.columns(table));
  const missingColumns = columns.filter((column) => !existingColumns.has(column));
  if (missingColumns.length) {
    console.error(`Table ${table} missing columns: ${missingColumns.join(", ")}`);
    process.exit(1);
  }
}
