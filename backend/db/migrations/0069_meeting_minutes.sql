-- Flight Standards meeting minutes, published quarterly instead of emailed
-- out. Only one record is ever "current" (status = PUBLISHED) at a time -
-- publishing a new one archives whatever was previously current (see
-- meeting-minutes.js POST /:id/publish). Section columns are fixed to the
-- operator's own standing agenda rather than a flexible jsonb blob, since
-- the subheadings themselves don't change meeting to meeting.
CREATE TYPE meeting_minutes_status AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE meeting_minutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avsafe_number TEXT,
  meeting_date DATE,
  attendance_register TEXT,
  apologies TEXT,
  acceptance_of_previous_minutes TEXT,
  personnel TEXT,
  current_workload TEXT,
  checking_training_outcomes TEXT,
  incidents_occurrences TEXT,
  flight_standards_manual TEXT,
  administration TEXT,
  next_meeting TEXT,
  status meeting_minutes_status NOT NULL DEFAULT 'DRAFT',
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforced in application code (only one PUBLISHED at a time), but a
-- partial unique index makes that guarantee hold even against a race
-- between two admins publishing at once.
CREATE UNIQUE INDEX one_current_meeting_minutes ON meeting_minutes ((status = 'PUBLISHED')) WHERE status = 'PUBLISHED';

CREATE TABLE meeting_minutes_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_minutes_id UUID NOT NULL REFERENCES meeting_minutes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meeting_minutes_id, user_id)
);
