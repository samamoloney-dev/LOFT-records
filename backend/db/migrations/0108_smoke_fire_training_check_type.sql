-- New check form grouped with Emergency Procedures under the crew profile's
-- new "Emergency Procedures & Safety Equipment" tab (see CrewDetail.jsx) -
-- renews every 3 years per the operator's explicit rule (see crew.js
-- safetyEquipmentCurrency).
ALTER TYPE check_type ADD VALUE 'SMOKE_FIRE_TRAINING';
