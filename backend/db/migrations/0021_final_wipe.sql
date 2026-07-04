-- The previous wipe attempts (0019, 0020) kept getting undone because the
-- Render start command ran "npm run seed" after every migrate step (and on
-- every free-tier cold start), which unconditionally re-inserts the demo
-- trainees (Jamie Carter, Morgan Lee, Priya Nair) and demo staff logins
-- (hotc@loft.example etc.) - see backend/db/seed.js. The start command has
-- now been changed (render.yaml) to drop the seed step, so this wipe will
-- actually stick this time.
TRUNCATE checks, audit_log;

DELETE FROM trainees;
DELETE FROM crew_members;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'sam.moloney@skippers.com.au') THEN
    RAISE EXCEPTION 'Wipe aborted: no user found with email sam.moloney@skippers.com.au - refusing to delete all users';
  END IF;
END $$;

DELETE FROM users WHERE email <> 'sam.moloney@skippers.com.au';
