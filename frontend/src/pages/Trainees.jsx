import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatFleet, formatTraineeRole } from '../lib/format';
import { SyllabusPicker } from '../components/SyllabusPicker';

const FLEETS = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];
const TYPES = ['PILOT', 'CABIN_ATTENDANT'];
// Scoped by type - a Cabin Attendant trainee was never actually offered
// Captain/First Officer, this just closes a gap where the raw list showed
// every role regardless of the type picked above it. Picking Captain here
// flags them as a Captain candidate from day one of LOFT - see TraineeDetail
// (Captain in Training tab, next to Landing Assessment).
const ROLES_BY_TYPE = { PILOT: ['CAPTAIN', 'FIRST_OFFICER'], CABIN_ATTENDANT: ['CABIN_ATTENDANT'] };
// Only HOTC, HOFO, Flight Ops Admin and Alternate can add a new trainee -
// no other staff role. Mirrors backend/src/routes/trainees.js POST /.
const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];
// Narrower than ADMIN_ROLES - deliberately excludes Alternate, same as the
// Clearance Form itself (see isClearanceSigner) - this confirmation is what
// triggers that Clearance Form alert, so it's gated the same way. Mirrors
// backend/src/routes/trainees.js's READY_FOR_LOFT_ROLES.
const READY_FOR_LOFT_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN'];

