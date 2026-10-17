-- Cabin attendant Line Checks are now tracked per aircraft (planned-check keys
-- lineCheckDash8 / lineCheckFokker100, see crew.js caLineCheckCurrency). Any
-- date already planned against a cabin attendant's single "lineCheck" moves to
-- the Dash 8 one (every cabin attendant starts on Dash 8).
UPDATE crew_planned_checks
SET check_key = 'lineCheckDash8'
WHERE check_key = 'lineCheck'
  AND crew_member_id IN (SELECT id FROM crew_members WHERE type = 'CABIN_ATTENDANT');

-- The recurrent checks are exported under aircraft-specific names (see
-- backend/src/lib/exportNames.js), with codes from the operator's "Competency
-- Names" spreadsheet. The old single-name rows no longer match anything the
-- export writes, so they go; the new ones are loaded where not already present.
DELETE FROM course_codes
WHERE label IN ('Emergency Procedures', 'IPC', 'Proficiency Check', 'Line Check', 'Cabin Attendant Line Check', 'F100 Slide Training');

INSERT INTO course_codes (label, code, sort_order)
SELECT v.label, v.code, (SELECT COALESCE(MAX(sort_order), -1) FROM course_codes) + v.n
FROM (VALUES
  (1,  'Emergency Procedures Theory - Dash 8', 'EPTD8'),
  (2,  'Emergency Procedures Theory - F100', 'EPTF100'),
  (3,  'Emergency Procedures Theory - Metro', 'EPTM23'),
  (4,  'Emergency Procedures Practical - Dash 8', 'EPPD8'),
  (5,  'Emergency Procedures Practical -F100', 'EPPF100'),
  (6,  'Emergency Procedures Practical - Metro', 'EPPM23'),
  (7,  'Line Check - Dash 8', 'LCD8'),
  (8,  'Line Check - F100', 'LCF100'),
  (9,  'Line Check - Metro', 'LCM23'),
  (10, 'Cabin Attendant Dash 8 Line Check', 'CACHK1'),
  (11, 'Cabin Attendant F100 Line Check', 'CACHK2'),
  (12, 'Part 121 Proficency Check Dash 8', 'PCD8'),
  (13, 'Part 121 Proficency Check F100', 'PCF100'),
  (14, 'Part 121 Proficency Check Metro', 'PCM23'),
  (15, 'Part 121 IPC & Proficency Check Dash 8', 'IPCD8'),
  (16, 'Part 121 IPC & Proficency Check F100', 'IPCF100'),
  (17, 'Part 121 IPC & Proficency Check Metro', 'IPCM23'),
  (18, 'Emergency Procedures Practial Slide F100 Check', 'F100SLD')
) AS v(n, label, code)
WHERE NOT EXISTS (SELECT 1 FROM course_codes cc WHERE cc.label = v.label);
