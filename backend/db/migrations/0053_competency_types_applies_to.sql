-- Most competency types apply to every crew member regardless of type -
-- NULL keeps that default behaviour. Medical is pilot-only, so this lets it
-- (and any future type that needs the same restriction) be scoped without
-- hardcoding a name check in the query - see crew.js activeCompetencies()
-- and GET /:id/competencies.
ALTER TABLE competency_types ADD COLUMN applies_to trainee_type;
UPDATE competency_types SET applies_to = 'PILOT' WHERE name = 'Medical';
