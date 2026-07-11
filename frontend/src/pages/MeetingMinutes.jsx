import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/format';

const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];

// Fixed agenda for every Flight Standards meeting - the operator runs this
// meeting every 3 months and these subheadings don't change, so they're
// hardcoded here (and as real columns in the migration) rather than a
// flexible/configurable list.
const SECTIONS = [
  { key: 'acceptanceOfPreviousMinutes', label: '1. Acceptance of Previous Meeting Minutes' },
  { key: 'personnel', label: '2. Flight Standards Personnel' },
  { key: 'currentWorkload', label: '3. Current Workload' },
  { key: 'checkingTrainingOutcomes', label: '4. Review of Checking and Training Outcomes and Feedback (Continuous Improvement)' },
  { key: 'incidentsOccurrences', label: '5. Incidents/Occurrences' },
  { key: 'flightStandardsManual', label: '6. Flight Standards Manual' },
  { key: 'administration', label: '7. Administration' },
  { key: 'nextMeeting', label: '8. Next Meeting' },
];

const STATUS_LABELS = { DRAFT: 'Draft', PUBLISHED: 'Current', ARCHIVED: 'Archived' };
const STATUS_CLASSES = { DRAFT: '', PUBLISHED: 'pass', ARCHIVED: 'warn' };

function StatusBadge({ status }) {
  return <span className={`badge ${STATUS_CLASSES[status]}`}>{STATUS_LABELS[status]}</span>;
}

function emptyForm() {
  return {
    avsafeNumber: '', meetingDate: '', attendanceRegister: '', apologies: '',
    acceptanceOfPreviousMinutes: '', personnel: '', currentWorkload: '', checkingTrainingOutcomes: '',
    incidentsOccurrences: '', flightStandardsManual: '', administration: '', nextMeeting: '',
  };
}

function MinutesList() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  function load() {
    if (isAdmin) {
      api.get('/api/meeting-minutes').then(setList).catch((e) => setError(e.message));
    } else {
      api.get('/api/meeting-minutes/current').then((c) => setList(c ? [c] : [])).catch((e) => setError(e.message));
    }
  }
  useEffect(load, [isAdmin]);

  async function createDraft() {
    setError(null);
    try {
      const created = await api.post('/api/meeting-minutes', emptyForm());
      navigate(`/meeting-minutes/${created.id}`);
    } catch (err) { setError(err.message); }
  }

  if (error) return <div className="error-text">{error}</div>;
  if (!list) return <div className="page-loading">Loading…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Flight Standards meeting minutes, held every 3 months.
        </div>
        {isAdmin && <button className="primary" onClick={createDraft}>+ New meeting minutes</button>}
      </div>

      {list.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No meeting minutes yet.</div>
      )}
      {list.map((m) => (
        <div key={m.id} className="card row" onClick={() => navigate(`/meeting-minutes/${m.id}`)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>
              {m.meetingDate ? formatDate(m.meetingDate) : 'No date set'}{m.avsafeNumber ? ` — Avsafe ${m.avsafeNumber}` : ''}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {m.status === 'PUBLISHED' && !m.acknowledgedByMe ? 'Not yet acknowledged by you' : m.status === 'PUBLISHED' ? 'Acknowledged' : ''}
            </div>
          </div>
          <StatusBadge status={m.status} />
        </div>
      ))}
    </div>
  );
}

