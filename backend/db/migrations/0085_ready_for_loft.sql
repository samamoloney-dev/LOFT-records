-- Retire the "Aircraft Endorsement" Ground School item added in migration
-- 0084 - superseded by an explicit HOTC/HOFO/Flight Ops Admin-only
-- confirmation button on the Trainees list instead (see ready_for_loft_at
-- below), per the operator's explicit follow-up request. A general Ground
-- School checklist item anyone with trainee access could tick was the
-- wrong shape for this - it needs to be a deliberate admin action, and
-- (for cabin attendants) there's no Ground School item concept to hang it
-- off in the first place.
DELETE FROM ground_school_items WHERE category = 'Aircraft Endorsement' AND syllabus_id IS NULL;

-- "Type Rating Complete" (pilots) / "Ground School Complete" (cabin
-- attendants) - both the same real-world milestone (ready to commence
-- LOFT) and both the trigger for that trainee type's first Clearance Form
-- alert (see dashboard.js clearanceAlerts). One column suffices since a
-- trainee is always exactly one type.
ALTER TABLE trainees ADD COLUMN ready_for_loft_at TIMESTAMPTZ;
ALTER TABLE trainees ADD COLUMN ready_for_loft_by_name TEXT;

-- Backfilled as already-confirmed for every active trainee who's
-- necessarily already past this milestone in real life - a pilot whose
-- required ground school items were already 100% complete before this
-- button existed, or a cabin attendant who's already logged at least one
-- LOFT flight. Anyone earlier than that (a brand new trainee) is left
-- unconfirmed, correctly requiring the button going forward. This is only
-- about not missing/mistiming a Clearance Form alert, not a hard gate on
-- anything else, so under- rather than over-backfilling is the safe side.
UPDATE trainees t SET
  ready_for_loft_at = now(),
  ready_for_loft_by_name = 'Backfilled - already in training before this was tracked'
WHERE t.archived = false
  AND (
    (t.type = 'PILOT' AND NOT EXISTS (
      SELECT 1 FROM ground_school_items gsi
      LEFT JOIN ground_school_progress gsp ON gsp.ground_school_item_id = gsi.id AND gsp.trainee_id = t.id
      WHERE gsi.fleet = t.fleet AND gsi.syllabus_id IS NOT DISTINCT FROM t.syllabus_id AND gsi.required = true
        AND gsp.completed_at IS NULL AND COALESCE((gsp.details->>'na')::boolean, false) = false
    ))
    OR (t.type = 'CABIN_ATTENDANT' AND EXISTS (SELECT 1 FROM flights f WHERE f.trainee_id = t.id))
  );
