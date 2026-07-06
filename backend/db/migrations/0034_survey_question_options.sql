-- Each survey question is a performance criteria (e.g. "Technique") rated
-- against 5 detailed behavioural descriptors rather than a bare 1-5 scale -
-- the assessor picks the descriptor that matches, and its position (1-5)
-- is what's stored as the score in check_survey_responses. options is an
-- ordered JSONB array of exactly 5 strings.
ALTER TABLE survey_questions ADD COLUMN options JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Seed the first real question as given by the operator.
INSERT INTO survey_questions (text, options, sort_order) VALUES (
  'Technique',
  '["Manipulative skills resulted in frequent or sustained deviations outside allowable tolerances. Automatic system use led to aircraft exceeding tolerances. Frequent mistakes and/or frequent missed calls in monitoring", "Aircraft manipulated to limit of tolerances or slightly exceeded tolerance, immediately corrected. Inappropriate use of automated systems, though tolerances maintained. Some mistakes in/or lapses in monitoring", "Manipulated with some deviation from target parameters, though quickly recovered. Appropriate use of automated systems with few errors Isolated lapses or mistakes in monitoring", "Manipulated accurately, with only occasional variation from target parameters, quickly corrected. Correct and appropriate use of automatic systems Appropriate and timely monitoring", "Manipulated accurately, with no deviations from target parameters. Totally appropriate use of automated systems at all times. Monitoring was carried out with timely calls even in a challenging situation"]'::jsonb,
  0
);
