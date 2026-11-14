-- Two more aircraft types for the CASA Part 135 demonstration operator
-- (Cessna Citation 550 and Beechcraft King Air B200).
--
-- This only ADDS values to the Postgres fleet enum - nothing existing is
-- altered, rewritten or removed, so it is safe on a database that already
-- holds data. A deployment whose operator profile does not list these fleets
-- (see backend/src/lib/profile.js) never offers them anywhere.
ALTER TYPE fleet ADD VALUE IF NOT EXISTS 'CITATION_550';
ALTER TYPE fleet ADD VALUE IF NOT EXISTS 'KING_AIR_B200';
