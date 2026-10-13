-- Phase 08: per-project container restart policy. NULL means the platform
-- default (Docker `unless-stopped`): crashed containers are restarted by the
-- daemon automatically. Set explicitly to `always`, `on-failure` or `never`.

ALTER TABLE projects ADD COLUMN restart_policy VARCHAR(32) NULL AFTER memory_limit;
