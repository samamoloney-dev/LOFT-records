-- Tracks whether the training course/material for a planned competency has
-- already been sent to the candidate, so a HOTC/HOFO/Flight Ops Admin
-- planning ahead doesn't need to remember that separately.
ALTER TABLE crew_competencies ADD COLUMN course_sent BOOLEAN NOT NULL DEFAULT false;
