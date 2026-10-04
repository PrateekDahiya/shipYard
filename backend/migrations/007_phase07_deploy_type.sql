-- Phase 07: static vs server deployment flavors.
-- server (default) preserves current behavior; static serves a build output
-- dir via nginx with a forced `/` health check.

ALTER TABLE projects
  ADD COLUMN deploy_type ENUM('server','static') NOT NULL DEFAULT 'server' AFTER auto_deploy,
  ADD COLUMN output_dir VARCHAR(255) NOT NULL DEFAULT 'build' AFTER deploy_type;
