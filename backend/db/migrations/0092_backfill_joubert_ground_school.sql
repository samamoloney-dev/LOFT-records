-- Backfill Ground School as already-complete for Mathew Joubert's Captain
-- upgrade trainee record (an existing Dash 8 First Officer upgrading to
-- Captain on the Dash 8) - his trainee record was created before the
-- automatic backfill in trainees.js POST / existed (see that route for the
-- same logic now applied automatically to new same-fleet Captain upgrades).
INSERT INTO ground_school_progress (trainee_id, ground_school_item_id, completed_at, signed_off_by_name)
SELECT t.id, gsi.id, now(), 'Not required - already completed as First Officer on this fleet'
FROM trainees t
JOIN ground_school_items gsi ON gsi.fleet = t.fleet AND gsi.syllabus_id IS NOT DISTINCT FROM t.syllabus_id
WHERE t.archived = false
  AND t.first_name ILIKE 'Mathew' AND t.last_name ILIKE 'Joubert'
ON CONFLICT (trainee_id, ground_school_item_id) DO NOTHING;
