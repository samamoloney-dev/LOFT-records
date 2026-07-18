-- The real gate before a pilot trainee can commence LOFT is their aircraft
-- type endorsement - ground theory is done in-house, then the trainee is
-- sent to a third-party provider for simulator training and the type
-- endorsement itself, and only once THAT is complete can LOFT start. This
-- was previously (wrongly) assumed to be "ground school complete" - see
-- dashboard.js's clearanceAlerts. Modelled as one more required Ground
-- School item (reusing the existing tick/name/date sign-off UI and the
-- existing hasIncompleteGroundSchool gate) rather than a whole new
-- mechanism, since "100% of required ground school items done" already
-- means exactly the right thing once this item is included in that set.
INSERT INTO ground_school_items (fleet, category, description, required, syllabus_id)
SELECT f, 'Aircraft Endorsement',
       'Aircraft type endorsement completed (simulator training and endorsement conducted by a third-party provider) - required before LOFT can commence',
       true, NULL
FROM unnest(ARRAY['DASH_8', 'FOKKER_100', 'METRO_23']::fleet[]) AS f
WHERE NOT EXISTS (
  SELECT 1 FROM ground_school_items gsi
  WHERE gsi.fleet = f AND gsi.syllabus_id IS NULL AND gsi.category = 'Aircraft Endorsement'
);

-- Backfilled as already-complete for every trainee who exists today - they
-- necessarily already got their real-world endorsement to have gotten this
-- far, so this must not retroactively block anyone already mid-training.
-- Only trainees created from now on are actually gated on signing this off
-- for real. Scoped to the standard syllabus (syllabus_id IS NULL) since
-- that's the only syllabus this item was just added to above - a trainee
-- on a named/custom syllabus is unaffected until an admin adds this item
-- to that syllabus too.
INSERT INTO ground_school_progress (trainee_id, ground_school_item_id, completed_at, signed_off_by_name)
SELECT t.id, gsi.id, now(), 'Backfilled - trainee already in training before this item was tracked'
FROM trainees t
JOIN ground_school_items gsi
  ON gsi.fleet = t.fleet AND gsi.syllabus_id IS NOT DISTINCT FROM t.syllabus_id AND gsi.category = 'Aircraft Endorsement'
WHERE t.type = 'PILOT'
ON CONFLICT (trainee_id, ground_school_item_id) DO NOTHING;
