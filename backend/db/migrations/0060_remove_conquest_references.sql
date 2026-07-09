-- Skippers no longer operates Conquest/C441 aircraft - strips any lingering
-- mention from data already inserted by earlier migrations/seeds (0058's
-- Metro First Aid note, and the Dash 8 seed's equivalent note if it was
-- ever run against this database).
UPDATE ground_school_items
SET notes = REPLACE(REPLACE(notes, ' & Conquest', ''), 'Metro/Conquest', 'Metro')
WHERE notes ILIKE '%conquest%';
