-- Initial Take-Off & Landing Assessment (SA_575) - a one-time record for
-- Fokker 100 and Dash 8 pilot trainees, tracked independently of Check to
-- Line (not a gate on it - HOTC/HOFO/Flight Ops Admin can view it but only
-- Check Captain/Examiner can fill it in and sign the release).
--
-- observation_sectors holds up to 4 entries: {date, route, wind, rwy, temp,
-- turb, comments}. demonstration_sectors holds up to 3 entries: {takeOff,
-- land, date, comments, fsPilotSign}. Mirrors check_to_line_forms' shape
-- (one row per trainee, JSONB for the free-form sector grids, snapshot
-- assigned_to fields so they survive the assignee's account being deleted).
CREATE TABLE landing_assessment_forms (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id             UUID NOT NULL UNIQUE REFERENCES trainees(id) ON DELETE CASCADE,
  observation_sectors    JSONB NOT NULL DEFAULT '[]',
  demonstration_sectors  JSONB NOT NULL DEFAULT '[]',
  release_signature      TEXT,
  release_date           DATE,
  exempt                 BOOLEAN NOT NULL DEFAULT false,
  fsm_signature          TEXT,
  assigned_to            UUID REFERENCES users(id),
  assigned_to_name       TEXT,
  assigned_to_arn        TEXT,
  assigned_to_role       TEXT,
  completed_at           TIMESTAMPTZ,
  archived               BOOLEAN NOT NULL DEFAULT false,
  archived_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
