-- 0021 ran and was recorded as applied, but the Render service's Start
-- Command (set directly in the dashboard, not synced from render.yaml) was
-- still "npm run migrate && npm run seed && npm start", so seed.js
-- reinserted the demo trainees/staff right after 0021 cleared them. The
-- Start Command has now been fixed in the dashboard to drop the seed step -
-- this repeats the wipe one more time so it actually sticks.
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
