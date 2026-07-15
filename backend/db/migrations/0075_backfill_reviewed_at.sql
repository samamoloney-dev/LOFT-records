-- 0074 added reviewed_at with no default, so every check/CTL completed
-- before this feature existed would otherwise show up as "needing review"
-- the moment it ships - back-date them all as already reviewed (using
-- their own completed_at) so the alert only ever reflects checks
-- completed from here on.
UPDATE checks SET reviewed_at = completed_at WHERE completed_at IS NOT NULL AND reviewed_at IS NULL;
UPDATE check_to_line_forms SET reviewed_at = completed_at WHERE completed_at IS NOT NULL AND reviewed_at IS NULL;
