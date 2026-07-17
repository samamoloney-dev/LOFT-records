import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { PinSignature } from '../components/PinSignature';
import { ArchiveButton } from '../components/ArchiveButton';
import { DeleteButton } from '../components/DeleteButton';
import { PrintButton } from '../components/PrintButton';
import { TabBar } from '../components/TabBar';
import { openPrintWindow, section, signatureBlock, resultBadge } from '../lib/print';
import { formatDate, formatUserRole } from '../lib/format';
import { UPGRADE_VARIANTS, UPGRADE_CHECKER_ROLES } from '../lib/roles';
import { visibleCheckFormItems } from '../lib/checkFormItems';

// One tab per "page" of the paper upgrade package, same idea as the LOFT
// package's own tab bar - Briefing, (Simulator, Training Captain only, see
// FSM E5.2.3 on SA 507), then the three flight-log stages (Observation/
// Training/Check), with the final recommendation and signatures living on
// the Check tab since that's the paper form's last page too.
const UPGRADE_SUB_TABS = [
  { key: 'BRIEFING', label: 'Briefing' },
  { key: 'OBSERVATION', label: 'Observation' },
  { key: 'TRAINING', label: 'Training' },
  { key: 'CHECK', label: 'Check' },
];

// SA 507's FSM E5.2.3 simulator training page (General Handling +
// Simulated Control Difficulty) has no equivalent on the Check Captain/
// Cabin Attendant upgrade forms - Training Captain only.
function subTabsFor(variant) {
  if (variant !== 'TRAINING_CAPTAIN') return UPGRADE_SUB_TABS;
  return [
    UPGRADE_SUB_TABS[0],
    { key: 'SIMULATOR', label: 'Simulator' },
    ...UPGRADE_SUB_TABS.slice(1),
  ];
}

// HOTC/HOFO/Alternate are always eligible to assess an upgrade regardless
// of fleet, same as everywhere else in the app - Flight Ops Admin is
// deliberately excluded, they cannot conduct any checking. Everyone else
// needs to actually hold a checker/examiner role, and (when a fleet is
// known) a matching fleet tick - this is role-based, not the checkAccess
// tick system AssignedToPicker/isEligibleForCheck uses elsewhere, since
// "who can assess an upgrade" is about holding CC/EXAMINER/CA_CHECKER/
// CA_MANAGER, not an ad hoc per-check-type tick.
const ALWAYS_ELIGIBLE_ASSESSOR_ROLES = ['HOTC', 'HOFO', 'ALTERNATE'];
function isEligibleUpgradeAssessor(staffMember, fleet) {
  if (ALWAYS_ELIGIBLE_ASSESSOR_ROLES.includes(staffMember.role)) return true;
  if (!UPGRADE_CHECKER_ROLES.includes(staffMember.role)) return false;
  return !fleet || (staffMember.fleets || []).includes(fleet);
}

function UpgradeAssessorPicker({ value, fleet, onAssign }) {
  const [staff, setStaff] = useState([]);
  useEffect(() => { api.get('/api/users/roster').then(setStaff).catch(() => {}); }, []);
  const eligible = staff.filter((s) => isEligibleUpgradeAssessor(s, fleet));
  return (
    <div className="field">
      <label>Assessor</label>
      <select value={value || ''} onChange={(e) => onAssign(eligible.find((s) => s.id === e.target.value) || null)}>
        <option value="">— Unassigned —</option>
        {eligible.map((s) => <option key={s.id} value={s.id}>{s.name} ({formatUserRole(s.role)})</option>)}
      </select>
    </div>
  );
}

// Upgrade Records (SA 507 Training Captain, SA 510 Check Captain, SA 522
// Training Cabin Attendant, SA 523 Check Cabin Attendant) - one shared
// checkType (UPGRADE_RECORD) with a details.variant, same pattern as
// Captain in Training's PRELIMINARY/FINAL. The real paper forms are a long
// sequence of fixed-page flight blocks (Observation, Training, Check) -
// condensed here into one add-as-you-go flight log instead of hardcoding
// page counts, so a candidate needing more or fewer flights than the
// minimum doesn't need extra "pages".
const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];

