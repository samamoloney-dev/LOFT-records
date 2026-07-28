-- Backfill Landing Assessment as exempt/complete for Mathew Joubert's
-- Captain upgrade trainee record (an existing Dash 8 First Officer
-- upgrading to Captain on the Dash 8) - he's already demonstrated landing
-- competency as an FO on this exact fleet. His trainee record was created
-- before the automatic backfill in trainees.js POST / existed (see that
-- route for the same logic now applied automatically to new same-fleet
-- Captain upgrades).
INSERT INTO landing_assessment_forms (trainee_id, exempt, hotc_hofo_signature, completed_at)
SELECT t.id, true, 'Not required - already completed as First Officer on this fleet', now()
FROM trainees t
WHERE t.archived = false
  AND t.first_name ILIKE 'Mathew' AND t.last_name ILIKE 'Joubert'
  AND t.fleet IN ('DASH_8', 'FOKKER_100')
ON CONFLICT (trainee_id) DO NOTHING;
