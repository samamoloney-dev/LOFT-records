-- New staff role: same access as HOTC/HOFO everywhere in the app, except
-- it cannot sign the Clearance Form (see crew.js isClearanceSigner). Own
-- migration/transaction since a freshly-added enum value can't be used in
-- the same transaction that added it (same reasoning as SIMULATOR_ONLY in
-- 0027).
ALTER TYPE user_role ADD VALUE 'ALTERNATE';
