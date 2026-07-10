-- The Ground Instructor Competency Check form used to capture the
-- assessor's name as free text (assessor_name), with no linked identity to
-- hang a PIN e-signature off. Adding assessor_id lets the redesigned form
-- (assessor picked from a dropdown, carried through to every field that
-- needs their name/signature) use PinSignature the same way EP/IPC/Line
-- Check/Check to Line already do - see PersonnelCompetencyCheckForm.jsx
-- for the equivalent pattern on the new SA_518 check.
ALTER TABLE instructor_competency_checks ADD COLUMN assessor_id UUID REFERENCES users(id);
