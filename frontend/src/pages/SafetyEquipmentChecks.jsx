import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { AssignedToPicker } from '../components/AssignedToPicker';
import { AssessorPicker } from '../components/AssessorPicker';
import { PinSignature } from '../components/PinSignature';
import { ArchiveButton } from '../components/ArchiveButton';
import { DeleteButton } from '../components/DeleteButton';
import { formatUserRole, formatDate } from '../lib/format';
import { sortNotCompletedFirst } from '../lib/sortChecks';

// Only HOTC, HOFO, Flight Ops Admin and Alternate can add a new check
// record - mirrors backend/src/routes/checks.js POST /.
const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];

// Life Jacket Training, Smoke & Fire Training and F100 Slide Training -
// grouped with Emergency Procedures under this crew member's own tab (see
// CrewDetail.jsx), per the operator's explicit request. Unlike Emergency
// Procedures (whose item list is admin-editable, see check-form-items.js),
// each of these has a small, fixed item list the operator gave exact
// wording for - not worth a whole admin catalog for, so it's fixed here
// (same reasoning as the cabin attendant Check to Line's own fixed 6-item
// list). Config-driven so the three forms share one implementation rather
// than tripling near-identical code.
export const SAFETY_EQUIPMENT_CONFIGS = {
  LIFE_JACKET: {
    checkType: 'LIFE_JACKET',
    label: 'Life Jacket Training',
    cycleText: 'Once-off - not required again once passed',
    items: [{ id: 'lifeJacket', description: 'Life Jacket Training (Wet Drill)' }],
    textFields: [],
    hasScore: false,
  },
  SMOKE_FIRE_TRAINING: {
    checkType: 'SMOKE_FIRE_TRAINING',
    label: 'Smoke & Fire Training',
    cycleText: '3-year cycle',
    items: [
      { id: 'liveFireFighting', description: 'Live Fire Fighting Exercise' },
      { id: 'simulatedSmoke', description: 'Simulated Fire Fighting in Smoke Environment' },
    ],
    textFields: [
      { id: 'smokeScenario', label: 'Smoke Environment Scenario performed' },
      { id: 'comments', label: 'Comments' },
    ],
    hasScore: true,
  },
  F100_SLIDE_TRAINING: {
    checkType: 'F100_SLIDE_TRAINING',
    label: 'F100 Slide Training',
    // Operator confirmed "simple, recurring" but didn't give an exact
    // interval - matched to Smoke & Fire Training's 3-year cycle (see
    // backend/src/routes/crew.js safetyEquipmentCurrency); flag to the
    // operator if a different interval is actually wanted.
    cycleText: '3-year cycle (assumed) - Fokker 100',
    items: [{ id: 'f100Slide', description: 'Fokker 100 Slide Training' }],
    textFields: [],
    hasScore: false,
  },
};

const emptyDetails = () => ({ date: '', assessorId: '', assessor: '', assessorArn: '', actype: '', items: {}, assessorSig: '', candidateSig: '' });

