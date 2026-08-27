-- Lets the crew member's current medical certificate PDF be stored
-- directly on their profile (Medical tab), same single-slot pattern as
-- licence_photo (0054) - replaced, not accumulated. The superseded copy
-- is archived into crew_documents when a new one is uploaded (see crew.js
-- POST /:id/medical-document) instead of being silently overwritten, per
-- the operator's explicit request that it stay findable under this crew
-- member's name in the searchable document archive.
ALTER TABLE crew_members ADD COLUMN medical_document TEXT;
ALTER TABLE crew_members ADD COLUMN medical_document_file_name TEXT;
