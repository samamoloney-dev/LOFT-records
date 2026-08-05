import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { formatDate, formatFleet, formatTraineeRole } from '../lib/format';
import { AssignedToPicker } from '../components/AssignedToPicker';

// Maps a crew_planned_checks check_key to the CHECK_ACCESS_TYPES value
// AssignedToPicker/isEligibleForCheck expect (see
// backend/src/middleware/roles.js CHECK_ACCESS_TYPES), so the assignee
// dropdown only offers staff actually eligible for that check type.
const ACCESS_TYPE_FOR_KEY = {
  emergencyProcedures: 'EMERGENCY_PROCEDURES',
  ipc: 'IPC',
  proficiencyCheck: 'PC',
  lineCheck: 'LINE_CHECK',
};

// One central place to see everything coming up across the whole roster -
// planned recurrent checks (with an optional assigned examiner/instructor/
// check pilot), planned competency dates, and freeform planning items not
// tied to a specific crew member or check type. The per-crew-member planned
// date editors on each Crew profile still work exactly as before (see
// crew.js/CrewDetail.jsx) - this just aggregates them so HOTC/HOFO/Flight
// Ops Admin don't have to click through every profile to see what's ahead.
function PlannedChecksSection() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);

  function load() {
    api.get('/api/planning/planned-checks').then(setRows).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function updateDate(row, plannedDate) {
    setError(null);
    try {
      await api.put(`/api/crew/${row.crewMemberId}/planned-checks/${row.checkKey}`, { plannedDate: plannedDate || null });
      load();
    } catch (err) { setError(err.message); }
  }

  async function updateAssignee(row, staffMember) {
    setError(null);
    try {
      await api.put(`/api/crew/${row.crewMemberId}/planned-checks/${row.checkKey}`, {
        plannedDate: row.plannedDate,
        assignedTo: staffMember?.id || null,
      });
      load();
    } catch (err) { setError(err.message); }
  }

  // Once both a planned date and an assigned examiner/instructor/check
  // pilot are in place, this turns the plan into the real (incomplete)
  // check record - the row then disappears since it's no longer just a plan.
  async function createCheck(row) {
    setError(null);
    try {
      await api.post(`/api/crew/${row.crewMemberId}/planned-checks/${row.checkKey}/create-check`);
      load();
    } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
        Planned simulator and line check dates, with an optional assigned examiner/instructor/check pilot -
        edit a date directly on a crew member's own Dates tab, or here.
      </div>
      {error && <div className="error-text">{error}</div>}
      {rows.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Nothing planned yet.</div>}
      {rows.map((r) => (
        <div key={`${r.crewMemberId}::${r.checkKey}`} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 500 }}>{r.crewMemberName}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.fleets.map(formatFleet).join(', ')} · {r.label}</div>
            </div>
          </div>
          <div className="grid2">
            <div className="field" style={{ margin: 0 }}>
              <label>Planned date</label>
              <input type="date" defaultValue={r.plannedDate || ''} onBlur={(e) => updateDate(r, e.target.value)} />
            </div>
            <AssignedToPicker
              value={r.assignedTo}
              accessType={ACCESS_TYPE_FOR_KEY[r.checkKey]}
              fleet={r.fleets?.length === 1 ? r.fleets[0] : undefined}
              onAssign={(s) => updateAssignee(r, s)}
            />
          </div>
          {r.plannedDate && r.assignedTo && (
            <button className="primary" style={{ marginTop: 8 }} onClick={() => createCheck(r)}>Create check form</button>
          )}
        </div>
      ))}
    </div>
  );
}

