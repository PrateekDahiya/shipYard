-- Phase 06: isolated preview deployment targets.
ALTER TABLE deployments
  ADD COLUMN environment VARCHAR(32) NOT NULL DEFAULT 'production' AFTER status,
  ADD COLUMN preview_key VARCHAR(128) NULL AFTER environment,
  ADD COLUMN promoted_from BIGINT UNSIGNED NULL AFTER preview_key,
  ADD KEY idx_deployments_environment (project_id, environment, preview_key, id),
  ADD CONSTRAINT fk_deployments_promoted_from FOREIGN KEY (promoted_from) REFERENCES deployments (id) ON DELETE SET NULL;

ALTER TABLE environment_variables
  ADD COLUMN target_environment VARCHAR(32) NOT NULL DEFAULT 'production' AFTER scope,
  DROP INDEX uq_env_project_key,
  ADD UNIQUE KEY uq_env_project_target_key (project_id, target_environment, `key`);

ALTER TABLE deployments
  MODIFY COLUMN trigger_type ENUM('manual','webhook','rollback','promotion') NOT NULL DEFAULT 'manual';
