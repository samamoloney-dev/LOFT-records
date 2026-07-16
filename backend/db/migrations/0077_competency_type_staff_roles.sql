-- Lets a Pilots-only competency be scoped further, to only pilots who are
-- also linked to a staff account holding one of a specific set of roles
-- (Examiner, Check Captain, Training Captain) - e.g. a competency that
-- only Examiners need, rather than every pilot crew member. NULL (the
-- default) keeps today's behaviour of applying to every pilot regardless
-- of any staff role. See crew.js activeCompetencies/GET /:id/competencies
-- for how this is joined against crew_members.user_id -> users.role.
ALTER TABLE competency_types ADD COLUMN staff_roles user_role[];
