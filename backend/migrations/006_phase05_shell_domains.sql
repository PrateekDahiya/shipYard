-- Phase 05: shell session audit + custom domain ownership verification.

CREATE TABLE IF NOT EXISTS shell_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  project_id BIGINT UNSIGNED NULL,
  container_id VARCHAR(255) NOT NULL,
  status ENUM('open','closed','expired') NOT NULL DEFAULT 'open',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  KEY idx_shell_project_time (project_id, started_at),
  CONSTRAINT fk_shell_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_shell_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE domains ADD COLUMN verification_token VARCHAR(255) NULL AFTER verified;
