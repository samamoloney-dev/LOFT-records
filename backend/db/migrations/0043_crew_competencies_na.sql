-- Some competencies (First Aid, CPR Training) don't apply to every crew
-- member - e.g. First Aid is Metro-only per its Ground School
-- counterpart. Rather than a generic flag on every competency, this is
-- scoped in the application layer to just those two names (see
-- CrewDetail.jsx CompetencyList), mirroring the existing First Aid N/A
-- toggle already used on Ground School sign-off.
ALTER TABLE crew_competencies ADD COLUMN na BOOLEAN NOT NULL DEFAULT false;
