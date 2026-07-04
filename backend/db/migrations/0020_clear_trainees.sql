-- Follow-up clear-out: trainees were still showing up after the previous
-- wipe (likely added again while trying the app out before this deploy
-- landed). Cascades to flights, check_to_line_forms, syllabus_progress,
-- flight_syllabus_progress, ground_school_progress, phase4_assessment via
-- existing ON DELETE CASCADE foreign keys - same as the 0019 wipe.
DELETE FROM trainees;
