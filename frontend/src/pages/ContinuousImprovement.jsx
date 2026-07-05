import { useEffect, useState } from 'react';
import { api } from '../api/client';

const RANGE_OPTIONS = [
  { key: 'all', label: 'All time (real-time)' },
  { key: '12m', label: 'Last 12 months' },
];

// Hand-rolled rather than pulling in a charting library - one simple bar
// per question is well within plain SVG, and question labels wrap under
// their bar via foreignObject since SVG <text> doesn't wrap on its own.
function BarChart({ data }) {
  const width = 700;
  const height = 320;
  const padding = { top: 20, right: 20, bottom: 90, left: 30 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const barGap = 14;
  const barWidth = data.length > 0 ? Math.max(20, (chartWidth - barGap * (data.length - 1)) / data.length) : 0;
  const maxScore = 5;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const y = padding.top + chartHeight - (n / maxScore) * chartHeight;
        return (
          <g key={n}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />
            <text x={padding.left - 8} y={y + 4} fontSize="10" textAnchor="end" fill="var(--text-secondary)">{n}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const barHeight = (d.averageScore / maxScore) * chartHeight;
        const x = padding.left + i * (barWidth + barGap);
        const y = padding.top + chartHeight - barHeight;
        return (
          <g key={d.questionId}>
            <rect x={x} y={y} width={barWidth} height={Math.max(barHeight, 0)} fill="var(--text-accent)" rx="3" />
            <text x={x + barWidth / 2} y={y - 6} fontSize="11" textAnchor="middle" fontWeight="600" fill="var(--text-primary)">
              {d.responseCount > 0 ? d.averageScore.toFixed(1) : '—'}
            </text>
            <foreignObject x={x - barGap / 2} y={padding.top + chartHeight + 6} width={barWidth + barGap} height={padding.bottom - 6}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.3, wordBreak: 'break-word' }}>
                {d.text}
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}

// HOTC/HOFO manage the question bank here too - archiving keeps historical
// data intact but removes the question from new surveys going forward.
function QuestionManager() {
  const [questions, setQuestions] = useState([]);
  const [newText, setNewText] = useState('');
  const [error, setError] = useState(null);

  function load() {
    api.get('/api/survey/questions?includeArchived=true').then(setQuestions).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function addQuestion(e) {
    e.preventDefault();
    if (!newText.trim()) return;
    setError(null);
    try {
      await api.post('/api/survey/questions', { text: newText.trim() });
      setNewText('');
      load();
    } catch (err) { setError(err.message); }
  }

  async function updateQuestion(id, patch) {
    setError(null);
    try { await api.patch(`/api/survey/questions/${id}`, patch); load(); }
    catch (err) { setError(err.message); }
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 500, marginBottom: 6 }}>Manage survey questions</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
        The assessor rates the candidate 1-5 on each of these once an IPC/PC check is completed. Archiving a question keeps its past data but drops it from new surveys.
      </div>
      <form onSubmit={addQuestion} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input style={{ flex: 1 }} value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Add a question" />
        <button type="submit" className="primary">Add</button>
      </form>
      {error && <div className="error-text">{error}</div>}
      {questions.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No questions yet - add your first one above.</div>}
      {questions.map((q) => (
        <div key={q.id} className="row" style={{ cursor: 'default' }}>
          <input
            style={{ flex: 1, opacity: q.archived ? 0.6 : 1 }}
            defaultValue={q.text}
            disabled={q.archived}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== q.text) updateQuestion(q.id, { text: v }); }}
          />
          <button onClick={() => updateQuestion(q.id, { archived: !q.archived })}>
            {q.archived ? 'Unarchive' : 'Archive'}
          </button>
        </div>
      ))}
    </div>
  );
}

// HOTC/HOFO only - trend analytics on the Continuous Improvement survey
// filled in after every completed IPC/PC (see CandidateSurvey in
// ProficiencyChecks.jsx). Real-time (all-time cumulative) and last-12-
// months views, showing average score per question so weak areas stand out.
export function ContinuousImprovement() {
  const [range, setRange] = useState('all');
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/survey/analytics?range=${range}`).then(setData).catch((e) => setError(e.message));
  }
  useEffect(load, [range]);

  const totalResponses = data.reduce((sum, d) => sum + d.responseCount, 0);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '1rem' }}>
        {RANGE_OPTIONS.map((r) => (
          <div
            key={r.key}
            onClick={() => setRange(r.key)}
            style={{
              padding: '6px 12px', border: '0.5px solid var(--border-strong)', borderRadius: 8,
              cursor: 'pointer', fontSize: 13,
              background: range === r.key ? 'var(--bg-accent)' : 'var(--surface-2)',
              color: range === r.key ? 'var(--text-accent)' : 'inherit',
            }}
          >{r.label}</div>
        ))}
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="card">
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Average score by question</div>
        {data.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No survey questions set up yet - add some below.</div>
        ) : totalResponses === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No submitted surveys in this range yet.</div>
        ) : (
          <BarChart data={data} />
        )}
      </div>

      <QuestionManager />
    </div>
  );
}
