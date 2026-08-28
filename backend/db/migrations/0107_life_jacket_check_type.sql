-- New check form grouped with Emergency Procedures under the crew profile's
-- new "Emergency Procedures & Safety Equipment" tab (see CrewDetail.jsx) -
-- a once-off check per the operator's explicit rule (never required again
-- once passed - see crew.js safetyEquipmentCurrency's 100-year rolling
-- window standing in for "no expiry").
ALTER TYPE check_type ADD VALUE 'LIFE_JACKET';
