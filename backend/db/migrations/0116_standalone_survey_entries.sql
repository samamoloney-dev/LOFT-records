-- A Continuous Improvement submission has always been tied to one specific
-- completed IPC/PC check in this system - but historical data imported from
-- a previous tracking tool has no such check to attach to (just a date,
-- fleet/rank, and per-question scores). Allow a "standalone" entry: check_id
-- becomes optional, and fleet/role are stored directly on the survey itself
-- for that case (see backend/src/routes/survey.js's POST /standalone).
-- Multiple NULL check_id rows are fine under the existing UNIQUE constraint -
-- Postgres treats NULLs as distinct from each other there.
ALTER TABLE check_surveys ALTER COLUMN check_id DROP NOT NULL;
ALTER TABLE check_surveys ADD COLUMN fleet TEXT;
ALTER TABLE check_surveys ADD COLUMN role TEXT;
ALTER TABLE check_surveys ADD CONSTRAINT check_surveys_source_present
  CHECK (check_id IS NOT NULL OR (fleet IS NOT NULL AND role IS NOT NULL));
