CREATE OR REPLACE FUNCTION app_current_workspace_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.workspace_id', true), '')
$$;

ALTER TABLE media_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_media_items ON media_items;
CREATE POLICY tenant_media_items ON media_items
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_resources ON resources;
CREATE POLICY tenant_resources ON resources
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_sources ON sources;
CREATE POLICY tenant_sources ON sources
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_sync_logs ON sync_logs;
CREATE POLICY tenant_sync_logs ON sync_logs
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_source_health ON source_health;
CREATE POLICY tenant_source_health ON source_health
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_audit_logs ON audit_logs;
CREATE POLICY tenant_audit_logs ON audit_logs
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_users ON users;
CREATE POLICY tenant_users ON users
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_download_clients ON download_clients;
CREATE POLICY tenant_download_clients ON download_clients
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_tasks ON tasks;
CREATE POLICY tenant_tasks ON tasks
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_invitations ON invitations;
CREATE POLICY tenant_invitations ON invitations
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_billing_events ON billing_events;
CREATE POLICY tenant_billing_events ON billing_events
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_usage_snapshots ON usage_snapshots;
CREATE POLICY tenant_usage_snapshots ON usage_snapshots
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());
