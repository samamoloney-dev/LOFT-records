import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { formatDate, formatFleet } from '../lib/format';
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
      {rows.map((r, i) => (
        <div key={i} className="card row" onClick={() => navigate(`/crew/${r.crewMemberId}`)}>
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

const PLANNING_TABS = [
  { key: 'checks', label: 'Planned Checks' },
  { key: 'competencies', label: 'Planned Competencies' },
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
      {tab === 'other' && <OtherPlanningItemsSection />}
    </div>
  );
}
