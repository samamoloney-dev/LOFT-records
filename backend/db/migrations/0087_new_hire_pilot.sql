-- Flags a pilot crew member as a new hire straight out of LOFT, set either
-- when their crew profile is auto-created alongside their trainee record
-- (see trainees.js POST / newHire handling) or toggled later from the crew
-- profile. Used by crew.js withCurrency to hold off flagging Proficiency
-- Check/Refresher Training overdue until 6 months after their Check to Line
-- (line_check_anchor_date) - per the operator's explicit request, a genuine
-- new hire hasn't had the chance to sit a recurrent PC yet and shouldn't be
-- flagged as if they've lapsed one.
ALTER TABLE crew_members ADD COLUMN new_hire_pilot BOOLEAN NOT NULL DEFAULT false;
