import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { AssignedToPicker } from '../components/AssignedToPicker';
import { PinSignature } from '../components/PinSignature';
import { ArchiveButton } from '../components/ArchiveButton';
import { DeleteButton } from '../components/DeleteButton';
import { PrintButton } from '../components/PrintButton';
import { openPrintWindow, section, signatureBlock, resultBadge } from '../lib/print';
import { formatDate, formatUserRole } from '../lib/format';

// Captain in Training upgrade assessments (SA 567 Preliminary, SA 568
// Final) - assigned ad hoc when a First Officer is upgrading to Captain,
// not part of the recurring currency system (no due date/planning tab
// integration). Preliminary accompanies the candidate's first simulator
// session (their PC or IPC+PC); Final happens as they approach Check to
// Line. Both share one checkType (CAPTAIN_IN_TRAINING) with a
// details.variant, same pattern as RECURRENT_SIMULATOR's PC/IPC_PC.
const VARIANT_LABELS = { PRELIMINARY: 'Captain in Training — Preliminary Assessment', FINAL: 'Captain in Training — Final Assessment' };
// Only HOTC, HOFO, Flight Ops Admin and Alternate can add a new check
// record - mirrors backend/src/routes/checks.js POST /.
const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];

const PRELIM_SECTION_1 = [
  'Comfort and orientation in LHS',
  'Cockpit setup',
  'Engine Start Process',
  'Correct Use of Checklist',
  'Overall Aircraft Handling',
  'Proficiency Check Test Specific Activities and Maneuvers',
];
const PRELIM_SECTION_2 = [
  'Shows awareness of crew roles and responsibilities',
  'Demonstrates a safety-first mindset',
  'Communicates intentions (even if not fluent)',
  'Acknowledges when unsure and seeks clarification',
  'Receptive to feedback from trainer/FO',
];
const PRELIM_RECOMMENDATIONS = [
  'Has demonstrated sufficient technical and non-technical competency to commence supervised line training',
  'More training required prior to first LOFT',
  'Standard not yet met',
];
const OBSERVATION_OPTIONS = ['Developing', 'Adequate', 'Strong'];

const FINAL_SECTION_1 = [
  "Aircraft control and handling",
  "Adherence to SOP's and checklists",
  'Decision making',
  'Recognition of stable approach criteria',
  'Decision to land or go around',
];
const FINAL_SECTION_2 = [
  'Task prioritisation and workload management',
  'Monitoring and cross-checking',
  'Adherence to company policies and regulations',
  'Situational awareness and risk assessment',
  'Decision to take over from First Officer when necessary',
];
const FINAL_SECTION_3 = [
  'Communication with crew and ATC',
  'Leadership and command presence',
  'Crew coordination and delegation',
  'Use of standard phraseology and briefing quality',
  'Recognition and mitigation of operational threats',
  'Fatigue and stress management',
  'Handling of unexpected or abnormal situations',
  'Decision making under pressure',
  'Assertiveness and intervention when required',
];
const FINAL_RECOMMENDATIONS = [
  'Candidate is suitable for upgrade to Captain',
  'Additional training required',
  'Candidate is not yet ready for command',
];

// Only the first (most positive) recommendation option maps to an overall
// PASS - the other two mean more work is needed before progressing. The
// specific wording picked is kept verbatim in details.recommendation for
// the printed record; result is just the app-wide PASS/FAIL summary.
function resultFor(variant, recommendation) {
  if (!recommendation) return null;
  const passText = variant === 'PRELIMINARY' ? PRELIM_RECOMMENDATIONS[0] : FINAL_RECOMMENDATIONS[0];
  return recommendation === passText ? 'PASS' : 'FAIL';
}

