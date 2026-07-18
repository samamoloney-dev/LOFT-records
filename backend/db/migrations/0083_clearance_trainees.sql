-- Ground-school-complete and checked-to-line clearance stages both happen
-- while someone is still just a trainee, before the separate manual
-- "promote to crew" step creates their crew_members row - so a clearance
-- entry now attaches to either a trainee or a crew member, never both.
-- Ownership transfers to the new crew_members row at promotion time (see
-- trainees.js /:id/promote-to-crew), so a crew profile's clearance history
-- still shows the pre-crew stages once someone's promoted.
ALTER TABLE crew_clearances ALTER COLUMN crew_member_id DROP NOT NULL;
ALTER TABLE crew_clearances ADD COLUMN trainee_id UUID REFERENCES trainees(id) ON DELETE CASCADE;
ALTER TABLE crew_clearances ADD CONSTRAINT crew_clearances_one_subject_chk
  CHECK ((crew_member_id IS NOT NULL)::int + (trainee_id IS NOT NULL)::int = 1);

CREATE INDEX crew_clearances_trainee_id_idx ON crew_clearances(trainee_id);
