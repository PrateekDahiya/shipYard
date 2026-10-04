-- Phase 02: deployment engine core (M5-M8).
-- Immutable deployment history; status mutated only via guarded transitions.

CREATE TABLE IF NOT EXISTS deployments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  commit_sha VARCHAR(255) NOT NULL,
  branch VARCHAR(255) NOT NULL DEFAULT 'main',
  commit_message TEXT NULL,
  commit_author VARCHAR(255) NULL,
  triggered_by BIGINT UNSIGNED NULL,
  trigger_type ENUM('manual','webhook','rollback') NOT NULL DEFAULT 'manual',
  rollback_of BIGINT UNSIGNED NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'QUEUED',
  build_command VARCHAR(1024) NULL,
  run_command VARCHAR(1024) NULL,
  app_port INT NULL,
  image_tag VARCHAR(1024) NULL,
  container_id VARCHAR(255) NULL,
  live_url VARCHAR(1024) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL,
  finished_at TIMESTAMP NULL,
  KEY idx_deployments_project_time (project_id, created_at),
  KEY idx_deployments_status (status),
  KEY idx_deployments_commit (commit_sha),
  CONSTRAINT fk_deployments_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_deployments_user FOREIGN KEY (triggered_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deployment_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  deployment_id BIGINT UNSIGNED NOT NULL,
  stage VARCHAR(64) NOT NULL,
  status VARCHAR(64) NOT NULL,
  message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_deployment_events_dep (deployment_id, created_at),
  CONSTRAINT fk_deployment_events_dep FOREIGN KEY (deployment_id) REFERENCES deployments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS builds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  deployment_id BIGINT UNSIGNED NOT NULL,
  command TEXT NOT NULL,
  working_directory VARCHAR(1024) NULL,
  exit_code INT NULL,
  timed_out TINYINT(1) NOT NULL DEFAULT 0,
  started_at TIMESTAMP NULL,
  finished_at TIMESTAMP NULL,
  UNIQUE KEY uq_builds_deployment (deployment_id),
  CONSTRAINT fk_builds_dep FOREIGN KEY (deployment_id) REFERENCES deployments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS build_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  deployment_id BIGINT UNSIGNED NOT NULL,
  source ENUM('clone','build','image','startup','healthcheck','routing','system') NOT NULL DEFAULT 'system',
  stream ENUM('stdout','stderr') NOT NULL DEFAULT 'stdout',
  line TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_build_logs_dep (deployment_id, created_at),
  CONSTRAINT fk_build_logs_dep FOREIGN KEY (deployment_id) REFERENCES deployments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS application_instances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  deployment_id BIGINT UNSIGNED NOT NULL,
  container_id VARCHAR(255) NOT NULL,
  state ENUM('STARTING','RUNNING','STOPPED','CRASHED','UNHEALTHY') NOT NULL DEFAULT 'STARTING',
  host_port INT NULL,
  started_at TIMESTAMP NULL,
  stopped_at TIMESTAMP NULL,
  UNIQUE KEY uq_instances_container (container_id),
  KEY idx_instances_project (project_id),
  CONSTRAINT fk_instances_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_instances_dep FOREIGN KEY (deployment_id) REFERENCES deployments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS health_checks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  deployment_id BIGINT UNSIGNED NOT NULL,
  path VARCHAR(1024) NOT NULL DEFAULT '/health',
  expected_status INT NOT NULL DEFAULT 200,
  attempt INT NOT NULL DEFAULT 1,
  result ENUM('pass','fail') NOT NULL,
  latency_ms INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_health_checks_dep (deployment_id, created_at),
  CONSTRAINT fk_health_checks_dep FOREIGN KEY (deployment_id) REFERENCES deployments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS domains (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  hostname VARCHAR(255) NOT NULL,
  kind ENUM('shipyard','custom') NOT NULL DEFAULT 'shipyard',
  verified TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_domains_hostname (hostname),
  KEY idx_domains_project (project_id),
  CONSTRAINT fk_domains_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