function SectionField({ label, value, onChange, disabled, big }) {
  return (
    <div className="field">
      <label>{label}</label>
      {big ? (
        <textarea value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ minHeight: 90 }} />
      ) : (
        <input value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function AcknowledgementTracker({ minutesId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/api/meeting-minutes/${minutesId}/acknowledgements`).then(setData).catch((e) => setError(e.message));
  }, [minutesId]);

  if (error) return <div className="error-text">{error}</div>;
  if (!data) return null;

  return (
    <div className="card">
      <div style={{ fontWeight: 500, marginBottom: 6 }}>
        Acknowledged by {data.acknowledgedCount}/{data.eligibleCount} staff
      </div>
      {data.acknowledgedBy.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No one has acknowledged this yet.</div>
      )}
      {data.acknowledgedBy.map((a) => (
        <div key={a.userId} style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
          {a.name} — {formatDate(a.acknowledgedAt)}
        </div>
      ))}
    </div>
  );
}

function MinutesDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const [minutes, setMinutes] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  function load() {
    api.get(`/api/meeting-minutes/${id}`).then((m) => { setMinutes(m); setForm(m); }).catch((e) => setError(e.message));
  }
  useEffect(load, [id]);

  const isDraft = minutes?.status === 'DRAFT';
  const canEdit = isAdmin && isDraft;

  async function save() {
    setError(null);
    try {
      const updated = await api.patch(`/api/meeting-minutes/${id}`, form);
      setMinutes(updated);
      setForm(updated);
    } catch (err) { setError(err.message); }
  }

  async function publish() {
    if (!window.confirm('Publish these meeting minutes? This makes them the current record and notifies staff to acknowledge them - the previous current minutes will be archived.')) return;
    setError(null);
    try { setMinutes(await api.post(`/api/meeting-minutes/${id}/publish`)); }
    catch (err) { setError(err.message); }
  }

  async function remove() {
    if (!window.confirm('Delete this draft? This cannot be undone.')) return;
    setError(null);
    try { await api.delete(`/api/meeting-minutes/${id}`); navigate('/meeting-minutes'); }
    catch (err) { setError(err.message); }
  }

  async function acknowledge() {
    setError(null);
    try {
      await api.post(`/api/meeting-minutes/${id}/acknowledge`);
      setMinutes((m) => ({ ...m, acknowledgedByMe: true }));
    } catch (err) { setError(err.message); }
  }

  if (error) return <div className="error-text">{error}</div>;
  if (!minutes || !form) return <div className="page-loading">Loading…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <button onClick={() => navigate('/meeting-minutes')}>← Back</button>
        <StatusBadge status={minutes.status} />
      </div>

      {minutes.status !== 'DRAFT' && user.role !== 'TRAINEE' && (
        <div className="card" style={{ background: minutes.acknowledgedByMe ? 'var(--bg-success)' : 'var(--bg-warning)', marginBottom: '1rem' }}>
          {minutes.acknowledgedByMe ? (
            <span style={{ color: 'var(--text-success)' }}>You have acknowledged these minutes.</span>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span style={{ color: 'var(--text-warning)' }}>Please confirm you have received and understood these minutes.</span>
              <button className="primary" onClick={acknowledge}>Acknowledge</button>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="grid2">
          <SectionField label="Avsafe #" value={form.avsafeNumber} onChange={(v) => setForm({ ...form, avsafeNumber: v })} disabled={!canEdit} />
          <div className="field">
            <label>Date</label>
            <input type="date" value={form.meetingDate ? form.meetingDate.slice(0, 10) : ''} disabled={!canEdit} onChange={(e) => setForm({ ...form, meetingDate: e.target.value })} />
          </div>
        </div>
        <SectionField label="Attendance Register" value={form.attendanceRegister} onChange={(v) => setForm({ ...form, attendanceRegister: v })} disabled={!canEdit} big />
        <SectionField label="Apologies" value={form.apologies} onChange={(v) => setForm({ ...form, apologies: v })} disabled={!canEdit} big />
      </div>

      {SECTIONS.map((s) => (
        <div key={s.key} className="card">
          <SectionField label={s.label} value={form[s.key]} onChange={(v) => setForm({ ...form, [s.key]: v })} disabled={!canEdit} big />
        </div>
      ))}

      {error && <div className="error-text">{error}</div>}

      {canEdit && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="primary" onClick={save}>Save draft</button>
          <button onClick={publish}>Publish</button>
          <button className="danger" onClick={remove}>Delete draft</button>
        </div>
      )}

      {isAdmin && minutes.status !== 'DRAFT' && <AcknowledgementTracker minutesId={minutes.id} />}
    </div>
  );
}

export function MeetingMinutesList() {
  return <MinutesList />;
}

export function MeetingMinutesDetail() {
  return <MinutesDetail />;
}

// Shown app-wide (see App.jsx's Shell) whenever the logged-in staff member
// hasn't yet acknowledged the current published minutes - the "alert on
// first login" the operator asked for, in practice just a banner that
// keeps surfacing until they acknowledge it, since there's no separate
// concept of "login" to hook into beyond that.
export function MeetingMinutesAlert() {
  const { user } = useAuth();
  const [current, setCurrent] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (user.role === 'TRAINEE') return;
    api.get('/api/meeting-minutes/current').then(setCurrent).catch(() => {});
  }, [user.role]);

  if (!current || current.acknowledgedByMe) return null;

  return (
    <div
      className="card row"
      style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)', marginBottom: '1rem', cursor: 'pointer' }}
      onClick={() => navigate(`/meeting-minutes/${current.id}`)}
    >
      <div style={{ flex: 1, fontSize: 13 }}>
        New Flight Standards meeting minutes have been published{current.avsafeNumber ? ` (Avsafe ${current.avsafeNumber})` : ''} - please review and acknowledge.
      </div>
    </div>
  );
}
