const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { requireRole, CONTINUOUS_IMPROVEMENT_ROLES, SURVEY_FILL_ROLES } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();

router.use(requireAuth);

// Anyone who can see a check can see the question bank (needed to render
// the survey form) - only HOTC/HOFO can manage it or see archived ones.
router.get('/questions', async (req, res) => {
  const includeArchived = req.query.includeArchived === 'true';
  if (includeArchived && !CONTINUOUS_IMPROVEMENT_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { rows } = await pool.query(
    `SELECT * FROM survey_questions ${includeArchived ? '' : 'WHERE archived = false'} ORDER BY sort_order ASC, created_at ASC`,
  );
  res.json(rows.map(rowToCamel));
});

// Each question is a performance criteria (e.g. "Technique") rated against
// exactly 5 behavioural descriptors, ordered worst (1) to best (5) - the
// assessor picks the descriptor that matches, not a bare number.
const optionsSchema = z.array(z.string().min(1)).length(5);
const questionSchema = z.object({ text: z.string().min(1), options: optionsSchema });

router.post('/questions', requireRole(...CONTINUOUS_IMPROVEMENT_ROLES), async (req, res) => {
  const parsed = questionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { rows: maxRows } = await pool.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM survey_questions');
  const { rows } = await pool.query(
    'INSERT INTO survey_questions (text, options, sort_order) VALUES ($1, $2, $3) RETURNING *',
    [parsed.data.text, JSON.stringify(parsed.data.options), maxRows[0].next],
  );
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'survey_questions', targetId: rows[0].id });
  res.status(201).json(rowToCamel(rows[0]));
});

const questionUpdateSchema = z.object({
  text: z.string().min(1).optional(),
  options: optionsSchema.optional(),
  sortOrder: z.number().int().optional(),
  archived: z.boolean().optional(),
});
const QUESTION_COLUMN_MAP = { text: 'text', options: 'options', sortOrder: 'sort_order', archived: 'archived' };
const QUESTION_CAST_MAP = { options: '::jsonb' };

router.patch('/questions/:id', requireRole(...CONTINUOUS_IMPROVEMENT_ROLES), async (req, res) => {
  const parsed = questionUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const entries = Object.entries(parsed.data);
  if (entries.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const setClauses = entries.map(([key], i) => `${QUESTION_COLUMN_MAP[key]} = $${i + 1}${QUESTION_CAST_MAP[key] || ''}`);
  const values = entries.map(([key, value]) => (key === 'options' ? JSON.stringify(value) : value));
  values.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE survey_questions SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'survey_questions', targetId: rows[0].id });
  res.json(rowToCamel(rows[0]));
});

async function findCheck(checkId) {
  const { rows } = await pool.query('SELECT * FROM checks WHERE id = $1', [checkId]);
  return rows[0] ? rowToCamel(rows[0]) : null;
}

async function findSurveyWithResponses(checkId) {
  const { rows: surveyRows } = await pool.query('SELECT * FROM check_surveys WHERE check_id = $1', [checkId]);
  if (surveyRows.length === 0) return null;
  const survey = rowToCamel(surveyRows[0]);
  const { rows: responseRows } = await pool.query(
    'SELECT question_id, score FROM check_survey_responses WHERE check_survey_id = $1',
    [survey.id],
  );
  survey.responses = Object.fromEntries(responseRows.map((r) => [r.question_id, r.score]));
  return survey;
}

function assertSurveyable(req, res, check) {
  if (!check) { res.status(404).json({ error: 'Check not found' }); return false; }
  if (check.checkType !== 'RECURRENT_SIMULATOR') { res.status(400).json({ error: 'Only IPC/PC checks have a Continuous Improvement survey' }); return false; }
  if (!SURVEY_FILL_ROLES.includes(req.user.role)) { res.status(403).json({ error: 'Forbidden' }); return false; }
  return true;
}

router.get('/check/:checkId', async (req, res) => {
  const check = await findCheck(req.params.checkId);
  if (!assertSurveyable(req, res, check)) return;
  const survey = await findSurveyWithResponses(check.id);
  res.json({ survey });
});

const saveSchema = z.object({
  responses: z.array(z.object({ questionId: z.string().uuid(), score: z.number().int().min(1).max(5) })),
});