function PlannedCompetenciesSection() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/api/planning/planned-competencies').then(setRows).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
        Planned competency dates - add or change these from a crew member's own Dates tab.
      </div>
      {error && <div className="error-text">{error}</div>}
      {rows.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Nothing planned yet.</div>}
      {/* Deep-links straight to the Expiration tab, per the operator's
          explicit request - overrides CrewDetail's own default (Clearance
          Form), since a planned competency date is exactly what that tab
          shows. */}
      {rows.map((r, i) => (
        <div key={i} className="card row" onClick={() => navigate(`/crew/${r.crewMemberId}?top=expiry`)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{r.crewMemberName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.fleets.map(formatFleet).join(', ')} · {r.name}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13 }}>Planned for {formatDate(r.plannedDate)}</div>
            {r.courseSent && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Course sent</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

const emptyNote = () => ({ title: '', notes: '', plannedDate: '' });

function OtherPlanningItemsSection() {
  const [notes, setNotes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyNote());
  const [error, setError] = useState(null);

  function load() {
    api.get('/api/planning/notes').then(setNotes).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyNote());
    setShowForm((v) => !v);
  }

  function openEditForm(note) {
    setEditingId(note.id);
    setForm({ title: note.title, notes: note.notes || '', plannedDate: note.plannedDate || '' });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      const payload = { title: form.title, notes: form.notes || null, plannedDate: form.plannedDate || null };
      if (editingId) await api.patch(`/api/planning/notes/${editingId}`, payload);
      else await api.post('/api/planning/notes', payload);
      setShowForm(false);
      setEditingId(null);
      setForm(emptyNote());
      load();
    } catch (err) { setError(err.message); }
  }

  async function remove(id) {
    setError(null);
    try { await api.delete(`/api/planning/notes/${id}`); load(); }
    catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Other planning items - not tied to a specific crew member or check type</div>
        <button onClick={openCreateForm}>{showForm ? 'Cancel' : 'Add planning item'}</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleSubmit}>
          <div className="field"><label>Title</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
          <div className="field"><label>Planned date (optional)</label><input type="date" value={form.plannedDate} onChange={(e) => setForm({ ...form, plannedDate: e.target.value })} /></div>
          <div className="field"><label>Notes (optional)</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ minHeight: 60 }} /></div>
          <button type="submit" className="primary">{editingId ? 'Save changes' : 'Add'}</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {notes.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Nothing here yet.</div>}
      {notes.map((n) => (
        <div key={n.id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 500 }}>{n.title}</div>
              {n.plannedDate && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Planned for {formatDate(n.plannedDate)}</div>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => openEditForm(n)}>Edit</button>
              <button onClick={() => remove(n.id)}>Delete</button>
            </div>
          </div>
          {n.notes && <div style={{ fontSize: 13, marginTop: 6 }}>{n.notes}</div>}
        </div>
      ))}
    </div>
  );
}

// Colours mirror STATUS_STYLES on CurrencyOverview.jsx - green/amber/red for
// ok/overridden/alert - so this reads consistently with the rest of the app.
const SPACING_STATUS_STYLES = {
  ok: { background: '#d7f0d7', color: '#1e5c1e' },
  overridden: { background: '#fdf2d0', color: '#8a6100' },
  alert: { background: '#f8caca', color: '#7a1414', fontWeight: 700 },
};
const SPACING_STATUS_LABELS = { ok: 'OK', overridden: 'OVERRIDDEN', alert: 'ALERT' };

function SpacingStatusPill({ status }) {
  if (!status) return <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>-</span>;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, ...SPACING_STATUS_STYLES[status] }}>
      {SPACING_STATUS_LABELS[status] || status}
    </span>
  );
}

function fmtDays(n) {
  if (n === null || n === undefined) return '-';
  return n > 0 ? `+${n}` : `${n}`;
}

