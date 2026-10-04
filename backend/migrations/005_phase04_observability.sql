-- Phase 04: request monitoring + rate limit configuration.
-- request_logs stores metadata only: no bodies, no query strings (may carry secrets).

CREATE TABLE IF NOT EXISTS request_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NULL,
  deployment_id BIGINT UNSIGNED NULL,
  method VARCHAR(16) NOT NULL,
  path VARCHAR(1024) NOT NULL,
  status_code INT NOT NULL,
  latency_ms INT NOT NULL,
  response_bytes INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_request_logs_project_time (project_id, created_at),
  KEY idx_request_logs_status (status_code),
  CONSTRAINT fk_request_logs_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limit_configs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  requests_per_minute INT NOT NULL DEFAULT 100,
  requests_per_hour INT NOT NULL DEFAULT 1000,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rate_limit_project (project_id),
  CONSTRAINT fk_rate_limit_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
