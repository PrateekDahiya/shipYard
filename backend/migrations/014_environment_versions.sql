-- Phase 06: auditable, rollbackable environment versions.
CREATE TABLE IF NOT EXISTS environment_variable_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  `key` VARCHAR(255) NOT NULL,
  target_environment VARCHAR(32) NOT NULL DEFAULT 'production',
  `value` TEXT NOT NULL,
  is_secret TINYINT(1) NOT NULL DEFAULT 1,
  scope ENUM('build','runtime','both') NOT NULL DEFAULT 'both',
  version INT NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_env_versions_key (project_id, target_environment, `key`, version),
  CONSTRAINT fk_env_versions_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_env_versions_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
