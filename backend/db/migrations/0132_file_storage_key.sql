-- Uploaded documents can now live in S3 (see lib/fileStore.js): the database
-- keeps the name, who uploaded it and an S3 key, and file_data is left empty.
-- Existing rows keep their file_data until they are copied across, so nothing
-- is lost and the app works the same whether or not S3 is switched on.
ALTER TABLE crew_documents ADD COLUMN storage_key TEXT;
ALTER TABLE crew_documents ALTER COLUMN file_data DROP NOT NULL;
ALTER TABLE staff_documents ADD COLUMN storage_key TEXT;
ALTER TABLE staff_documents ALTER COLUMN file_data DROP NOT NULL;
