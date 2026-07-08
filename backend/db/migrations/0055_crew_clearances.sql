CREATE TABLE crew_clearances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_member_id UUID NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  signed_by_name TEXT,
  signed_by_user_id UUID REFERENCES users(id),
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX crew_clearances_crew_member_id_idx ON crew_clearances(crew_member_id);
