-- Phase 03: webhook dedupe support. Composite index so "same project + same
-- commit already has a live deployment" checks are indexed.

CREATE INDEX idx_deployments_project_commit
  ON deployments (project_id, commit_sha);