// Minimum flight counts per stage, per the operator's explicit requirement
// - shown as guidance (a running tally), not a hard gate, since real
// candidates sometimes need more with a supervisor's sign-off.
const FLIGHT_STAGES = [
  { key: 'OBSERVATION', label: 'Observation', min: 2 },
  { key: 'TRAINING', label: 'Training', min: 2 },
  { key: 'CHECK', label: 'Check', min: 1 },
];

const RECOMMENDATIONS = [
  'Candidate is recommended for upgrade',
  'Additional training required',
  'Standard not yet met',
];

function resultFor(recommendation) {
  if (!recommendation) return null;
  return recommendation === RECOMMENDATIONS[0] ? 'PASS' : 'FAIL';
}

function emptyDetails(variant) {
  return {
    variant, date: '', briefingItems: {}, briefingComments: '',
    simulatorItems: {}, simulatorOtherTraining: '',
    flights: [], recommendation: '', assessorComments: '',
    assessorSig: '', candidateSig: '',
  };
}

function emptyFlight(stage) {
  return { id: crypto.randomUUID(), stage, date: '', route: '', aircraft: '', airborneTime: '', topic: '', comments: '', areasOfImprovement: '', nextSortie: '' };
}

function BriefingItemRow({ description, value, disabled, onChange }) {
  const v = value || {};
  return (
    <div className="row" style={{ cursor: 'default' }}>
      <div style={{ fontSize: 13, flex: 1 }}>{description}</div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button type="button" className={`tick-btn ${v.tick === true ? 'active-pass' : ''}`} disabled={disabled} onClick={() => onChange({ tick: true })}>Yes</button>
        <button type="button" className={`tick-btn ${v.tick === false ? 'active-fail' : ''}`} disabled={disabled} onClick={() => onChange({ tick: false })}>No</button>
      </div>
    </div>
  );
}

function FlightRow({ flight, disabled, onChange, onRemove }) {
  const stageConfig = FLIGHT_STAGES.find((s) => s.key === flight.stage);
  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 500, fontSize: 13 }}>{stageConfig?.label || flight.stage}</div>
        {!disabled && <button type="button" className="danger" onClick={onRemove}>Remove</button>}
      </div>
      <div className="grid2">
        <div className="field" style={{ margin: 0 }}><label>Date</label><input type="date" value={flight.date} disabled={disabled} onChange={(e) => onChange({ ...flight, date: e.target.value })} /></div>
        <div className="field" style={{ margin: 0 }}><label>Route</label><input value={flight.route} disabled={disabled} onChange={(e) => onChange({ ...flight, route: e.target.value })} /></div>
      </div>
      <div className="grid2">
        <div className="field" style={{ margin: 0 }}><label>Aircraft / SIM</label><input value={flight.aircraft} disabled={disabled} onChange={(e) => onChange({ ...flight, aircraft: e.target.value })} /></div>
        <div className="field" style={{ margin: 0 }}><label>Airborne time</label><input value={flight.airborneTime} disabled={disabled} onChange={(e) => onChange({ ...flight, airborneTime: e.target.value })} /></div>
      </div>
      <div className="field"><label>Topic</label><input value={flight.topic} disabled={disabled} onChange={(e) => onChange({ ...flight, topic: e.target.value })} /></div>
      <div className="field"><label>Comments</label><input value={flight.comments} disabled={disabled} onChange={(e) => onChange({ ...flight, comments: e.target.value })} /></div>
      {flight.stage === 'TRAINING' && (
        <div className="grid2">
          <div className="field" style={{ margin: 0 }}><label>Areas of improvement</label><input value={flight.areasOfImprovement} disabled={disabled} onChange={(e) => onChange({ ...flight, areasOfImprovement: e.target.value })} /></div>
          <div className="field" style={{ margin: 0 }}><label>Next sortie</label><input value={flight.nextSortie} disabled={disabled} onChange={(e) => onChange({ ...flight, nextSortie: e.target.value })} /></div>
        </div>
      )}
    </div>
  );
}