function sectionsFor(variant) {
  return variant === 'PRELIMINARY'
    ? [{ title: 'Section 1: Basic Aircraft Handling — LHS Introduction', kind: 'observation', items: PRELIM_SECTION_1 },
      { title: 'Section 2: Early Command Aptitude Indicators', kind: 'yesno', items: PRELIM_SECTION_2 }]
    : [{ title: 'Section 1: Flight Performance & Handling', kind: 'satisfactory', items: FINAL_SECTION_1 },
      { title: 'Section 2: Flight Management & Situational Awareness', kind: 'satisfactory', items: FINAL_SECTION_2 },
      { title: 'Section 3: Human Factors & Non-Technical Skills', kind: 'satisfactory', items: FINAL_SECTION_3 }];
}

function isAnswered(kind, value) {
  if (kind === 'observation') return !!value?.observation && value?.minStandard !== undefined;
  if (kind === 'yesno') return value?.observation !== undefined;
  return value?.satisfactory !== undefined; // 'satisfactory'
}

function ItemRow({ kind, description, value, disabled, onChange }) {
  const v = value || {};

  if (kind === 'observation') {
    return (
      <div className="card" style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 13, marginBottom: 6 }}>{description}</div>
        <div className="grid2">
          <div className="field" style={{ margin: 0 }}>
            <label>Observation</label>
            <select disabled={disabled} value={v.observation || ''} onChange={(e) => onChange({ ...v, observation: e.target.value })}>
              <option value="">—</option>
              {OBSERVATION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Minimum standard met</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" className={`tick-btn ${v.minStandard === true ? 'active-pass' : ''}`} disabled={disabled} onClick={() => onChange({ ...v, minStandard: true })}>Yes</button>
              <button type="button" className={`tick-btn ${v.minStandard === false ? 'active-fail' : ''}`} disabled={disabled} onClick={() => onChange({ ...v, minStandard: false })}>No</button>
            </div>
          </div>
        </div>
        <div className="field" style={{ margin: '8px 0 0' }}>
          <label>Comments</label>
          <input defaultValue={v.comments || ''} disabled={disabled} onBlur={(e) => onChange({ ...v, comments: e.target.value })} />
        </div>
      </div>
    );
  }

  if (kind === 'yesno') {
    return (
      <div className="card" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 13, flex: 1 }}>{description}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" className={`tick-btn ${v.observation === true ? 'active-pass' : ''}`} disabled={disabled} onClick={() => onChange({ ...v, observation: true })}>Yes</button>
            <button type="button" className={`tick-btn ${v.observation === false ? 'active-fail' : ''}`} disabled={disabled} onClick={() => onChange({ ...v, observation: false })}>No</button>
          </div>
        </div>
        <div className="field" style={{ margin: '8px 0 0' }}>
          <label>Comments</label>
          <input defaultValue={v.comments || ''} disabled={disabled} onBlur={(e) => onChange({ ...v, comments: e.target.value })} />
        </div>
      </div>
    );
  }

  // 'satisfactory'
  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 13, flex: 1 }}>{description}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" className={`tick-btn ${v.satisfactory === true ? 'active-pass' : ''}`} disabled={disabled} onClick={() => onChange({ ...v, satisfactory: true })}>Satisfactory</button>
          <button type="button" className={`tick-btn ${v.satisfactory === false ? 'active-fail' : ''}`} disabled={disabled} onClick={() => onChange({ ...v, satisfactory: false })}>Unsatisfactory</button>
        </div>
      </div>
      <div className="field" style={{ margin: '8px 0 0' }}>
        <label>Comments</label>
        <input defaultValue={v.comments || ''} disabled={disabled} onBlur={(e) => onChange({ ...v, comments: e.target.value })} />
      </div>
    </div>
  );
}

const emptyDetails = (variant) => ({ variant, date: '', items: {}, recommendation: '', assessorComments: '', assessorSig: '', candidateSig: '' });

