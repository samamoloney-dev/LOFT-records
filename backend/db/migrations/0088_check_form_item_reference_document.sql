-- Lets a check-form item (LOFT Package already had free-text notes; this is
-- a real attached file - an SOP excerpt, diagram, reference page) be viewed
-- inline by whoever's conducting the check, via a small icon next to the
-- item - same interaction pattern as the LOFT Package's "i" note icon, but
-- opening a real document instead of a text popup. Stored as a base64 data
-- URI directly on the row, same approach already used for crew licence
-- photos (see crew_members.licence_photo) - no separate file storage in
-- this app.
ALTER TABLE check_form_items ADD COLUMN reference_document TEXT;
ALTER TABLE check_form_items ADD COLUMN reference_document_name TEXT;
