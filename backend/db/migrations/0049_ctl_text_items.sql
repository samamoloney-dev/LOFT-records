-- On the pilot Check to Line form, "System discussed 1/2/3" (Aircraft System
-- Knowledge) and "Emergency procedure 1/2/3 assessed" (Emergency Procedures)
-- need to be free-text so the check pilot can type which system/emergency
-- procedure was actually covered, rather than just ticking Satisfactory/
-- Unsatisfactory/N-A like the rest of the form.
UPDATE check_form_items
SET kind = 'text'
WHERE form_key = 'CHECK_TO_LINE'
  AND description IN (
    'System discussed 1', 'System discussed 2', 'System discussed 3',
    'Emergency procedure 1 assessed', 'Emergency procedure 2 assessed', 'Emergency procedure 3 assessed'
  );
