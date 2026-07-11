-- New staff role: Cabin Attendant Manager - views/edits all Cabin Attendant
-- training records, checking forms, training forms and syllabuses, and is
-- additionally authorised (unconditionally, see checks.js canAccessCheckType)
-- to train and check Emergency Procedures for all pilots and cabin crew.
-- Own migration/transaction since a freshly-added enum value can't be used
-- in the same transaction that added it (same reasoning as ALTERNATE in 0056).
ALTER TYPE user_role ADD VALUE 'CA_MANAGER';
