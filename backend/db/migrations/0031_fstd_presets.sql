-- Lets HOTC/HOFO/Flight Ops Admin record the real FSTD number/type per
-- aircraft type once, so the IPC/PC check form can offer a one-click
-- "Autofill FSTD" instead of retyping the same simulator details on every
-- check. Deliberately not hardcoded in application code - these are real
-- operational facts (which simulator, its registration/type) that only the
-- operator knows and that can change over time.
CREATE TABLE fstd_presets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_type TEXT NOT NULL UNIQUE,
  fstd_number  TEXT,
  fstd_type    TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
