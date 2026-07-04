-- Individual check/flight/CTL records can now be archived by HOTC/HOFO/
-- Flight Ops Admin once complete, independent of the trainee-level archive
-- (which only happens automatically when a Check to Line is finished).

ALTER TABLE checks ADD COLUMN archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE checks ADD COLUMN archived_at TIMESTAMPTZ;

ALTER TABLE flights ADD COLUMN archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE flights ADD COLUMN archived_at TIMESTAMPTZ;

ALTER TABLE check_to_line_forms ADD COLUMN archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE check_to_line_forms ADD COLUMN archived_at TIMESTAMPTZ;

CREATE INDEX idx_checks_archived ON checks(archived);
CREATE INDEX idx_flights_archived ON flights(archived);