export function Trainees() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const canConfirmReadyForLoft = READY_FOR_LOFT_ROLES.includes(user.role);
  const [searchParams] = useSearchParams();
  const [trainees, setTrainees] = useState([]);
  const [confirmingId, setConfirmingId] = useState(null);
  const [readyError, setReadyError] = useState(null);
  // Lets the Home Dashboard's "Add Trainee" quick action (?new=1) land here
  // with the form already open, instead of requiring an extra click.
  const [showForm, setShowForm] = useState(isAdmin && searchParams.get('new') === '1');
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', type: 'PILOT', role: 'FIRST_OFFICER', fleet: 'DASH_8', syllabusId: null });
  // Sends an existing, already-qualified crew member back through LOFT for
  // a new fleet (e.g. a Cabin Attendant converting from Dash 8 to Fokker
  // 100) instead of only supporting brand-new hires - see backend
  // trainees.js sourceCrewMemberId/promote-to-crew, which merges the new
  // fleet into their existing crew record on completion rather than
  // creating a duplicate one.
  const [returningToLoft, setReturningToLoft] = useState(false);
  const [eligibleCrew, setEligibleCrew] = useState([]);
  const [sourceCrewMemberId, setSourceCrewMemberId] = useState('');
  const navigate = useNavigate();

  function load() {
    api.get('/api/trainees').then(setTrainees).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  // Only crew not already qualified on the fleet currently selected below -
  // no point sending someone back to LOFT for a fleet they already hold.
  useEffect(() => {
    if (!returningToLoft) { setEligibleCrew([]); return; }
    api.get(`/api/crew?type=${form.type}`)
      .then((crew) => setEligibleCrew(crew.filter((c) => !c.fleets.includes(form.fleet))))
      .catch(() => {});
  }, [returningToLoft, form.type, form.fleet]);

  function selectSourceCrewMember(id) {
    setSourceCrewMemberId(id);
    const member = eligibleCrew.find((c) => c.id === id);
    if (member) setForm((f) => ({ ...f, firstName: member.firstName, lastName: member.lastName, role: member.role }));
  }

  function resetForm() {
    setForm({ firstName: '', lastName: '', type: 'PILOT', role: 'FIRST_OFFICER', fleet: 'DASH_8', syllabusId: null });
    setReturningToLoft(false);
    setSourceCrewMemberId('');
  }

  async function confirmReadyForLoft(traineeId) {
    setReadyError(null);
    try {
      await api.post(`/api/trainees/${traineeId}/ready-for-loft`);
      setConfirmingId(null);
      load();
    } catch (err) { setReadyError(err.message); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/api/trainees', { ...form, sourceCrewMemberId: sourceCrewMemberId || undefined });
      setShowForm(false);
      resetForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Active trainees</div>
        {isAdmin && <button onClick={() => { setShowForm((v) => !v); resetForm(); }}>{showForm ? 'Cancel' : 'Add trainee'}</button>}
      </div>

      {showForm && isAdmin && (
        <form className="card" onSubmit={handleCreate}>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={returningToLoft}
                onChange={(e) => { setReturningToLoft(e.target.checked); setSourceCrewMemberId(''); }}
                style={{ width: 'auto' }}
              />
              This is an existing crew member returning to LOFT for a new fleet (e.g. Dash 8 → Fokker 100)
            </label>
          </div>
          {returningToLoft && (
            <div className="field">
              <label>Crew member</label>
              <select value={sourceCrewMemberId} onChange={(e) => selectSourceCrewMember(e.target.value)} required>
                <option value="">— Select —</option>
                {eligibleCrew.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {eligibleCrew.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  No crew found who aren't already qualified on {formatFleet(form.fleet)}.
                </div>
              )}
            </div>
          )}
          <div className="grid2">
            <div className="field"><label>First name</label><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></div>
            <div className="field"><label>Last name</label><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></div>
          </div>
          <div className="grid2">
            <div className="field">
              <label>Type</label>
              <select
                value={form.type}
                onChange={(e) => {
                  const type = e.target.value;
                  setForm({ ...form, type, role: ROLES_BY_TYPE[type][0], fleet: type === 'PILOT' ? 'DASH_8' : 'CA_DASH_8', syllabusId: null });
                  setSourceCrewMemberId('');
                }}
              >
                {TYPES.map((t) => <option key={t} value={t}>{formatTraineeRole(t)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES_BY_TYPE[form.type].map((r) => <option key={r} value={r}>{formatTraineeRole(r)}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Fleet</label>
            <select value={form.fleet} onChange={(e) => { setForm({ ...form, fleet: e.target.value, syllabusId: null }); setSourceCrewMemberId(''); }}>
              {FLEETS.map((f) => <option key={f} value={f}>{formatFleet(f)}</option>)}
            </select>
          </div>
          <SyllabusPicker fleet={form.fleet} value={form.syllabusId} onChange={(syllabusId) => setForm({ ...form, syllabusId })} />
          <button type="submit" className="primary">Create</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {readyError && <div className="error-text">{readyError}</div>}
      {trainees.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No trainees yet.</div>}
      {trainees.map((t) => {
        // Same real-world milestone, different label per type - "Type
        // Rating Complete" (pilots, the third-party simulator training and
        // aircraft type endorsement) or "Ground School Complete" (cabin
        // attendants) - see backend/src/routes/trainees.js POST
        // /:id/ready-for-loft. Ticking this is what triggers that
        // trainee's first Clearance Form alert on the Home Dashboard.
        const readyLabel = t.type === 'PILOT' ? 'Type Rating Complete' : 'Ground School Complete';
        return (
          <div key={t.id} className="card row" onClick={() => navigate(`/trainees/${t.id}`)}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{t.firstName} {t.lastName}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {formatFleet(t.fleet)} · {formatTraineeRole(t.role)}{t.type !== 'CABIN_ATTENDANT' && ` · Phase ${t.phase} · ${t.totalHours}h total`}
              </div>
            </div>
            {t.readyForLoftAt ? (
              <span style={{ fontSize: 11, color: 'var(--text-success)' }}>{readyLabel.replace('Complete', 'complete')}</span>
            ) : canConfirmReadyForLoft && confirmingId === t.id ? (
              <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                <button className="primary" onClick={() => confirmReadyForLoft(t.id)}>Confirm</button>
                <button onClick={() => setConfirmingId(null)}>Cancel</button>
              </div>
            ) : canConfirmReadyForLoft ? (
              <button onClick={(e) => { e.stopPropagation(); setConfirmingId(t.id); }}>{readyLabel}</button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
