-- One-off backfill for the new auto-archive-on-supersede behaviour (see
-- checks.js PATCH /:id): archives every already-completed, non-archived
-- check for a crew member except the most recently completed one per
-- check type (and, for RECURRENT_SIMULATOR, per PC/IPC variant too) - the
-- same rule that now applies going forward, applied once to existing data.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY crew_member_id, check_type, COALESCE(details->>'variant', '')
           ORDER BY completed_at DESC NULLS LAST, created_at DESC
         ) AS rn
  FROM checks
  WHERE crew_member_id IS NOT NULL AND archived = false AND result IS NOT NULL
)
UPDATE checks SET archived = true, archived_at = now()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
