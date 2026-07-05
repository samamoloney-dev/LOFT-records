-- Cabin attendants start qualified on Dash 8 and can later add Fokker 100
-- after a conversion course, so a single fleet value is no longer enough -
-- mirrors the users.fleets migration (0024). Pilots keep a single fleet in
-- practice, just stored as a 1-element array for a uniform data model.
-- The ordering rule (Fokker 100 only once Dash 8 is held, for cabin
-- attendants) is enforced in application code (backend/src/routes/crew.js),
-- not the database, since it depends on crew type.

ALTER TABLE crew_members ADD COLUMN fleets fleet[] NOT NULL DEFAULT '{}';
UPDATE crew_members SET fleets = ARRAY[fleet];
ALTER TABLE crew_members DROP COLUMN fleet;
