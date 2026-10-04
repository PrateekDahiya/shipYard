-- Phase 03: rollback linkage. New deployments created by rollback reference
-- the source deployment; history rows are never mutated.

ALTER TABLE deployments ADD COLUMN rollback_of BIGINT UNSIGNED NULL AFTER trigger_type;
