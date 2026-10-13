-- Phase 08: public tunnel URL per deployment. Set when a tunnel sidecar
-- comes up for a live build; shown in the UI only for the current live
-- deployment (older rows keep their historic value, same as live_url).

ALTER TABLE deployments ADD COLUMN public_url VARCHAR(1024) NULL AFTER live_url;
