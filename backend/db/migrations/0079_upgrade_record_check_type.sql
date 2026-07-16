-- Upgrade Records (SA 507 Training Captain, SA 510 Check Captain, SA 522
-- Training Cabin Attendant, SA 523 Check Cabin Attendant) - one shared check
-- type with a details.variant, same pattern as CAPTAIN_IN_TRAINING's
-- PRELIMINARY/FINAL. Own migration file/transaction - Postgres forbids using
-- a freshly-added enum value in the same transaction that added it (see
-- db/migrate.js, and 0018/0073's own separate-migration precedent).
ALTER TYPE check_type ADD VALUE 'UPGRADE_RECORD';
