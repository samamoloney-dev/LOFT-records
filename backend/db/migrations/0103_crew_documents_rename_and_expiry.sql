-- Renamed from "Certificates" to "Documents" per the operator's explicit
-- request - broader than certifications alone (licences, contracts, any
-- scanned paperwork). Also adds an optional, manually-entered expiry date
-- so a document can surface on the Home dashboard's Needs Attention list
-- and get its own tab-level warning, the same way every other due-date in
-- this app already works (see backend/src/routes/crew.js
-- urgentDocumentsFor).
ALTER TABLE crew_certificates RENAME TO crew_documents;
ALTER TABLE crew_documents ADD COLUMN expiry_date DATE;
ALTER INDEX crew_certificates_crew_member_id RENAME TO crew_documents_crew_member_id;
