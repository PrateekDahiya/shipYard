-- Track reachability through the public tunnel separately from container health.
ALTER TABLE application_instances
  ADD COLUMN public_health_state ENUM('UNKNOWN', 'UP', 'DOWN') NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN public_health_checked_at TIMESTAMP NULL,
  ADD COLUMN public_health_latency_ms INT NULL;
