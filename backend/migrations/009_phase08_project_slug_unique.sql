-- Phase 08: global live-hostname slug per project. Live hostnames
-- (<slug>.<base-domain>, one Traefik) are a GLOBAL namespace, while project
-- names are only unique per owner — without this, "My API" vs "my-api" (or
-- two owners' "my-api") claim the same hostname. The API also validates
-- slugs in code (project_hostname_taken, 409); this constraint closes the
-- concurrent-create race. Apply with `npm run db:migrate`.

ALTER TABLE projects ADD COLUMN slug VARCHAR(48) NULL AFTER name;

-- Backfill with the same rules as slugify() in backend/src/runtime/router.js:
-- LOWER first (avoids collation-dependent case matching), then non [a-z0-9-]
-- runs become single dashes, trim edge dashes, 48 chars.
UPDATE projects SET slug = LEFT(TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(name), '[^a-z0-9]+', '-')), 48) WHERE slug IS NULL;

-- Names that slug to empty stay NULL (multiple NULLs are allowed by the
-- unique index below); the API rejects such names going forward.
UPDATE projects SET slug = NULL WHERE slug = '';

ALTER TABLE projects ADD UNIQUE KEY uq_projects_slug (slug);
