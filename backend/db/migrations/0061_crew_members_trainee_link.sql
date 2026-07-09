-- Links a "new hire" crew profile back to its trainee LOFT record (see
-- crew.js POST / newHire handling), so currency (withCurrency) can tell
-- whether they've actually finished ground school yet before flagging
-- them overdue on EP/IPC/PC/Line Check.
ALTER TABLE crew_members ADD COLUMN trainee_id UUID REFERENCES trainees(id) ON DELETE SET NULL;
