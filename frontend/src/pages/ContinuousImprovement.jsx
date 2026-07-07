import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

const RANGE_OPTIONS = [
  { key: '12m', label: 'Last 12 months' },
  { key: 'this_year', label: 'This year' },
  { key: 'last_year', label: 'Last year' },
];

const RANK_LABELS = { CAPTAIN: 'Captain', FIRST_OFFICER: 'FO', UNSPECIFIED: 'Unspecified rank' };

function groupLabel(actype, role) {
  return `${actype} ${RANK_LABELS[role] || role}`;
}

// Plain HTML/CSS horizontal bars rather than SVG - a question's performance
// criteria title sits to the left of its own bar rather than needing to
// wrap underneath a narrow vertical bar, so it stays tidy no matter how
// many questions or fleet/rank groups are being shown at once.
function HorizontalBars({ data }) {
  const maxScore = 5;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map((d) => (
        <div key={d.questionId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 150, flexShrink: 0, fontSize: 12.5, wordBreak: 'break-word' }}>{d.text}</div>
          <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 6, height: 16 }}>
            <div style={{ width: `${Math.max(0, Math.min(100, (d.averageScore / maxScore) * 100))}%`, background: 'var(--text-accent)', height: '100%', borderRadius: 6 }} />
          </div>
          <div style={{ width: 30, flexShrink: 0, fontSize: 12, fontWeight: 600, textAlign: 'right' }}>
            {d.responseCount > 0 ? d.averageScore.toFixed(1) : '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

// HOTC/HOFO only - trend analytics on the Continuous Improvement survey
// filled in after every completed IPC/PC (see CandidateSurvey in
// ProficiencyChecks.jsx). Broken down by fleet and rank (e.g. "Fokker 100
// Captain") since a weak area for one fleet/rank combination can otherwise
// get averaged away by the rest. Last-12-months, this-year and last-year
// views, so year-on-year improvement can be compared. Question bank
// management lives on the Syllabus tab now, alongside the rest of
// course/form editing.
export function ContinuousImprovement() {
  const [range, setRange] = useState('12m');
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/survey/analytics?range=${range}`).then(setData).catch((e) => setError(e.message));
  }
  useEffect(load, [range]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const d of data) {
      const key = `${d.actype}::${d.role}`;
      if (!map.has(key)) map.set(key, { actype: d.actype, role: d.role, surveyCount: d.surveyCount, questions: [] });
      map.get(key).questions.push(d);
    }
    return [...map.values()].sort((a, b) => groupLabel(a.actype, a.role).localeCompare(groupLabel(b.actype, b.role)));
  }, [data]);

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

      {groups.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No submitted surveys in this range yet.</div>
      )}
      {groups.map((g) => {
        const totalResponses = g.questions.reduce((sum, q) => sum + q.responseCount, 0);
        return (
          <div key={`${g.actype}::${g.role}`} className="card">
            <div style={{ fontWeight: 500, marginBottom: 2 }}>{groupLabel(g.actype, g.role)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
              {g.surveyCount} survey{g.surveyCount === 1 ? '' : 's'} completed
            </div>
            {totalResponses === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Surveys submitted, but no performance criteria answered yet.</div>
            ) : (
              <HorizontalBars data={g.questions} />
            )}
          </div>
        );
      })}
    </div>
  );
}
