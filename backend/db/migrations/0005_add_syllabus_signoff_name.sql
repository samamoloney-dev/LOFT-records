-- Ticking off a syllabus/discussion item should record who actually signed
-- it off by name (as typed at the time), not just infer it from whichever
-- account happened to be logged in - matches the signature convention used
-- everywhere else (flights, CTL, checks).
ALTER TABLE syllabus_progress ADD COLUMN signed_off_by_name TEXT;
