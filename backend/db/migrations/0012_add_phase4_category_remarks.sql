-- Phase 4 remarks apply at the subject/category level (e.g. Preflight),
-- not per individual item.
ALTER TABLE phase4_assessments ADD COLUMN category_remarks JSONB NOT NULL DEFAULT '{}';
