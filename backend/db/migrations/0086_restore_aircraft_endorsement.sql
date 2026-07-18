-- Restore the "Aircraft Endorsement" Ground School item removed in
-- migration 0085 - per the operator's follow-up, this should be tracked in
-- the pilot's own Ground School tab (alongside the rest of their pre-LOFT
-- checklist), not via a separate Trainees-list button. That button
-- (trainees.ready_for_loft_at, see migration 0085) stays in use, but for
-- cabin attendants only now - they have no Ground School tab to hang this
-- off, so the explicit button remains their trigger for the Clearance Form
-- alert.
INSERT INTO ground_school_items (fleet, category, description, required, syllabus_id)
SELECT f, 'Aircraft Endorsement',
       'Aircraft type endorsement completed (simulator training and endorsement conducted by a third-party provider) - required before LOFT can commence',
       true, NULL
FROM unnest(ARRAY['DASH_8', 'FOKKER_100', 'METRO_23']::fleet[]) AS f
WHERE NOT EXISTS (
  SELECT 1 FROM ground_school_items gsi
  WHERE gsi.fleet = f AND gsi.syllabus_id IS NULL AND gsi.category = 'Aircraft Endorsement'
);

-- Backfilled as already-complete for any pilot trainee already confirmed
-- via the (now pilot-unused) ready_for_loft_at button in the meantime, or
-- otherwise already fully done with every other required ground school
-- item - same "don't retroactively block anyone already mid-training"
-- reasoning as migration 0084's original backfill.
INSERT INTO ground_school_progress (trainee_id, ground_school_item_id, completed_at, signed_off_by_name)
SELECT t.id, gsi.id, COALESCE(t.ready_for_loft_at, now()), 'Backfilled - trainee already in training before this item was tracked'
FROM trainees t
JOIN ground_school_items gsi
  ON gsi.fleet = t.fleet AND gsi.syllabus_id IS NOT DISTINCT FROM t.syllabus_id AND gsi.category = 'Aircraft Endorsement'
WHERE t.type = 'PILOT' AND t.archived = false
  AND (
    t.ready_for_loft_at IS NOT NULL
    OR NOT EXISTS (
      SELECT 1 FROM ground_school_items gsi2
      LEFT JOIN ground_school_progress gsp2 ON gsp2.ground_school_item_id = gsi2.id AND gsp2.trainee_id = t.id
      WHERE gsi2.fleet = t.fleet AND gsi2.syllabus_id IS NOT DISTINCT FROM t.syllabus_id AND gsi2.required = true
        AND gsi2.category != 'Aircraft Endorsement'
        AND gsp2.completed_at IS NULL AND COALESCE((gsp2.details->>'na')::boolean, false) = false
    )
  )
ON CONFLICT (trainee_id, ground_school_item_id) DO NOTHING;
