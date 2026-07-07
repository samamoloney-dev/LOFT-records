-- Personal PIN for e-signatures on check forms (see routes/signatures.js) -
-- bcrypt-hashed the same way as users.password_hash. Nullable: no PIN has
-- been set until the person's first signature.
ALTER TABLE users ADD COLUMN pin_hash TEXT;
ALTER TABLE crew_members ADD COLUMN pin_hash TEXT;
ALTER TABLE trainees ADD COLUMN pin_hash TEXT;
