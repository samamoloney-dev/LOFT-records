-- Safety Manager: a staff login with the same access as HOTC/HOFO (see
-- middleware/auth.js effectiveRole, which gives it HOTC's permissions).
ALTER TYPE user_role ADD VALUE 'SAFETY_MANAGER';