// A LOFT trainee flagged as a Captain candidate from the start (see
// Trainees.jsx's Captain role option) gets this on their own LOFT tab via
// traineeId, scoped exactly like the crewMemberId path used for an
// already-qualified First Officer upgrading later - same form either way,
// just a different subject.
export function CaptainInTrainingForm({ variant, crewMemberId, traineeId, crewMemberName, fleet, archived = false, crewArchived = false }) {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const [checks, setChecks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ date: '', assignedTo: '' });
  const [error, setError] = useState(null);
  const subjectParam = crewMemberId ? `crewMemberId=${crewMemberId}` : `traineeId=${traineeId}`;
  const candidatePersonType = crewMemberId ? 'crewMember' : 'trainee';
  const candidatePersonId = crewMemberId || traineeId;

  function load() {
    api.get(`/api/checks?checkType=CAPTAIN_IN_TRAINING&archived=${archived}&${subjectParam}`)
      .then((all) => setChecks(all.filter((c) => c.details?.variant === variant)))
      .catch((e) => setError(e.message));
  }
  useEffect(load, [variant, archived, crewMemberId, traineeId]);

  const selected = checks.find((c) => c.id === selectedId);
  const sections = sectionsFor(variant);
  const recommendations = variant === 'PRELIMINARY' ? PRELIM_RECOMMENDATIONS : FINAL_RECOMMENDATIONS;
  const label = VARIANT_LABELS[variant];

  async function createCheck(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/api/checks', {
        checkType: 'CAPTAIN_IN_TRAINING', appliesTo: 'PILOT',
        ...(crewMemberId ? { crewMemberId } : { traineeId }),
        assignedTo: newForm.assignedTo || undefined,
        details: { ...emptyDetails(variant), date: newForm.date },
      });
      setCreating(false);
      setNewForm({ date: '', assignedTo: '' });
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

  function setItemValue(check, key, value) {
    patchDetails(check, { items: { ...(check.details?.items || {}), [key]: value } });
  }

  async function setRecommendation(check, recommendation) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, {
        details: { ...check.details, recommendation },
        result: resultFor(variant, recommendation),
        completedAt: new Date().toISOString(),
      });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) { setError(err.message); }
  }

  async function reassign(check, staffMember) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, { assignedTo: staffMember?.id || null });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) { setError(err.message); }
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

  function printCheck(check) {
    const d = check.details || {};
    const items = d.items || {};
    let body = `<h1>${label}</h1><div class="meta">${crewMemberName} · ${d.date || ''}</div>`;
    for (const s of sections) {
      body += section(s.title, s.items.map((desc) => {
        const v = items[desc] || {};
        const mark = s.kind === 'satisfactory' ? (v.satisfactory === true ? 'Satisfactory' : v.satisfactory === false ? 'Unsatisfactory' : '')
          : s.kind === 'yesno' ? (v.observation === true ? 'Yes' : v.observation === false ? 'No' : '')
            : `${v.observation || ''}${v.minStandard !== undefined ? ` (Min standard: ${v.minStandard ? 'Yes' : 'No'})` : ''}`;
        return [desc, `${mark}${v.comments ? ` — ${v.comments}` : ''}`];
      }));
    }
    body += section('Overall Assessment', [
      ['Final Recommendation', d.recommendation || ''],
      ['Assessor Comments', d.assessorComments || ''],
      ['Overall assessment', resultBadge(check.result)],
    ]);
    body += signatureBlock([['Assessor signature', d.assessorSig], ['Candidate signature', d.candidateSig]]);
    openPrintWindow(`${label} - ${crewMemberName}`, body);
  }

  if (selected) {
    const d = selected.details || {};
    const items = d.items || {};
    const locked = !!selected.completedAt;
    const allItemsAnswered = sections.every((s) => s.items.every((desc) => isAnswered(s.kind, items[desc])));

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <button onClick={() => setSelectedId(null)}>← Back</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {(selected.archived || selected.completedAt) && <PrintButton onPrint={() => printCheck(selected)} />}
            <ArchiveButton archived={selected.archived} canArchive={!!selected.result} onArchive={() => archiveCheck(selected)} onUnarchive={() => unarchiveCheck(selected)} />
            <DeleteButton archived={selected.archived} onDelete={() => deleteCheck(selected)} />
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 16, fontWeight: 500 }}>{crewMemberName} — {label}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.date ? formatDate(d.date) : 'No date'}</div>
        </div>

        <div className="card">
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {selected.assignedToName ? `${selected.assignedToRole ? formatUserRole(selected.assignedToRole) : 'Assessor'} ${selected.assignedToName}${selected.assignedToArn ? ` · ARN ${selected.assignedToArn}` : ''}` : 'Unassigned'}
          </div>
          <AssignedToPicker value={selected.assignedTo} accessType="IPC" fleet={fleet} onAssign={(s) => reassign(selected, s)} />
        </div>

        {sections.map((s) => (
          <div key={s.title} className="card">
            <div style={{ fontWeight: 500, marginBottom: 8 }}>{s.title}</div>
            {s.items.map((desc) => (
              <ItemRow
                key={desc} kind={s.kind} description={desc} value={items[desc]} disabled={locked}
                onChange={(v) => setItemValue(selected, desc, v)}
              />
            ))}
          </div>
        ))}

        <div className="card">
          <div className="field"><label>Assessor comments</label><textarea defaultValue={d.assessorComments} disabled={locked} onBlur={(e) => patchDetails(selected, { assessorComments: e.target.value })} style={{ minHeight: 70 }} /></div>
          <div className="grid2">
            {selected.assignedTo ? (
              <PinSignature
                label="Assessor signature" personType="user" personId={selected.assignedTo}
                signedName={d.assessorSig} signedAt={d.assessorSigAt} disabled={locked}
                onSigned={(name, at) => patchDetails(selected, { assessorSig: name, assessorSigAt: at })}
              />
            ) : (
              <div className="field"><label>Assessor signature</label><input defaultValue={d.assessorSig} disabled={locked} onBlur={(e) => patchDetails(selected, { assessorSig: e.target.value })} /></div>
            )}
            <PinSignature
              label="Candidate signature" personType={candidatePersonType} personId={candidatePersonId}
              signedName={d.candidateSig} signedAt={d.candidateSigAt} disabled={locked}
              onSigned={(name, at) => patchDetails(selected, { candidateSig: name, candidateSigAt: at })}
            />
          </div>
        </div>

        {!locked && (
          <div className="card" style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)', fontSize: 12 }}>
            DO NOT SELECT UNTIL ALL THE FORM HAS BEEN COMPLETED. SELECTING THIS WILL LOCK THE FORM.
          </div>
        )}
        {!locked && !allItemsAnswered && (
          <div className="card" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Every item above must be answered before the final recommendation can be set.
          </div>
        )}
        <div className="card">
          <div className="field">
            <label>Final Recommendation</label>
            <select disabled={locked || !allItemsAnswered} value={d.recommendation || ''} onChange={(e) => setRecommendation(selected, e.target.value || '')}>
              <option value="">—</option>
              {recommendations.map((r) => <option key={r} value={r}>{r}</option>)}
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
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{archived ? `Archived ${label.toLowerCase()} records` : label}</div>
        {!archived && !crewArchived && isAdmin && <button onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'Assign assessment'}</button>}
      </div>

      {!archived && creating && (
        <form className="card" onSubmit={createCheck}>
          <div className="field"><label>Date</label><input type="date" value={newForm.date} onChange={(e) => setNewForm({ ...newForm, date: e.target.value })} /></div>
          <AssignedToPicker value={newForm.assignedTo} accessType="IPC" fleet={fleet} onAssign={(s) => setNewForm((f) => ({ ...f, assignedTo: s?.id || '' }))} />
          <button type="submit" className="primary">Create check record</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {checks.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No {archived ? 'archived ' : ''}{label.toLowerCase()} records yet.</div>}
      {checks.map((c) => (
        <div key={c.id} className="card row" onClick={() => setSelectedId(c.id)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{c.details?.date ? formatDate(c.details.date) : 'No date'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.assignedToName ? `Assessor: ${c.assignedToName}` : 'Unassigned'}</div>
          </div>
          {c.result && <span className={`badge ${c.result === 'PASS' ? 'pass' : 'fail'}`}>{c.result}</span>}
        </div>
      ))}
    </div>
  );
}
