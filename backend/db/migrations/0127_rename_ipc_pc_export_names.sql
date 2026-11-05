-- The IPC and Proficiency Check export names (and the Dash 8 IPC code) changed
-- in the rostering system. Renamed in place so any code the operator has
-- already edited on Edit Forms > Competencies is replaced by the new one.
UPDATE course_codes SET label = 'Part 121 Proficiency Check - D8',   code = 'PCD8'    WHERE label = 'Part 121 Proficency Check Dash 8';
UPDATE course_codes SET label = 'Part 121 Proficiency Check - F100', code = 'PCF100'  WHERE label = 'Part 121 Proficency Check F100';
UPDATE course_codes SET label = 'Part 121 Proficiency Check - M23',  code = 'PCM23'   WHERE label = 'Part 121 Proficency Check Metro';
UPDATE course_codes SET label = 'Part 61 IPC and 121 Proficiency Check - DHC8', code = 'IPCDHC8' WHERE label = 'Part 121 IPC & Proficency Check Dash 8';
UPDATE course_codes SET label = 'Part 61 IPC and 121 Proficiency Check - F100', code = 'IPCF100' WHERE label = 'Part 121 IPC & Proficency Check F100';
UPDATE course_codes SET label = 'Part 61 IPC and 121 Proficiency Check - M23',  code = 'IPCM23'  WHERE label = 'Part 121 IPC & Proficency Check Metro';
