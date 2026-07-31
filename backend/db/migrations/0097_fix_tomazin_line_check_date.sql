-- Fix Nikita Tomazin's Cabin Attendant Line Check completion date. Per the
-- operator's report: the check was conducted 28/7/2026 but the form wasn't
-- signed off until 31/7/2026 - the bug this session fixed (CaChecks.jsx's
-- setResult stamping completed_at with the signing moment instead of the
-- form's own "date conducted" field) had recorded the later date, which
-- would push her next Line Check due date out incorrectly. Narrowly scoped
-- to the exact record this affected (matched by name and the wrong date
-- currently on file) so it can't touch any other check.
UPDATE checks c
SET details = jsonb_set(c.details, '{date}', '"2026-07-28"'),
    completed_at = '2026-07-28T00:00:00Z'
FROM crew_members cm
WHERE c.crew_member_id = cm.id
  AND c.check_type = 'CABIN_ATTENDANT_LINE_CHECK'
  AND cm.type = 'CABIN_ATTENDANT'
  AND cm.first_name ILIKE '%nik%'
  AND cm.last_name ILIKE '%tomazin%'
  AND c.completed_at IS NOT NULL
  AND c.completed_at::date = '2026-07-31';
