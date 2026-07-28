-- Correction to migration 0090: the CASR 121 course-completion checklists
-- (Initial Training and Conversion Training) are Ground School, not LOFT
-- Package/Syllabus items, per the operator's explicit correction - same as
-- how pilots already track their own course-completion checklist on the
-- Ground School tab, not the Syllabus tab. Applies to both cabin attendant
-- fleets (Dash 8 and Fokker 100) - this generic regulatory/company course
-- content isn't aircraft-specific, unlike the per-flight Duty checklist.

-- Remove the 6 "CASR 121 Conversion Training" rows 0090 incorrectly added
-- to syllabus_items for CA_FOKKER_100.
DELETE FROM syllabus_items
WHERE fleet = 'CA_FOKKER_100' AND category = 'CASR 121 Conversion Training' AND section = 'SYLLABUS';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ground_school_items WHERE fleet IN ('CA_DASH_8', 'CA_FOKKER_100')) THEN
    INSERT INTO ground_school_items (fleet, category, description, required)
    SELECT f, 'CASR 121 Initial Training', d, true
    FROM unnest(ARRAY['CA_DASH_8', 'CA_FOKKER_100']::fleet[]) AS f
    CROSS JOIN unnest(ARRAY[
      'SMS Training',
      'HF/NTS Training',
      'DAMP Training',
      'Dangerous Goods Awareness',
      'Cabin Attendant Knowledge of Aviation, Regulations Duties and Responsibilities',
      'Effective Communication Training',
      'Fire & Smoke Initial Training',
      'General Survival Training',
      'Water Survival Training',
      'Physiological effects of Flying',
      'First Aid Training - Including CPR',
      'Passenger handling Training',
      'Senior Cabin Attendant Training',
      'English Language Proficiency'
    ]) AS d;

    INSERT INTO ground_school_items (fleet, category, description, required)
    SELECT f, 'CASR 121 Conversion Training', d, true
    FROM unnest(ARRAY['CA_DASH_8', 'CA_FOKKER_100']::fleet[]) AS f
    CROSS JOIN unnest(ARRAY[
      'Crew Incapacitation Training',
      'Doors & Exits',
      'Evacuation Slides',
      'Cabin Attendant Fire and Smoke Training',
      'Cabin Attendant Aircraft Systems Training',
      'Cabin Normal and Emergency Procedures Training'
    ]) AS d;
  END IF;
END $$;
