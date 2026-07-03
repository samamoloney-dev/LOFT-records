-- Flights get an assessor/candidate signature attestation, matching the
-- pattern already used on check_to_line_forms and checks.
ALTER TABLE flights ADD COLUMN assessor_signature TEXT;
ALTER TABLE flights ADD COLUMN candidate_signature TEXT;
