import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { CONTINUOUS_IMPROVEMENT_ROLES } from '../lib/roles';
import { formatDate } from '../lib/format';

const RANGE_OPTIONS = [
  { key: '12m', label: 'Last 12 months' },
  { key: 'this_year', label: 'This year' },
  { key: 'last_year', label: 'Last year' },
];

const FLEET_OPTIONS = ['Fokker 100', 'Dash 8', 'Metro'];
const RANK_FILTER_OPTIONS = [{ value: 'CAPTAIN', label: 'Captain' }, { value: 'FIRST_OFFICER', label: 'First Officer' }];

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

const STANDALONE_ROLE_OPTIONS = [{ value: 'CAPTAIN', label: 'Captain' }, { value: 'FIRST_OFFICER', label: 'First Officer' }];

// A one-off Continuous Improvement rating with no linked check in this
// system (see backend/src/routes/survey.js's POST /standalone and migration
// 0116) - historical data from a previous tracking tool, or any other
// rating the operator wants on record without running it through a real
// IPC/PC check. Mirrors CandidateSurvey's descriptor-picker in
// ProficiencyChecks.jsx, plus the fleet/rank/date a linked check would
// otherwise supply.
function AddStandaloneEntry({ questions, onAdded }) {
  const [open, setOpen] = useState(false);
  const [fleet, setFleet] = useState(FLEET_OPTIONS[0]);
  const [role, setRole] = useState('CAPTAIN');
  const [date, setDate] = useState('');
  const [scores, setScores] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const allAnswered = questions.length > 0 && questions.every((q) => scores[q.id] !== undefined);

  function reset() {
    setFleet(FLEET_OPTIONS[0]); setRole('CAPTAIN'); setDate(''); setScores({}); setError(null);
  }

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await api.post('/api/survey/standalone', {
        fleet, role, date,
        responses: Object.entries(scores).map(([questionId, score]) => ({ questionId, score })),
      });
      reset();
      setOpen(false);
      onAdded();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} style={{ marginBottom: '1rem' }}>+ Add historical entry</button>;
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ fontWeight: 500, marginBottom: 6 }}>Add historical Continuous Improvement entry</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
        For a rating with no check in this system to attach it to (e.g. imported from a previous tracking tool). Counts toward the trend analytics below the same as a real check's survey does.
      </div>
      <div className="grid2">
        <div className="field" style={{ margin: 0 }}>
          <label>Fleet</label>
          <select value={fleet} onChange={(e) => setFleet(e.target.value)} disabled={busy}>
            {FLEET_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Rank</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} disabled={busy}>
            {STANDALONE_ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={busy} />
      </div>
      {questions.map((q) => (
        <div key={q.id} style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>{q.text}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(q.options || []).map((optionText, i) => {
              const score = i + 1;
              const selected = scores[q.id] === score;
              return (
                <div
                  key={score}
                  onClick={() => !busy && setScores((s) => ({ ...s, [q.id]: score }))}
                  style={{
                    display: 'flex', gap: 10, padding: '8px 10px', borderRadius: 8,
                    border: selected ? '1.5px solid var(--text-accent)' : '0.5px solid var(--border-strong)',
                    background: selected ? 'var(--bg-accent)' : 'var(--surface-1)',
                    cursor: busy ? 'default' : 'pointer',
                    opacity: busy && !selected ? 0.6 : 1,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, flexShrink: 0, color: selected ? 'var(--text-accent)' : 'var(--text-secondary)' }}>{score}</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>{optionText}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {error && <div className="error-text">{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="primary" onClick={save} disabled={busy || !date || !allAnswered}>{busy ? 'Saving…' : 'Save entry'}</button>
        <button onClick={() => { reset(); setOpen(false); }} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

// Review/remove entries added via AddStandaloneEntry above (a check-linked
// survey is reviewed from its own check instead, not here).
function StandaloneEntriesList({ refreshKey, onChanged }) {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get('/api/survey/standalone').then(setEntries).catch((e) => setError(e.message));
  }, [open, refreshKey]);

  async function remove(id) {
    setError(null);
    try {
      await api.delete(`/api/survey/${id}`);
      setEntries((es) => es.filter((e) => e.id !== id));
      // The trend analytics below reads from a separate endpoint - without
      // this, a deleted entry stayed in those averages until the page was
      // reloaded or a filter changed, even though this list already
      // correctly dropped it.
      onChanged();
    } catch (err) { setError(err.message); }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} style={{ marginBottom: '1rem', marginLeft: 8 }}>Manage historical entries</button>;
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 500 }}>Historical entries ({entries.length})</div>
        <button onClick={() => setOpen(false)}>Close</button>
      </div>
      {error && <div className="error-text">{error}</div>}
      {entries.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No historical entries on file.</div>}
      {entries.map((e) => (
        <div key={e.id} className="row">
          <div style={{ flex: 1, fontSize: 13 }}>{e.fleet} {STANDALONE_ROLE_OPTIONS.find((r) => r.value === e.role)?.label || e.role} · {formatDate(e.submittedAt)}</div>
          <button className="danger" onClick={() => { if (window.confirm('Remove this historical entry? This cannot be undone.')) remove(e.id); }}>Delete</button>
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
// presets, or an explicit custom date range, so year-on-year improvement
// can be compared or a specific period pulled out. Question bank
// management lives on the Syllabus tab now, alongside the rest of
// course/form editing.
export function ContinuousImprovement() {
  const { user } = useAuth();
  const isAdmin = CONTINUOUS_IMPROVEMENT_ROLES.includes(user.role);
  const [range, setRange] = useState('12m');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [fleet, setFleet] = useState('');
  const [rank, setRank] = useState('');
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [standaloneRefresh, setStandaloneRefresh] = useState(0);

  const usingCustomRange = !!(customStart || customEnd);

  function load() {
    const params = new URLSearchParams();
    if (usingCustomRange) {
      if (customStart) params.set('start', customStart);
      if (customEnd) params.set('end', customEnd);
    } else {
      params.set('range', range);
    }
    if (fleet) params.set('fleet', fleet);
    if (rank) params.set('rank', rank);
    api.get(`/api/survey/analytics?${params.toString()}`).then(setData).catch((e) => setError(e.message));
  }
  useEffect(load, [range, customStart, customEnd, fleet, rank, standaloneRefresh]);
  useEffect(() => { if (isAdmin) api.get('/api/survey/questions').then(setQuestions).catch(() => {}); }, [isAdmin]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const d of data) {
      const key = `${d.actype}::${d.role}`;
      if (!map.has(key)) map.set(key, { actype: d.actype, role: d.role, surveyCount: d.surveyCount, questions: [] });
      map.get(key).questions.push(d);
    }
    return [...map.values()].sort((a, b) => groupLabel(a.actype, a.role).localeCompare(groupLabel(b.actype, b.role)));
  }, [data]);

  function selectPreset(key) {
    setRange(key);
    setCustomStart('');
    setCustomEnd('');
  }

  function exportToExcel() {
    const rows = [];
    for (const g of groups) {
      for (const q of g.questions) {
        rows.push({
          Fleet: g.actype,
          Rank: RANK_LABELS[g.role] || g.role,
          'Surveys completed': g.surveyCount,
          Question: q.text,
          'Average score': q.responseCount > 0 ? Number(q.averageScore.toFixed(2)) : '',
          Responses: q.responseCount,
        });
      }
    }
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Continuous Improvement');
    const rangeLabel = usingCustomRange ? `${customStart || 'start'}_to_${customEnd || 'now'}` : range;
    const filterLabel = [fleet, rank].filter(Boolean).join('-').replace(/\s+/g, '_');
    XLSX.writeFile(workbook, `continuous-improvement-${rangeLabel}${filterLabel ? `-${filterLabel}` : ''}.xlsx`);
  }

  return (
    <div>
      {isAdmin && (
        <div>
          <AddStandaloneEntry questions={questions} onAdded={() => setStandaloneRefresh((n) => n + 1)} />
          <StandaloneEntriesList refreshKey={standaloneRefresh} onChanged={() => setStandaloneRefresh((n) => n + 1)} />
        </div>
      )}
      <div className="card">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {RANGE_OPTIONS.map((r) => (
            <div
              key={r.key}
              onClick={() => selectPreset(r.key)}
              style={{
                padding: '6px 12px', border: '0.5px solid var(--border-strong)', borderRadius: 8,
                cursor: 'pointer', fontSize: 13,
                background: !usingCustomRange && range === r.key ? 'var(--bg-accent)' : 'var(--surface-2)',
                color: !usingCustomRange && range === r.key ? 'var(--text-accent)' : 'inherit',
              }}
            >{r.label}</div>
          ))}
        </div>
        <div className="grid2">
          <div className="field" style={{ margin: 0 }}>
            <label>Or a custom date range — from</label>
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>To</label>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </div>
        </div>
        <div className="grid2" style={{ marginTop: 10 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Fleet</label>
            <select value={fleet} onChange={(e) => setFleet(e.target.value)}>
              <option value="">All fleets</option>
              {FLEET_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Rank</label>
            <select value={rank} onChange={(e) => setRank(e.target.value)}>
              <option value="">All ranks</option>
              {RANK_FILTER_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        </div>
        <button style={{ marginTop: 10 }} onClick={exportToExcel} disabled={groups.length === 0}>Export to Excel</button>
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
