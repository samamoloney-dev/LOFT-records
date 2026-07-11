-- One-off data fix: 0070/trainees.js's removal of `phase` from the generic
-- trainee PATCH endpoint closes the hole that let a trainee's phase be set
-- directly, bypassing the phase-completions sign-off flow - but it doesn't
-- retroactively correct records that already got there that way. Any pilot
-- trainee sitting past phase 1 with zero actually-completed phase sign-offs
-- got there through that now-closed hole, not through the real workflow, so
-- reset them back to phase 1 - the true starting point per their own
-- recorded history.
UPDATE trainees
SET phase = 1
WHERE type = 'PILOT'
  AND archived = false
  AND phase > 1
  AND NOT EXISTS (
    SELECT 1 FROM phase_completions pc
    WHERE pc.trainee_id = trainees.id AND pc.completed_at IS NOT NULL
  );