// Replicates the operator's own "All Pilots IPC/PC dates, expiry and
// expected" spreadsheet (IPC-PC tab), computed live from crew profiles
// instead of hand-maintained - see backend/src/routes/planning.js's
// GET /ipc-pc-spacing for the full column-by-column mapping back to that
// sheet's own formulas.
function IpcPcSpacingSection() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const navigate = useNavigate();

  // Computing currency for the whole pilot roster in one go (every check
  // type, every pilot) is genuinely slow on a cold connection - a couple of
  // seconds is normal, not a hang. Without its own loading state this would
  // flash "No pilots on file" for that whole stretch, which reads as the
  // roster being empty rather than still loading.
  function load() {
    setLoading(true);
    api.get('/api/planning/ipc-pc-spacing').then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function saveComment(row, value) {
    setSavingId(row.crewMemberId);
    setError(null);
    try {
      await api.patch(`/api/crew/${row.crewMemberId}`, { pcIpcOverrideComment: value || null });
      setRows((prev) => prev.map((r) => (r.crewMemberId === row.crewMemberId ? { ...r, overrideComment: value || null } : r)));
    } catch (err) { setError(err.message); }
    setSavingId(null);
  }

  // Section headers group by fleet + rank exactly like the spreadsheet's
  // "Fleet/Rank" column (e.g. "Fokker 100 - Captain") - rows already arrive
  // sorted this way from the backend.
  let lastGroup = null;

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
        IPC/PC recurrency spacing across the pilot roster - spacing status, dates and booking status are computed live from each
        pilot's crew profile. The Comment field can justify an out-of-band gap (promotes ALERT to OVERRIDDEN).
      </div>
      {error && <div className="error-text">{error}</div>}
      {loading && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>}
      {!loading && rows.length === 0 && !error && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No pilots on file.</div>}
      {!loading && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1400 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-strong)' }}>
                <th style={{ padding: '6px 8px' }}>Name</th>
                <th style={{ padding: '6px 8px' }}>Last IPC</th>
                <th style={{ padding: '6px 8px' }}>IPC Expiry</th>
                <th style={{ padding: '6px 8px' }}>Last PC</th>
                <th style={{ padding: '6px 8px' }}>PC Expiry</th>
                <th style={{ padding: '6px 8px' }}>Spacing (days)</th>
                <th style={{ padding: '6px 8px' }}>Status</th>
                <th style={{ padding: '6px 8px' }}>Over/Under</th>
                <th style={{ padding: '6px 8px' }}>Comment</th>
                <th style={{ padding: '6px 8px' }}>Booked IPC</th>
                <th style={{ padding: '6px 8px' }}>Booked PC</th>
                <th style={{ padding: '6px 8px' }}>Gap</th>
                <th style={{ padding: '6px 8px' }}>Days to Run</th>
                <th style={{ padding: '6px 8px' }}>Rostered</th>
                <th style={{ padding: '6px 8px' }}>Closest Check</th>
                <th style={{ padding: '6px 8px' }}>Last Check + 365</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const group = `${formatFleet(r.fleet)} - ${formatTraineeRole(r.role)}`;
                const showGroupHeader = group !== lastGroup;
                lastGroup = group;
                return (
                  <Fragment key={r.crewMemberId}>
                    {showGroupHeader && (
                      <tr key={`${group}-header`}>
                        <td colSpan={16} style={{ padding: '10px 8px 4px', fontWeight: 600, fontSize: 12.5, color: 'var(--text-secondary)' }}>{group}</td>
                      </tr>
                    )}
                    <tr key={r.crewMemberId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{ cursor: 'pointer', color: 'var(--text-accent)' }} onClick={() => navigate(`/crew/${r.crewMemberId}?top=expiry`)}>{r.name}</span>
                      </td>
                      <td style={{ padding: '6px 8px' }}>{formatDate(r.lastIpc) || '-'}</td>
                      <td style={{ padding: '6px 8px' }}>{formatDate(r.ipcExpiry) || '-'}</td>
                      <td style={{ padding: '6px 8px' }}>{formatDate(r.lastPc) || '-'}</td>
                      <td style={{ padding: '6px 8px' }}>{formatDate(r.pcExpiry) || '-'}</td>
                      <td style={{ padding: '6px 8px' }}>{r.spacingDays ?? '-'}</td>
                      <td style={{ padding: '6px 8px' }}><SpacingStatusPill status={r.spacingStatus} /></td>
                      <td style={{ padding: '6px 8px' }}>{fmtDays(r.overUnderRunDays)}</td>
                      <td style={{ padding: '6px 8px', minWidth: 160 }}>
                        <input
                          defaultValue={r.overrideComment || ''}
                          placeholder="Justify a gap..."
                          disabled={savingId === r.crewMemberId}
                          onBlur={(e) => { if (e.target.value !== (r.overrideComment || '')) saveComment(r, e.target.value); }}
                          style={{ width: '100%', fontSize: 12 }}
                        />
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>{r.bookedIpc ? '✓' : ''}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>{r.bookedPc ? '✓' : ''}</td>
                      <td style={{ padding: '6px 8px' }}>{r.gapDays ?? '-'}</td>
                      <td style={{ padding: '6px 8px' }}>{r.daysToRun ?? '-'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>{r.rostered ? '✓' : ''}</td>
                      <td style={{ padding: '6px 8px' }}>{formatDate(r.closestCheck) || '-'}</td>
                      <td style={{ padding: '6px 8px', color: r.breach ? '#b91c1c' : 'inherit', fontWeight: r.breach ? 600 : 400 }}>
                        {formatDate(r.lastCheckPlus365) || '-'}{r.breach ? ' ⚠' : ''}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const PLANNING_TABS = [
  { key: 'checks', label: 'Planned Checks' },
  { key: 'competencies', label: 'Planned Competencies' },
  { key: 'ipcPcSpacing', label: 'IPC/PC Spacing' },
  { key: 'other', label: 'Other Planning Items' },
];

export function Planning() {
  const [tab, setTab] = useState('checks');

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
        {PLANNING_TABS.map((t) => (
          <div
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '6px 12px', border: '0.5px solid var(--border-strong)', borderRadius: 8,
              cursor: 'pointer', fontSize: 13,
              background: tab === t.key ? 'var(--bg-accent)' : 'var(--surface-2)',
              color: tab === t.key ? 'var(--text-accent)' : 'inherit',
            }}
          >{t.label}</div>
        ))}
      </div>
      {tab === 'checks' && <PlannedChecksSection />}
      {tab === 'competencies' && <PlannedCompetenciesSection />}
      {tab === 'ipcPcSpacing' && <IpcPcSpacingSection />}
      {tab === 'other' && <OtherPlanningItemsSection />}
    </div>
  );
}
