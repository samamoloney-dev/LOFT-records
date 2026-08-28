-- New check form grouped with Emergency Procedures under the crew profile's
-- new "Emergency Procedures & Safety Equipment" tab (see CrewDetail.jsx) -
-- Fokker 100 specific, renews every 3 years (assumed - operator didn't give
-- an exact interval, matched to Smoke & Fire Training's cycle; see crew.js
-- safetyEquipmentCurrency).
ALTER TYPE check_type ADD VALUE 'F100_SLIDE_TRAINING';
