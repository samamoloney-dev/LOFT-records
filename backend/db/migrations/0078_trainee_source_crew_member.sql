-- Lets an existing, already-qualified crew member be sent back into LOFT
-- for a new fleet (e.g. a Cabin Attendant converting from Dash 8 to Fokker
-- 100) instead of the trainee form only supporting brand-new hires. Tracks
-- which crew_members row this trainee record represents, so that when they
-- complete Check to Line and are "promoted" back onto the Crew roster (see
-- trainees.js /:id/promote-to-crew), the new fleet is merged into their
-- existing crew record instead of creating a duplicate one.
ALTER TABLE trainees ADD COLUMN source_crew_member_id UUID REFERENCES crew_members(id) ON DELETE SET NULL;
