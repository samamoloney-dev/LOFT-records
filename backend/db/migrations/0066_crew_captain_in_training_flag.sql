-- Captain in Training assessments (SA 567/568) must only be available for
-- pilots an admin has actually allocated to a Captain upgrade, not offered
-- as an option for every pilot in the roster - see CrewDetail.jsx's
-- CurrencyFolder and CaptainInTrainingPicker.jsx, both now gated on this.
ALTER TABLE crew_members ADD COLUMN captain_in_training BOOLEAN NOT NULL DEFAULT false;
