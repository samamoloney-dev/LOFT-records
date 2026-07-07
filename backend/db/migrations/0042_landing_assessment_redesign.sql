-- Landing Assessment form redesign, per the operator's updated SA_575
-- document: the release sign-off is now paired with an HOTC/HOFO signature
-- (rather than "FSM/FOM Signature"), and a general Comments/Observations
-- field was added. observation_sectors/demonstration_sectors stay JSONB
-- (no schema change needed for their new shape - date+route only for
-- observation; date/takeOff/land/airport/rwy/wind/competent, 6 rather than
-- 3, for demonstration - see LandingAssessmentForm.jsx), since they were
-- already free-form per-entry objects.
ALTER TABLE landing_assessment_forms RENAME COLUMN fsm_signature TO hotc_hofo_signature;
ALTER TABLE landing_assessment_forms ADD COLUMN comments TEXT;
