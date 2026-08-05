import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { formatDate, formatFleet, formatTraineeRole } from '../lib/format';
import { AssignedToPicker } from '../components/AssignedToPicker';
import { DueBadge } from '../components/DueBadge';

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

// A check is only actually non-compliant once it lapses past its own CASR
// recency limit (IPC: Part 61.880, 12 months from the last IPC; PC: 12
// months from the last one, under the operator's Part 121
// training-and-checking approval) - that's exactly what DueBadge's
// 'overdue' status already means everywhere else in the app, so this reuses
// the same signal rather than inventing a second one.
function isBreached(item) {
  return item?.status === 'overdue';
}

// Whether the next occurrence of a check has actually been organised, not
// just estimated - a planned date with no assigned examiner is a tentative
// plan, not a booking.
function organisedLabel(item) {
  if (!item) return null;
  if (item.plannedAssignedTo) return { text: `Booked with ${item.plannedAssignedTo.name}`, color: '#14632f' };
  if (item.plannedDate) return { text: 'Date planned - no examiner assigned yet', color: '#8a6100' };
  return { text: 'Not yet booked or rostered', color: 'var(--text-secondary)' };
}

// Replicates the operator's own IPC/PC forward-planning spreadsheet, but
// simplified to what's actually decision-relevant: real CASR compliance
// (reusing the same due-date/status the rest of the app already computes -
// see crew.js withCurrency), whether the next check has actually been
// booked/rostered (not just estimated), and the gap against the operator's
// own ~6-month scheduling target - see backend/src/routes/planning.js's
// GET /ipc-pc-spacing for the full reasoning.
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

  async function saveNote(row, value) {
    setSavingId(row.crewMemberId);
    setError(null);
    try {
      await api.patch(`/api/crew/${row.crewMemberId}`, { pcIpcOverrideComment: value || null });
      setRows((prev) => prev.map((r) => (r.crewMemberId === row.crewMemberId ? { ...r, note: value || null } : r)));
    } catch (err) { setError(err.message); }
    setSavingId(null);
  }

  const breaches = rows.filter((r) => isBreached(r.ipc) || isBreached(r.pc));

  // Section headers group by fleet + rank (e.g. "Fokker 100 - Captain") -
  // rows already arrive sorted this way from the backend.
  let lastGroup = null;

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
        Forward planning for pilot IPC/PC recurrency. An IPC is due 12 months after the last one (CASR Part 61 recency), and a
        Proficiency Check is due 12 months after the last one under the operator's CASR Part 121 training-and-checking system - both
        shown below exactly as they are on each pilot's own profile. Spacing the two roughly 6 months apart is this operator's own
        scheduling target for smoother forward planning - it is not itself a CASA requirement, so it's shown as a plain note, not a
        red/amber/green status.
      </div>

      {breaches.length > 0 && (
        <div className="card" style={{ background: '#f8caca', color: '#7a1414', marginBottom: '0.75rem' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ {breaches.length} pilot{breaches.length > 1 ? 's' : ''} currently non-compliant</div>
          {breaches.map((r) => (
            <div key={r.crewMemberId} style={{ fontSize: 13 }}>
              <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigate(`/crew/${r.crewMemberId}?top=expiry`)}>{r.name}</span>
              {' - '}
              {[isBreached(r.ipc) && 'IPC overdue', isBreached(r.pc) && 'PC overdue'].filter(Boolean).join(', ')}
            </div>
          ))}
        </div>
      )}

      {error && <div className="error-text">{error}</div>}
      {loading && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>}
      {!loading && rows.length === 0 && !error && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No pilots on file.</div>}
      {!loading && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-strong)' }}>
                <th style={{ padding: '6px 8px' }}>Name</th>
                <th style={{ padding: '6px 8px' }}>IPC</th>
                <th style={{ padding: '6px 8px' }}>PC</th>
                <th style={{ padding: '6px 8px' }}>Spacing</th>
                <th style={{ padding: '6px 8px' }}>Planning note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const group = `${formatFleet(r.fleet)} - ${formatTraineeRole(r.role)}`;
                const showGroupHeader = group !== lastGroup;
                lastGroup = group;
                const ipcOrganised = organisedLabel(r.ipc);
                const pcOrganised = organisedLabel(r.pc);
                return (
                  <Fragment key={r.crewMemberId}>
                    {showGroupHeader && (
                      <tr>
                        <td colSpan={5} style={{ padding: '10px 8px 4px', fontWeight: 600, fontSize: 12.5, color: 'var(--text-secondary)' }}>{group}</td>
                      </tr>
                    )}
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                        <span style={{ cursor: 'pointer', color: 'var(--text-accent)' }} onClick={() => navigate(`/crew/${r.crewMemberId}?top=expiry`)}>{r.name}</span>
                      </td>
                      <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                        <DueBadge label="IPC" info={r.ipc} />
                        {ipcOrganised && <div style={{ fontSize: 10.5, color: ipcOrganised.color, marginTop: 4 }}>{ipcOrganised.text}</div>}
                      </td>
                      <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                        <DueBadge label="PC" info={r.pc} />
                        {pcOrganised && <div style={{ fontSize: 10.5, color: pcOrganised.color, marginTop: 4 }}>{pcOrganised.text}</div>}
                      </td>
                      <td style={{ padding: '6px 8px', verticalAlign: 'top', maxWidth: 160 }}>
                        {r.spacingDays === null ? (
                          <span style={{ color: 'var(--text-secondary)' }}>-</span>
                        ) : (
                          <span>{(r.spacingDays / 30.44).toFixed(1)} months apart<br /><span style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>target ~6 months</span></span>
                        )}
                      </td>
                      <td style={{ padding: '6px 8px', verticalAlign: 'top', minWidth: 180 }}>
                        <input
                          defaultValue={r.note || ''}
                          placeholder="e.g. simulator slot booked with 3rd party"
                          disabled={savingId === r.crewMemberId}
                          onBlur={(e) => { if (e.target.value !== (r.note || '')) saveNote(r, e.target.value); }}
                          style={{ width: '100%', fontSize: 12 }}
                        />
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
