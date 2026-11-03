-- Anyone transferring onto the Fokker 100 (pilot or cabin attendant) must do the
-- 3-yearly F100 slide training. It's added to the Ground School tab for both
-- Fokker 100 fleets, as a "Course" (which already has a Completed date field).
-- currency_key marks it as feeding the crew member's F100 Slide Training
-- expiry (see crew.js f100SlideGroundSchoolDate): once its date is entered,
-- the Expiration tab shows it, 3 years on. The marker stays on the row even if
-- the wording of the item is later edited on the Edit Forms page.
ALTER TABLE ground_school_items ADD COLUMN currency_key TEXT;

INSERT INTO ground_school_items (fleet, category, description, notes, required, currency_key)
SELECT f, 'Course', 'F100 Slide Training (3 yearly)',
       'Enter the date completed. It sets their F100 Slide Training expiry on their crew profile.',
       true, 'F100_SLIDE_TRAINING'
FROM unnest(ARRAY['FOKKER_100', 'CA_FOKKER_100']::fleet[]) AS f
WHERE NOT EXISTS (
  SELECT 1 FROM ground_school_items g
  WHERE g.currency_key = 'F100_SLIDE_TRAINING' AND g.fleet = f AND g.syllabus_id IS NULL
);
