-- A once-off "Check to Line" check form, shared by pilots and cabin crew
-- (see checks.js/CrewDetail.jsx CurrencyFolder) - a lightweight alternative
-- to filling out the full recurrent Line Check form for a new crew member
-- who's only been checked to line in the past ~11 months and has no
-- recurrent Line Check due yet, per the operator's explicit request.
-- Completing it sets crew_members.line_check_anchor_date (pilots) or
-- seed_line_check_date (cabin crew) to match, same effect as the manual
-- date field in CrewInfoEditor, but as a proper auditable check record.
ALTER TYPE check_type ADD VALUE 'CHECK_TO_LINE';