// crewMemberId/crewMemberName/fleet scope this to one Crew roster member's
// own profile (see CrewDetail.jsx) - unlike EpChecks.jsx, these three never
// need a free-text/standalone candidate flow, so that complexity is left
// out entirely.
export function SafetyEquipmentCheckForm({ configKey, crewMemberId, crewMemberName, appliesTo, fleet, archived = false, crewArchived = false }) {
  const config = SAFETY_EQUIPMENT_CONFIGS[configKey];
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const [checks, setChecks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState(() => ({ ...emptyDetails(), assignedTo: '' }));
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/checks?checkType=${config.checkType}&archived=${archived}&crewMemberId=${crewMemberId}`)
      .then(setChecks)
      .catch((e) => setError(e.message));
  }
  useEffect(load, [configKey, crewMemberId, archived]);

  const selected = checks.find((c) => c.id === selectedId);

  async function createCheck(e) {
    e.preventDefault();
    setError(null);
    try {
      const { assignedTo, ...details } = newForm;
      await api.post('/api/checks', { checkType: config.checkType, appliesTo, crewMemberId, assignedTo: assignedTo || undefined, details });
      setCreating(false);
      setNewForm({ ...emptyDetails(), assignedTo: '' });
      load();
    } catch (err) { setError(err.message); }
  }

  async function patchDetails(check, patch) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, { details: { ...check.details, ...patch } });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) { setError(err.message); }
  }

  // completedAt drives the next-expiry calculation (crew.js), so it must
  // reflect the date the check was actually conducted (details.date) - not
  // whatever moment the result happened to get signed off.
  async function setResult(check, result) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, { result, completedAt: check.details?.date || new Date().toISOString() });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) { setError(err.message); }
  }

  async function reassign(check, staffMember) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, {
        assignedTo: staffMember?.id || null,
        details: {
          ...check.details,
          assessorId: staffMember?.id || check.details?.assessorId,
          assessor: staffMember?.name || check.details?.assessor,
          assessorArn: staffMember?.arn || check.details?.assessorArn,
        },
      });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) { setError(err.message); }
  }

  function setAssessor(staffMember, apply) {
    apply({ assessorId: staffMember?.id || '', assessor: staffMember?.name || '', assessorArn: staffMember?.arn || '' });
  }

  async function archiveCheck(check) {
    setError(null);
    try { await api.post(`/api/checks/${check.id}/archive`); setSelectedId(null); load(); }
    catch (err) { setError(err.message); }
  }

  async function unarchiveCheck(check) {
    setError(null);
    try { await api.post(`/api/checks/${check.id}/unarchive`); setSelectedId(null); load(); }
    catch (err) { setError(err.message); }
  }

  async function deleteCheck(check) {
    setError(null);
    try { await api.delete(`/api/checks/${check.id}`); setSelectedId(null); load(); }
    catch (err) { setError(err.message); }
  }

  if (selected) {
    const d = selected.details || {};
    const allItemsAnswered = config.items.every((item) => d.items?.[item.id] !== undefined);

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <button onClick={() => setSelectedId(null)}>← Back</button>
          <div style={{ display: 'flex', gap: 6 }}>
            <ArchiveButton
              archived={selected.archived}
              canArchive={!!selected.result}
              onArchive={() => archiveCheck(selected)}
              onUnarchive={() => unarchiveCheck(selected)}
            />
            <DeleteButton archived={selected.archived} onDelete={() => deleteCheck(selected)} />
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: 16, fontWeight: 500 }}>{crewMemberName} — {config.label}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {d.actype || 'No aircraft type'} · {d.date ? formatDate(d.date) : 'No date'}
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {selected.assignedToName ? `${selected.assignedToRole ? formatUserRole(selected.assignedToRole) : 'Assigned to'} ${selected.assignedToName}${selected.assignedToArn ? ` · ARN ${selected.assignedToArn}` : ''}` : 'Unassigned'}
          </div>
          <AssignedToPicker value={selected.assignedTo} accessType="EMERGENCY_PROCEDURES" fleet={fleet} onAssign={(s) => reassign(selected, s)} />
        </div>

        <div className="card">
          {config.items.map((item) => (
            <div key={item.id} className="row" style={{ cursor: 'default' }}>
              <div style={{ flex: 1, fontSize: 13 }}>{item.description}</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['S', 'X', 'N'].map((v) => (
                  <button
                    key={v}
                    disabled={!!selected.completedAt}
                    className={`tick-btn ${d.items?.[item.id] === v ? (v === 'X' ? 'active-fail' : 'active-pass') : ''}`}
                    onClick={() => patchDetails(selected, { items: { ...d.items, [item.id]: d.items?.[item.id] === v ? undefined : v } })}
                  >{v === 'S' ? '✓' : v === 'X' ? '✗' : 'N'}</button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {config.textFields.length > 0 && (
          <div className="card">
            {config.textFields.map((f) => (
              <div className="field" key={f.id}>
                <label>{f.label}</label>
                <textarea defaultValue={d[f.id]} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { [f.id]: e.target.value })} style={{ minHeight: 60 }} />
              </div>
            ))}
          </div>
        )}

        <div className="card">
          <AssessorPicker value={d.assessorId} accessType="EMERGENCY_PROCEDURES" fleet={fleet} disabled={!!selected.completedAt} onSelect={(s) => setAssessor(s, (patch) => patchDetails(selected, patch))} />
          <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-secondary)', margin: '0.75rem 0' }}>
            We the undersigned, do hereby mutually agree upon and accept the comments written in
            this document as being a correct and honest account of the performance of the trainee in
            each and every check procedure carried out.
          </div>
          <div className="grid2">
            {selected.assignedTo ? (
              <PinSignature
                label="Assessor signature" personType="user" personId={selected.assignedTo}
                signedName={d.assessorSig} signedAt={d.assessorSigAt} disabled={!!selected.completedAt}
                onSigned={(name, at) => patchDetails(selected, { assessorSig: name, assessorSigAt: at })}
              />
            ) : (
              <div className="field"><label>Assessor signature</label><input defaultValue={d.assessorSig} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { assessorSig: e.target.value })} /></div>
            )}
            {selected.crewMemberId ? (
              <PinSignature
                label="Candidate signature" personType="crewMember" personId={selected.crewMemberId}
                signedName={d.candidateSig} signedAt={d.candidateSigAt} disabled={!!selected.completedAt}
                onSigned={(name, at) => patchDetails(selected, { candidateSig: name, candidateSigAt: at })}
              />
            ) : (
              <div className="field"><label>Candidate signature</label><input defaultValue={d.candidateSig} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { candidateSig: e.target.value })} /></div>
            )}
          </div>
        </div>

        {!selected.completedAt && (
          <div className="card" style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)', fontSize: 12 }}>
            DO NOT SELECT UNTIL ALL THE FORM HAS BEEN COMPLETED. SELECTING THIS WILL LOCK THE FORM.
          </div>
        )}
        {!selected.completedAt && !allItemsAnswered && (
          <div className="card" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Every item above must be ticked (S/X/N) before the overall assessment can be set.
          </div>
        )}
        <div className="card">
          {config.hasScore && (
            <div className="field">
              <label>Overall score (1–5)</label>
              <input type="number" min="1" max="5" disabled={!!selected.completedAt} defaultValue={selected.score || ''} onBlur={(e) => api.patch(`/api/checks/${selected.id}`, { score: Number(e.target.value) || null }).then(load)} />
            </div>
          )}
          <div className="field">
            <label>Overall assessment</label>
            <select disabled={!!selected.completedAt || !allItemsAnswered} value={selected.result || ''} onChange={(e) => setResult(selected, e.target.value || null)}>
              <option value="">—</option>
              <option value="PASS">PASS</option>
              <option value="FAIL">FAIL</option>
            </select>
          </div>
        </div>
        {error && <div className="error-text">{error}</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{archived ? `Archived ${config.label.toLowerCase()} checks` : config.cycleText}</div>
        {!archived && !crewArchived && isAdmin && <button onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : `Add ${config.label.toLowerCase()} check`}</button>}
      </div>

      {!archived && creating && (
        <form className="card" onSubmit={createCheck}>
          <div className="grid2">
            <div className="field"><label>Candidate</label><input value={crewMemberName} disabled /></div>
            <div className="field"><label>Date</label><input type="date" value={newForm.date} onChange={(e) => setNewForm({ ...newForm, date: e.target.value })} /></div>
          </div>
          <AssignedToPicker
            value={newForm.assignedTo}
            accessType="EMERGENCY_PROCEDURES"
            fleet={fleet}
            onAssign={(s) => setNewForm((f) => ({ ...f, assignedTo: s?.id || '', assessorId: s?.id || f.assessorId, assessor: s?.name || f.assessor, assessorArn: s?.arn || f.assessorArn }))}
          />
          <div className="grid2">
            <AssessorPicker value={newForm.assessorId} accessType="EMERGENCY_PROCEDURES" fleet={fleet} onSelect={(s) => setAssessor(s, (patch) => setNewForm((f) => ({ ...f, ...patch })))} />
            <div className="field">
              <label>Aircraft type</label>
              <select value={newForm.actype} onChange={(e) => setNewForm({ ...newForm, actype: e.target.value })}>
                <option value="">—</option>
                <option value="Fokker 100">Fokker 100</option>
                <option value="Dash 8">Dash 8</option>
                <option value="Metro">Metro</option>
              </select>
            </div>
          </div>
          <button type="submit" className="primary">Create check record</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {checks.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No {archived ? 'archived ' : ''}{config.label.toLowerCase()} checks yet.</div>}
      {sortNotCompletedFirst(checks).map((c) => (
        <div key={c.id} className="card row" onClick={() => setSelectedId(c.id)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{crewMemberName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {c.details?.actype || 'No aircraft type'} · {c.details?.date ? formatDate(c.details.date) : 'No date'}
            </div>
          </div>
          {c.result && <span className={`badge ${c.result === 'PASS' ? 'pass' : 'fail'}`}>{c.result}</span>}
        </div>
      ))}
    </div>
  );
}
