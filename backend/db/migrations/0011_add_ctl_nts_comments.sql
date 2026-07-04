-- The real Check to Line Assessment forms (SA_504 Dash 8, SA_512 Metro 23,
-- SA_813 Fokker 100) include a Non Technical Skill Assessment section and a
-- free-text Comments box, in addition to the sector log and per-item
-- checklist already covered by sector_details/assessment_items.
ALTER TABLE check_to_line_forms ADD COLUMN nts_scores JSONB NOT NULL DEFAULT '{}';
ALTER TABLE check_to_line_forms ADD COLUMN comments TEXT;
