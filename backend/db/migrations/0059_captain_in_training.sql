-- Captain in Training assessments (SA 567 Preliminary, SA 568 Final) -
-- assigned ad hoc when a First Officer upgrades to Captain, not part of
-- the recurring currency system. Shares one checkType with a
-- details.variant ('PRELIMINARY'/'FINAL'), same pattern as
-- RECURRENT_SIMULATOR's PC/IPC_PC variants. Own migration/transaction
-- since a freshly-added enum value can't be used in the same transaction
-- that added it (same reasoning as PILOT_LINE_CHECK in 0018).
ALTER TYPE check_type ADD VALUE 'CAPTAIN_IN_TRAINING';
