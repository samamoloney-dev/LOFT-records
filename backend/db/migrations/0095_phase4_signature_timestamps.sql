-- Phase 4's Training Captain/Applicant sign-off is moving from plain typed
-- signatures to PinSignature (see frontend/src/components/PinSignature.jsx,
-- already used by Check to Line/Clearance/etc.) - it returns a timestamp
-- alongside the signer's name, which phase4_assessments had nowhere to
-- store until now.
ALTER TABLE phase4_assessments ADD COLUMN training_captain_signature_at TIMESTAMPTZ;
ALTER TABLE phase4_assessments ADD COLUMN applicant_signature_at TIMESTAMPTZ;