// crewMemberId is the candidate (a line Captain/Cabin Attendant, whether or
// not they're already linked to a staff account - see checks.js POST
// /:id/apply-upgrade, which requires that link before it can update their
// role/seed their Personnel Air Competency date).
export function UpgradeRecordForm({ variant, crewMemberId, crewMemberName, fleet, crewIsLinked, archived = false }) {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const canCreate = isAdmin || UPGRADE_CHECKER_ROLES.includes(user.role);
  const [checks, setChecks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [subTab, setSubTab] = useState(UPGRADE_SUB_TABS[0].key);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ date: '', assignedTo: '' });
  const [error, setError] = useState(null);
  const [applyNotice, setApplyNotice] = useState(null);

  // Always land back on Briefing when opening a (possibly different) record.
  useEffect(() => { setSubTab(UPGRADE_SUB_TABS[0].key); }, [selectedId]);

  const variantConfig = UPGRADE_VARIANTS[variant];
  const label = variantConfig.label;

  // The briefing checklist is editable from the Syllabus tab (Check Forms)
  // rather than fixed in source - see check-form-items.js's
  // UPGRADE_TRAINING_CAPTAIN/UPGRADE_CHECK_CAPTAIN/UPGRADE_TRAINING_CABIN_ATTENDANT/
  // UPGRADE_CHECK_CABIN_ATTENDANT form keys. Results are keyed by each
  // item's id instead of its description text.
  const [allBriefingItems, setAllBriefingItems] = useState([]);
  useEffect(() => {
    api.get(`/api/check-form-items?formKey=UPGRADE_${variant}&includeArchived=true`).then(setAllBriefingItems).catch(() => {});
  }, [variant]);

  // Simulator training (SA 507 FSM E5.2.3) - Training Captain only, same
  // editable-from-Syllabus pattern as the briefing checklist above.
  const [allSimulatorItems, setAllSimulatorItems] = useState([]);
  useEffect(() => {
    if (variant !== 'TRAINING_CAPTAIN') { setAllSimulatorItems([]); return; }
    api.get('/api/check-form-items?formKey=UPGRADE_TRAINING_CAPTAIN_SIMULATOR&includeArchived=true').then(setAllSimulatorItems).catch(() => {});
  }, [variant]);

  function load() {
    api.get(`/api/checks?checkType=UPGRADE_RECORD&archived=${archived}&crewMemberId=${crewMemberId}`)
      .then((all) => setChecks(all.filter((c) => c.details?.variant === variant)))
      .catch((e) => setError(e.message));
  }
  useEffect(load, [variant, archived, crewMemberId]);

  const selected = checks.find((c) => c.id === selectedId);

  async function createCheck(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/api/checks', {
        checkType: 'UPGRADE_RECORD', appliesTo: variantConfig.crewType,
        crewMemberId,
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

  function setBriefingItem(check, key, value) {
    patchDetails(check, { briefingItems: { ...(check.details?.briefingItems || {}), [key]: value } });
  }

  function setSimulatorItem(check, key, value) {
    patchDetails(check, { simulatorItems: { ...(check.details?.simulatorItems || {}), [key]: value } });
  }

  function addFlight(check, stage) {
    patchDetails(check, { flights: [...(check.details?.flights || []), emptyFlight(stage)] });
  }
  function updateFlight(check, id, patch) {
    patchDetails(check, { flights: (check.details?.flights || []).map((f) => (f.id === id ? patch : f)) });
  }
  function removeFlight(check, id) {
    patchDetails(check, { flights: (check.details?.flights || []).filter((f) => f.id !== id) });
  }

  async function setRecommendation(check, recommendation) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, {
        details: { ...check.details, recommendation },
        result: resultFor(recommendation),
        completedAt: new Date().toISOString(),
      });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) { setError(err.message); }
  }

  async function applyUpgrade(check) {
    setError(null);
    setApplyNotice(null);
    try {
      const updated = await api.post(`/api/checks/${check.id}/apply-upgrade`);
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
      setApplyNotice(`Staff record updated - ${crewMemberName} is now ${formatUserRole(variantConfig.targetRole)}, and their Personnel (Air) Competency Check is now current for 24 months.`);
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
    const items = d.briefingItems || {};
    let body = `<h1>${label}</h1><div class="meta">${crewMemberName} · ${d.date ? formatDate(d.date) : ''}</div>`;
    body += section('Briefing', [
      ...visibleCheckFormItems(allBriefingItems, items).map((item) => {
        const v = items[item.id] || {};
        const mark = v.tick === true ? 'Yes' : v.tick === false ? 'No' : '';
        return [item.description, mark];
      }),
      ['Comments', d.briefingComments || ''],
    ]);
    if (variant === 'TRAINING_CAPTAIN') {
      const simItems = d.simulatorItems || {};
      body += section('Required Simulator Training', [
        ...visibleCheckFormItems(allSimulatorItems, simItems).map((item) => {
          const v = simItems[item.id] || {};
          const mark = v.tick === true ? 'Yes' : v.tick === false ? 'No' : '';
          return [item.description, mark];
        }),
        ['Optional simulator training', d.simulatorOtherTraining || ''],
      ]);
    }
    for (const stage of FLIGHT_STAGES) {
      const rows = (d.flights || []).filter((f) => f.stage === stage.key);
      if (rows.length === 0) continue;
      body += section(stage.label, rows.map((f, i) => [
        `Flight ${i + 1} — ${f.date ? formatDate(f.date) : ''}`,
        [f.route, f.aircraft, f.airborneTime, f.topic, f.comments, f.areasOfImprovement, f.nextSortie].filter(Boolean).join(' — '),
      ]));
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
    const items = d.briefingItems || {};
    const simItems = d.simulatorItems || {};
    const flights = d.flights || [];
    const locked = !!selected.completedAt;
    const briefingItems = visibleCheckFormItems(allBriefingItems, items);
    const allBriefingAnswered = briefingItems.length > 0 && briefingItems.every((item) => items[item.id]?.tick !== undefined);
    const simulatorItems = visibleCheckFormItems(allSimulatorItems, simItems);
    const simulatorBySection = simulatorItems.reduce((acc, item) => {
      (acc[item.section || 'General Handling'] ||= []).push(item);
      return acc;
    }, {});
    const canApply = selected.result === 'PASS' && selected.completedAt && !d.staffRecordUpdatedAt;

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
          <UpgradeAssessorPicker value={selected.assignedTo} fleet={fleet} onAssign={(s) => reassign(selected, s)} />
        </div>

        <TabBar tabs={subTabsFor(variant)} active={subTab} onSelect={setSubTab} />

        {subTab === 'BRIEFING' && (
          <div className="card">
            <div style={{ fontWeight: 500, marginBottom: 8 }}>Briefing</div>
            {briefingItems.map((item) => (
              <BriefingItemRow key={item.id} description={item.description} value={items[item.id]} disabled={locked} onChange={(v) => setBriefingItem(selected, item.id, v)} />
            ))}
            <div className="field"><label>Briefing comments</label><textarea defaultValue={d.briefingComments} disabled={locked} onBlur={(e) => patchDetails(selected, { briefingComments: e.target.value })} style={{ minHeight: 60 }} /></div>
          </div>
        )}

        {subTab === 'SIMULATOR' && variant === 'TRAINING_CAPTAIN' && (
          <div className="card">
            <div style={{ fontWeight: 500, marginBottom: 8 }}>Required Simulator Training</div>
            {Object.entries(simulatorBySection).map(([sectionName, sectionItems]) => (
              <div key={sectionName} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{sectionName}</div>
                {sectionItems.map((item) => (
                  <BriefingItemRow key={item.id} description={item.description} value={simItems[item.id]} disabled={locked} onChange={(v) => setSimulatorItem(selected, item.id, v)} />
                ))}
              </div>
            ))}
            {simulatorItems.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No required simulator training items configured yet - add them from Syllabus &gt; Check Forms.</div>
            )}
            <div className="field">
              <label>Optional simulator training (any additional simulator sessions conducted)</label>
              <textarea defaultValue={d.simulatorOtherTraining} disabled={locked} onBlur={(e) => patchDetails(selected, { simulatorOtherTraining: e.target.value })} style={{ minHeight: 60 }} />
            </div>
          </div>
        )}

        {['OBSERVATION', 'TRAINING', 'CHECK'].includes(subTab) && (() => {
          const stage = FLIGHT_STAGES.find((s) => s.key === subTab);
          const rows = flights.filter((f) => f.stage === stage.key);
          return (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 500 }}>{stage.label} <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: 12 }}>({rows.length}/{stage.min} min)</span></div>
                {!locked && <button type="button" onClick={() => addFlight(selected, stage.key)}>+ Add flight</button>}
              </div>
              {rows.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No flights logged yet.</div>}
              {rows.map((f) => (
                <FlightRow key={f.id} flight={f} disabled={locked} onChange={(patch) => updateFlight(selected, f.id, patch)} onRemove={() => removeFlight(selected, f.id)} />
              ))}
            </div>
          );
        })()}

        {subTab === 'CHECK' && (
          <>
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
                  label="Candidate signature" personType="crewMember" personId={crewMemberId}
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
            {!locked && !allBriefingAnswered && (
              <div className="card" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Every briefing item on the Briefing tab must be answered before the final recommendation can be set.
              </div>
            )}
            <div className="card">
              <div className="field">
                <label>Final Recommendation</label>
                <select disabled={locked || !allBriefingAnswered} value={d.recommendation || ''} onChange={(e) => setRecommendation(selected, e.target.value || '')}>
                  <option value="">—</option>
                  {RECOMMENDATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            {selected.completedAt && (
              <div className="card">
                <div style={{ fontWeight: 500, marginBottom: 8 }}>Staff record</div>
                {d.staffRecordUpdatedAt ? (
                  <div style={{ fontSize: 13, color: 'var(--text-success)' }}>
                    Staff record updated {formatDate(d.staffRecordUpdatedAt)} — {crewMemberName} is now {formatUserRole(variantConfig.targetRole)}.
                  </div>
                ) : canApply ? (
                  crewIsLinked ? (
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        Passing this record means {crewMemberName} should now be {formatUserRole(variantConfig.targetRole)}, with their Personnel (Air) Competency Check current for 24 months from today.
                      </div>
                      <button className="primary" onClick={() => applyUpgrade(selected)}>Update Staff Role to {formatUserRole(variantConfig.targetRole)}</button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-warning)' }}>
                      {crewMemberName} doesn't have a staff account yet - add them via the Staff tab (tick "This is an existing crew member"), then come back here to update their role and Personnel Competency date.
                    </div>
                  )
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Only applies once the final recommendation is "{RECOMMENDATIONS[0]}".</div>
                )}
                {applyNotice && <div style={{ fontSize: 12, color: 'var(--text-success)', marginTop: 6 }}>{applyNotice}</div>}
              </div>
            )}
          </>
        )}
        {error && <div className="error-text">{error}</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{archived ? `Archived ${label.toLowerCase()} records` : label}</div>
        {!archived && canCreate && <button onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'Start upgrade record'}</button>}
      </div>

      {!archived && creating && (
        <form className="card" onSubmit={createCheck}>
          <div className="field"><label>Date</label><input type="date" value={newForm.date} onChange={(e) => setNewForm({ ...newForm, date: e.target.value })} /></div>
          <UpgradeAssessorPicker value={newForm.assignedTo} fleet={fleet} onAssign={(s) => setNewForm((f) => ({ ...f, assignedTo: s?.id || '' }))} />
          <button type="submit" className="primary">Create upgrade record</button>
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