router.put('/check/:checkId', async (req, res) => {
  const check = await findCheck(req.params.checkId);
  if (!assertSurveyable(req, res, check)) return;
  if (!check.completedAt) return res.status(400).json({ error: 'The check must be completed before its survey can be filled in' });

  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await findSurveyWithResponses(check.id);
  if (existing?.submittedAt) return res.status(400).json({ error: 'This survey has already been submitted' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let surveyId = existing?.id;
    if (!surveyId) {
      const { rows } = await client.query('INSERT INTO check_surveys (check_id) VALUES ($1) RETURNING id', [check.id]);
      surveyId = rows[0].id;
    }
    for (const { questionId, score } of parsed.data.responses) {
      await client.query(
        `INSERT INTO check_survey_responses (check_survey_id, question_id, score) VALUES ($1, $2, $3)
         ON CONFLICT (check_survey_id, question_id) DO UPDATE SET score = $3`,
        [surveyId, questionId, score],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'check_surveys', targetId: check.id });
  res.json({ survey: await findSurveyWithResponses(check.id) });
});

router.post('/check/:checkId/submit', async (req, res) => {
  const check = await findCheck(req.params.checkId);
  if (!assertSurveyable(req, res, check)) return;

  const survey = await findSurveyWithResponses(check.id);
  if (!survey) return res.status(400).json({ error: 'No survey responses recorded yet' });
  if (survey.submittedAt) return res.status(400).json({ error: 'Already submitted' });

  const { rows: activeQuestions } = await pool.query('SELECT id FROM survey_questions WHERE archived = false');
  const unanswered = activeQuestions.filter((q) => survey.responses[q.id] === undefined);
  if (unanswered.length > 0) {
    return res.status(400).json({ error: 'Every question must be scored before the survey can be submitted' });
  }

  const { rows } = await pool.query(
    'UPDATE check_surveys SET submitted_at = now() WHERE id = $1 RETURNING *',
    [survey.id],
  );
  await logAction({ userId: req.user.id, action: 'SUBMIT', targetTable: 'check_surveys', targetId: rows[0].id });
  res.json({ survey: await findSurveyWithResponses(check.id) });
});

// HOTC/HOFO only - average score per active question, over either all
// submitted surveys ever or just the last 12 months, so trends in weak
// areas can be spotted (see frontend/src/pages/ContinuousImprovement.jsx).
// Broken down by the candidate's fleet and rank (snapshotted on the check
// itself as details.actype/details.role at the time it was created - see
// ProficiencyChecks.jsx) so e.g. "Fokker 100 Captain" and "Dash 8 FO" trend
// separately rather than being averaged together.
router.get('/analytics', requireRole(...CONTINUOUS_IMPROVEMENT_ROLES), async (req, res) => {
  const range = req.query.range === '12m' ? '12m' : 'all';
  const dateClause = range === '12m' ? "AND cs.submitted_at >= now() - interval '12 months'" : '';

  // The date filter has to narrow which surveys count *before* joining to
  // responses - putting it on a plain LEFT JOIN's ON clause would only null
  // out the survey columns for out-of-range rows without excluding their
  // scores from the aggregate.
  const { rows } = await pool.query(
    `WITH in_range_surveys AS (
       SELECT cs.id,
              COALESCE(NULLIF(c.details->>'actype', ''), 'Unspecified fleet') AS actype,
              COALESCE(NULLIF(c.details->>'role', ''), 'UNSPECIFIED') AS role
       FROM check_surveys cs
       JOIN checks c ON c.id = cs.check_id
       WHERE cs.submitted_at IS NOT NULL ${dateClause}
     )
     SELECT irs.actype, irs.role, q.id AS question_id, q.text, q.sort_order,
            COALESCE(AVG(r.score), 0) AS average_score,
            COUNT(r.score)::int AS response_count
     FROM in_range_surveys irs
     CROSS JOIN survey_questions q
     LEFT JOIN check_survey_responses r
       ON r.question_id = q.id AND r.check_survey_id = irs.id
     WHERE q.archived = false
     GROUP BY irs.actype, irs.role, q.id, q.text, q.sort_order
     ORDER BY irs.actype ASC, irs.role ASC, q.sort_order ASC, q.created_at ASC`,
  );
  res.json(rows.map((r) => ({
    actype: r.actype,
    role: r.role,
    questionId: r.question_id,
    text: r.text,
    averageScore: Number(r.average_score),
    responseCount: r.response_count,
  })));
});

module.exports = router;
