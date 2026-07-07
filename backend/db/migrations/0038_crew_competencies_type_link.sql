-- Links each crew_competencies row to the catalog above instead of a free-
-- text name, so a crew member's Expiry tab can show one row per active
-- competency type (LEFT JOIN from competency_types) whether or not
-- they've had any dates entered yet - no dropdown/"add" step needed since
-- every active type is required for everyone.
ALTER TABLE crew_competencies ADD COLUMN competency_type_id UUID REFERENCES competency_types(id) ON DELETE CASCADE;

-- Best-effort backfill for any rows already added via the old free-text/
-- dropdown flow before this migration - matches on the exact name.
UPDATE crew_competencies cc
SET competency_type_id = ct.id
FROM competency_types ct
WHERE cc.competency_type_id IS NULL AND lower(cc.name) = lower(ct.name);

ALTER TABLE crew_competencies ALTER COLUMN name DROP NOT NULL;
ALTER TABLE crew_competencies ADD CONSTRAINT crew_competencies_member_type_unique UNIQUE (crew_member_id, competency_type_id);
