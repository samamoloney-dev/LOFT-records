-- New staff role: Ground Instructor - a dedicated ground-school teaching
-- role, distinct from Cabin Attendant Trainer/Checker. Together with Cabin
-- Attendant Checker/Manager, admins/Examiner, and anyone individually
-- ticked for Emergency Procedures checkAccess, this defines who must hold
-- (and can conduct) the Ground Instructor Competency Check - see
-- backend/src/middleware/roles.js isGroundInstructorCheckEligible.
-- Own migration/transaction since a freshly-added enum value can't be used
-- in the same transaction that added it (same reasoning as CA_MANAGER in 0070).
ALTER TYPE user_role ADD VALUE 'GROUND_INSTRUCTOR';
