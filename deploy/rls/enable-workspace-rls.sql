CREATE OR REPLACE FUNCTION app_current_workspace_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.workspace_id', true), '')
$$;

CREATE OR REPLACE FUNCTION app_rls_bypass()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('app.rls_bypass', true) IN ('1', 'true', 'on')
$$;

ALTER TABLE media_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_items FORCE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources FORCE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE source_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_health FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE download_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_clients FORCE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events FORCE ROW LEVEL SECURITY;
ALTER TABLE usage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE traffic_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_events FORCE ROW LEVEL SECURITY;
ALTER TABLE ad_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_placements FORCE ROW LEVEL SECURITY;
ALTER TABLE ad_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_media_items ON media_items;
CREATE POLICY tenant_media_items ON media_items
  USING (app_rls_bypass() OR workspace_id = app_current_workspace_id())
  WITH CHECK (app_rls_bypass() OR workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_resources ON resources;
CREATE POLICY tenant_resources ON resources
  USING (app_rls_bypass() OR workspace_id = app_current_workspace_id())
  WITH CHECK (app_rls_bypass() OR workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_sources ON sources;
CREATE POLICY tenant_sources ON sources
  USING (app_rls_bypass() OR workspace_id = app_current_workspace_id())
  WITH CHECK (app_rls_bypass() OR workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_sync_logs ON sync_logs;
CREATE POLICY tenant_sync_logs ON sync_logs
  USING (app_rls_bypass() OR workspace_id = app_current_workspace_id())
  WITH CHECK (app_rls_bypass() OR workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_source_health ON source_health;
CREATE POLICY tenant_source_health ON source_health
  USING (app_rls_bypass() OR workspace_id = app_current_workspace_id())
  WITH CHECK (app_rls_bypass() OR workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_audit_logs ON audit_logs;
CREATE POLICY tenant_audit_logs ON audit_logs
  USING (app_rls_bypass() OR workspace_id = app_current_workspace_id())
  WITH CHECK (app_rls_bypass() OR workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_users ON users;
CREATE POLICY tenant_users ON users
  USING (app_rls_bypass() OR workspace_id = app_current_workspace_id())
  WITH CHECK (app_rls_bypass() OR workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_download_clients ON download_clients;
CREATE POLICY tenant_download_clients ON download_clients
  USING (app_rls_bypass() OR workspace_id = app_current_workspace_id())
  WITH CHECK (app_rls_bypass() OR workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_tasks ON tasks;
CREATE POLICY tenant_tasks ON tasks
  USING (app_rls_bypass() OR workspace_id = app_current_workspace_id())
  WITH CHECK (app_rls_bypass() OR workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_invitations ON invitations;
CREATE POLICY tenant_invitations ON invitations
  USING (app_rls_bypass() OR workspace_id = app_current_workspace_id())
  WITH CHECK (app_rls_bypass() OR workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_billing_events ON billing_events;
CREATE POLICY tenant_billing_events ON billing_events
  USING (app_rls_bypass() OR workspace_id = app_current_workspace_id())
  WITH CHECK (app_rls_bypass() OR workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_usage_snapshots ON usage_snapshots;
CREATE POLICY tenant_usage_snapshots ON usage_snapshots
  USING (app_rls_bypass() OR workspace_id = app_current_workspace_id())
  WITH CHECK (app_rls_bypass() OR workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_traffic_events ON traffic_events;
CREATE POLICY tenant_traffic_events ON traffic_events
  USING (app_rls_bypass() OR workspace_id = app_current_workspace_id())
  WITH CHECK (app_rls_bypass() OR workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_ad_placements ON ad_placements;
CREATE POLICY tenant_ad_placements ON ad_placements
  USING (app_rls_bypass() OR workspace_id = app_current_workspace_id())
  WITH CHECK (app_rls_bypass() OR workspace_id = app_current_workspace_id());

DROP POLICY IF EXISTS tenant_ad_events ON ad_events;
CREATE POLICY tenant_ad_events ON ad_events
  USING (app_rls_bypass() OR workspace_id = app_current_workspace_id())
  WITH CHECK (app_rls_bypass() OR workspace_id = app_current_workspace_id());
