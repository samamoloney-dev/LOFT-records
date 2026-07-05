-- New staff role for people who only conduct PC/IPC (simulator sessions) -
-- no access to Emergency Procedures, Line Checks, or Check to Line. Its own
-- migration/transaction since a freshly-added enum value can't be used in
-- the same transaction that added it (same reasoning as PILOT_LINE_CHECK
-- in 0018).
ALTER TYPE user_role ADD VALUE 'SIMULATOR_ONLY';
