-- users.fleet_access was a single enum that couldn't even express a
-- cabin-attendant fleet (CA_DASH_8/CA_FOKKER_100), so it could never be
-- compared against a cabin-attendant trainee's fleet. Replaced with
-- users.fleets - an array of the same `fleet` enum trainees/crew already
-- use - mirroring the check_access array pattern (0014_check_access.sql).
-- Examiners and Check Captains (CC) can tick more than one fleet; every
-- other role is constrained to a single tick by the application, but still
-- stored as a 1-element array for a uniform data model.

ALTER TABLE users ADD COLUMN fleets fleet[] NOT NULL DEFAULT '{}';

UPDATE users SET fleets = CASE
  WHEN fleet_access = 'ALL' THEN ARRAY['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100']::fleet[]
  ELSE ARRAY[fleet_access::text]::fleet[]
END;

ALTER TABLE users DROP COLUMN fleet_access;
DROP TYPE fleet_access;
