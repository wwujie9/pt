CREATE INDEX IF NOT EXISTS idx_users_workspace_role ON users(workspace_id, role);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status_locked_at ON tasks(status, locked_at, created_at);
CREATE INDEX IF NOT EXISTS idx_invitations_token_status ON invitations(token_hash, status);
CREATE INDEX IF NOT EXISTS idx_billing_events_type_created_at ON billing_events(type, created_at DESC);
