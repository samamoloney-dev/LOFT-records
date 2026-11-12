-- Pilot Ground School > Courses: the check forms and competencies a pilot needs
-- before flying. Dangerous Goods, Emergency Procedures, the Wet Drill, HF/NTS and
-- Maintenance Authority were already there; this adds Part 61 IPC, Part 121 IPC
-- and the 3 Yearly Fire and Smoke for the three pilot fleets.
INSERT INTO ground_school_items (fleet, category, description, notes, required)
SELECT f, 'Course', v.description, v.notes, true
FROM unnest(ARRAY['DASH_8', 'FOKKER_100', 'METRO_23']::fleet[]) AS f
CROSS JOIN (VALUES
  ('Part 61 IPC', 'Enter the date completed.'),
  ('Part 121 IPC', 'Enter the date completed.'),
  ('3 Yearly Fire and Smoke', 'Enter the date completed. It sets their Smoke & Fire Training expiry on their crew profile.')
) AS v(description, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM ground_school_items g
  WHERE g.fleet = f AND g.category = 'Course' AND g.description = v.description AND g.syllabus_id IS NULL
);

-- The Fire and Smoke course and the existing Wet Drill course feed the crew
-- member's Smoke & Fire / Life Jacket expiry the same way the F100 Slide
-- Training course does (see crew.js groundSchoolDates).
UPDATE ground_school_items SET currency_key = 'SMOKE_FIRE_TRAINING'
WHERE category = 'Course' AND description = '3 Yearly Fire and Smoke' AND currency_key IS NULL
  AND fleet IN ('DASH_8', 'FOKKER_100', 'METRO_23') AND syllabus_id IS NULL;
UPDATE ground_school_items SET currency_key = 'LIFE_JACKET'
WHERE category = 'Course' AND description = 'Emergency Procedures - Wet Drill' AND currency_key IS NULL
  AND fleet IN ('DASH_8', 'FOKKER_100', 'METRO_23') AND syllabus_id IS NULL;

-- Trainees already in training must not be blocked by courses added after they
-- started, so the three new ones are marked as not required for them.
INSERT INTO ground_school_progress (trainee_id, ground_school_item_id, completed_at, signed_off_by_name)
SELECT t.id, gsi.id, now(), 'Not required - course added after training began'
FROM trainees t
JOIN ground_school_items gsi ON gsi.fleet = t.fleet AND gsi.syllabus_id IS NOT DISTINCT FROM t.syllabus_id
WHERE t.archived = false AND t.type = 'PILOT'
  AND gsi.category = 'Course' AND gsi.description IN ('Part 61 IPC', 'Part 121 IPC', '3 Yearly Fire and Smoke')
ON CONFLICT (trainee_id, ground_school_item_id) DO NOTHING;
