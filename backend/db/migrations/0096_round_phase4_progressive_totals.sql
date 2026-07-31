-- The Phase 4 progressive-total carry-over (see Phase4Form.jsx) originally
-- summed flight hours in JS without rounding, so anyone who already had it
-- auto-filled got a long floating-point tail saved (e.g. 16.499999999999996
-- instead of 16.5) - reported live for trainee Mathew Joubert. The form
-- itself now rounds to 1 decimal place before saving; this is a one-off
-- cleanup of whatever's already stored.
UPDATE phase4_assessments
SET sector_details = jsonb_set(
  sector_details, '{sectors12,progressiveTotal}',
  to_jsonb(round((sector_details #>> '{sectors12,progressiveTotal}')::numeric, 1))
)
WHERE sector_details #>> '{sectors12,progressiveTotal}' ~ '^-?[0-9]+\.?[0-9]*$';

UPDATE phase4_assessments
SET sector_details = jsonb_set(
  sector_details, '{sectors34,progressiveTotal}',
  to_jsonb(round((sector_details #>> '{sectors34,progressiveTotal}')::numeric, 1))
)
WHERE sector_details #>> '{sectors34,progressiveTotal}' ~ '^-?[0-9]+\.?[0-9]*$';
