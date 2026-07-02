-- Core schema for LOFT Records, per docs/project-brief.md Section 3.

CREATE TYPE user_role AS ENUM (
  'HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER',
  'TRAINING_CAPTAIN', 'CA_TRAINER', 'CA_CHECKER', 'CC', 'TRAINEE'
);

CREATE TYPE fleet_access AS ENUM ('DASH_8', 'FOKKER_100', 'METRO_23', 'ALL');

CREATE TYPE fleet AS ENUM ('DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100');

CREATE TYPE trainee_type AS ENUM ('PILOT', 'CABIN_ATTENDANT');

CREATE TYPE trainee_role AS ENUM ('CAPTAIN', 'FIRST_OFFICER', 'CABIN_ATTENDANT');

CREATE TYPE role_scope AS ENUM ('CAPTAIN_ONLY', 'FO_ONLY', 'BOTH');

CREATE TYPE check_type AS ENUM ('RECURRENT_SIMULATOR', 'EMERGENCY_PROCEDURES', 'CABIN_ATTENDANT_LINE_CHECK');

CREATE TYPE applies_to AS ENUM ('PILOT', 'CABIN_ATTENDANT');

CREATE TYPE outcome AS ENUM ('PASS', 'FAIL');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL,
  fleet_access  fleet_access NOT NULL DEFAULT 'ALL',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trainees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID UNIQUE REFERENCES users(id),
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  type        trainee_type NOT NULL,
  role        trainee_role NOT NULL,
  fleet       fleet NOT NULL,
  phase       INTEGER NOT NULL DEFAULT 1,
  archived    BOOLEAN NOT NULL DEFAULT false,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE syllabus_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet       fleet NOT NULL,
  role_scope  role_scope NOT NULL,
  phase       INTEGER NOT NULL,
  description TEXT NOT NULL,
  required    BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE syllabus_progress (
  trainee_id       UUID NOT NULL REFERENCES trainees(id) ON DELETE CASCADE,
  syllabus_item_id UUID NOT NULL REFERENCES syllabus_items(id) ON DELETE CASCADE,
  completed_at     TIMESTAMPTZ,
  signed_off_by    UUID REFERENCES users(id),
  PRIMARY KEY (trainee_id, syllabus_item_id)
);

CREATE TABLE flights (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id              UUID NOT NULL REFERENCES trainees(id) ON DELETE CASCADE,
  training_captain_id     UUID NOT NULL REFERENCES users(id),
  date                    DATE NOT NULL,
  sector_details          JSONB NOT NULL DEFAULT '{}',
  loft_performance_rating TEXT,
  debrief_comments        TEXT,
  locked                  BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by_trainee BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at         TIMESTAMPTZ,
  hours                   NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE check_to_line_forms (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id          UUID NOT NULL UNIQUE REFERENCES trainees(id) ON DELETE CASCADE,
  fleet               fleet NOT NULL,
  sector_details      JSONB NOT NULL DEFAULT '{}',
  assessment_items    JSONB NOT NULL DEFAULT '{}',
  approaches          JSONB NOT NULL DEFAULT '[]',
  overall_result      outcome,
  overall_score       INTEGER CHECK (overall_score BETWEEN 1 AND 5),
  assessor_signature  TEXT,
  candidate_signature TEXT,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE checks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id      UUID REFERENCES trainees(id) ON DELETE CASCADE,
  check_type      check_type NOT NULL,
  fleet           fleet,
  applies_to      applies_to NOT NULL,
  due_date        DATE,
  completed_at    TIMESTAMPTZ,
  result          outcome,
  score           INTEGER CHECK (score BETWEEN 1 AND 5),
  details         JSONB NOT NULL DEFAULT '{}',
  assessor_name   TEXT,
  completed_by    UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id),
  action       TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id    UUID,
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trainees_archived ON trainees(archived);
CREATE INDEX idx_flights_trainee_id ON flights(trainee_id);
CREATE INDEX idx_flights_training_captain_id ON flights(training_captain_id);
CREATE INDEX idx_checks_trainee_id ON checks(trainee_id);
CREATE INDEX idx_checks_check_type ON checks(check_type);
CREATE INDEX idx_audit_log_target ON audit_log(target_table, target_id);
