-- Some crew members are also staff accounts (e.g. a Training Captain who
-- is themselves subject to recurrent EP/IPC/PC/Line Check currency). This
-- links a crew profile to an existing staff account so an amendment on the
-- Staff page (name, fleets) is reflected on the crew profile automatically
-- instead of having to be re-entered in both places - see
-- backend/src/routes/crew.js serializeCrewMember.
ALTER TABLE crew_members ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE crew_members ADD CONSTRAINT crew_members_user_id_unique UNIQUE (user_id);
