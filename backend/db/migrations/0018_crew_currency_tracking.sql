-- Introduces "Crew" as a concept distinct from trainees: a trainee is
-- someone going through initial qualification (phases/syllabus/Check to
-- Line), while a crew member is already qualified and flying the line, and
-- needs their recurrent checks (EP, IPC, PC, Line Check) tracked against a
-- rolling/anchored anniversary rather than a training phase. Kept as its own
-- table rather than folded into trainees because completing a Check to Line
-- currently auto-archives the trainee record (see ctl.js /complete) - mixing
-- that lifecycle with an ongoing currency clock would be confusing.
--
-- Recurring checks still live in the existing checks table (it already has
-- everything needed - result, score, details, archiving) - they just gain an
-- optional link to a crew member so a due date can be computed. This must be
-- its own statement/transaction boundary from anything that uses the new
-- enum value, since Postgres forbids using a freshly-added enum value in the
-- same transaction that added it (the migration runner wraps this whole file
-- in one transaction - see db/migrate.js).
ALTER TYPE check_type ADD VALUE 'PILOT_LINE_CHECK';

CREATE TABLE crew_members (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name             TEXT NOT NULL,
  last_name              TEXT NOT NULL,
  type                   trainee_type NOT NULL,
  role                   trainee_role NOT NULL,
  fleet                  fleet NOT NULL,
  -- Pilots only. Their recurring Line Check is due 365 days after this date,
  -- then every 365 days after that - a fixed anniversary that does not shift
  -- even if a check is completed early or late (see currency.js).
  line_check_anchor_date DATE,
  archived               BOOLEAN NOT NULL DEFAULT false,
  archived_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crew_members_type ON crew_members(type);
CREATE INDEX idx_crew_members_archived ON crew_members(archived);

ALTER TABLE checks ADD COLUMN crew_member_id UUID REFERENCES crew_members(id) ON DELETE SET NULL;
ALTER TABLE checks ADD COLUMN crew_member_name TEXT;
CREATE INDEX idx_checks_crew_member_id ON checks(crew_member_id);
