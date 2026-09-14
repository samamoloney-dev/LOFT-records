-- SA 538 Flight Standards Pilot Recurrent Training Form - a proper check
-- form for the existing "Flight Standards Pilot Recurrent Training"
-- competency_type (already tracked as a bare completed/due date for pilots
-- who are also EXAMINER/CC/TRAINING_CAPTAIN staff - see that competency's
-- staff_roles). No Pass/Fail on the paper form itself - just each criteria
-- ticked Completed, comments, and two signatures (see checks.js's handling
-- of this checkType for the "mark complete" flow that isn't PASS/FAIL
-- gated the way every other check form is).
ALTER TYPE check_type ADD VALUE 'FLIGHT_STANDARDS_RECURRENT_TRAINING';
