-- Manual "rostered" confirmation for a planned IPC/PC (IPC/PC Spacing tab,
-- Planning). A planned date with an examiner assigned is still just a plan
-- until the operator has actually confirmed it's on the roster - a
-- deliberate manual step, distinct from Currency Overview's own "Rostered"
-- filter (which is derived from planned_date/issued, not a stored flag).
ALTER TABLE crew_planned_checks ADD COLUMN rostered BOOLEAN NOT NULL DEFAULT false;
