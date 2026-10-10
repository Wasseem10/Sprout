CREATE TABLE IF NOT EXISTS insightos_projects (
  id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  module_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  body JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
