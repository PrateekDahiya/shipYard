ALTER TABLE projects
  ADD COLUMN use_dockerfile TINYINT(1) NOT NULL DEFAULT 1 AFTER output_dir;
