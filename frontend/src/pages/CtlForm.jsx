import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatUserRole } from '../lib/format';
import { AssignedToPicker } from '../components/AssignedToPicker';
import { PinSignature } from '../components/PinSignature';
import { ArchiveButton } from '../components/ArchiveButton';
import { PrintButton } from '../components/PrintButton';
import { ReferenceDocIcon } from '../components/ReferenceDocIcon';
import { openPrintWindow } from '../lib/print';
import { buildCtlFormHtml } from '../lib/printBuilders';
import { visibleCheckFormItems } from '../lib/checkFormItems';

// Check to Line Preparation Checklist, from SA_541 Cabin Crew Dash 8 Line
// Training Record.
const CA_ASSESSMENT_ITEMS = [
  'Competent on all duties and procedures from sign on to sign off without any assistance',
  'Knowledge on all Rules and Regulations is up to standard',
  'Knowledge on all Emergency Procedures is up to standard',
  'Knowledge on all Emergency and Survival Equipment is up to standard',
  'Knowledge on Aviation Medicine and First Aid is up to standard',
  'Satisfactorily completed all items of the training record and discussion list; recommended for a Check to Line',
];

const STATUSES = [
  { value: 'SATISFACTORY', label: '✓' },
  { value: 'UNSATISFACTORY', label: '✗' },
  { value: 'NA', label: 'N/A' },
];

function itemKey(item) {
  return item.id;
}

// Check to Line is its own check flight(s) - a separate, later stage from
// Phase 4 training (see the operator's explicit correction) - so route,
// aircraft, date and flight time are this examiner's own entries. Only the
// progressive total's starting point carries over, continuing the running
// LOFT-hours tally on from wherever Phase 4 finished (see the sync effect
// in CtlForm below).
function SectorFields({ label, value, progressiveLabel, disabled, onChange }) {
  const v = value || {};
  const update = (field, fieldValue) => onChange({ ...v, [field]: fieldValue });
  // Route/Aircraft/hours are typed character by character, but each
  // keystroke was round-tripping straight to the server and back
  // (value={v.route} bound directly to the saved record) - a slow or
  // out-of-order response could overwrite what's since been typed,
  // dropping characters or jumping the cursor. Buffering in local state and
  // only saving on blur (same pattern as FlightRow.jsx's Route field) fixes
  // that without changing what gets saved.
  const [route, setRoute] = useState(v.route || '');
  const [aircraft, setAircraft] = useState(v.aircraft || '');
  const [thisFlight, setThisFlight] = useState(v.thisFlight || '');
  // Date wasn't included in the fix above, but has the same problem in a
  // worse form - a date input fires onChange on every keystroke while
  // typing a year digit by digit, including intermediate states the
  // browser reports as empty before the year is fully typed, and each of
  // those was round-tripping straight to the server (see DocumentsTab's
  // identical fix in CrewDetail.jsx). This date also drives the overdue
  // check-form alert's "last sector flown" trigger (checks.js), so a
  // corrupted value here doesn't just look wrong - it changes when that
  // alert fires.
  const [date, setDate] = useState(v.date || '');

  return (
    <div className="card">
      <div style={{ fontWeight: 500, marginBottom: 6 }}>{label}</div>
      <div className="grid2">
        <div className="field">
          <label>Route</label>
          <input disabled={disabled} value={route} onChange={(e) => setRoute(e.target.value)} onBlur={() => update('route', route)} />
        </div>
        <div className="field">
          <label>Aircraft (type & rego)</label>
          <input disabled={disabled} value={aircraft} onChange={(e) => setAircraft(e.target.value)} onBlur={() => update('aircraft', aircraft)} />
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>Date</label>
          <input type="date" disabled={disabled} value={date} onChange={(e) => setDate(e.target.value)} onBlur={() => update('date', date)} />
        </div>
        <div className="field">
          <label>Flight time (this flight)</label>
          <input type="number" step="0.1" disabled={disabled} value={thisFlight} onChange={(e) => setThisFlight(e.target.value)} onBlur={() => update('thisFlight', thisFlight)} />
        </div>
      </div>
      <div className="field">
        <label>Flight time ({progressiveLabel})</label>
        <div style={{ fontSize: 14, padding: '6px 0' }}>{v.progressiveTotal ?? 0}h</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Continues on from Phase 4's final total - not editable here.</div>
      </div>
    </div>
  );
}

export function CtlForm({ traineeId, traineeType, fleet, onCompleted }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const isCabinAttendant = traineeType === 'CABIN_ATTENDANT';

  function load() {
    api.get(`/api/ctl/${traineeId}`).then(setData).catch((e) => setError(e.message));
  }
  useEffect(load, [traineeId]);

  // Flight Ops Admin excluded - Check to Line is a check, and they cannot
  // conduct any checking.
  const canEdit = ['HOTC', 'HOFO', 'ALTERNATE', 'EXAMINER'].includes(user.role);
  const form = data?.form || { assessmentItems: {}, sectorDetails: {}, ntsScores: {}, comments: '', overallResult: null, overallScore: null };

  async function save(patch) {
    setError(null);
    try {
      const updated = await api.put(`/api/ctl/${traineeId}`, patch);
      setData((d) => ({ ...d, form: updated }));
    } catch (err) { setError(err.message); }
  }

  function updateSector(key, value) {
    save({ sectorDetails: { ...form.sectorDetails, [key]: value } });
  }

  // Check to Line is a separate check flight from Phase 4 training, not a
  // re-documenting of the same sectors - route/aircraft/date/flight time
  // here are this examiner's own entries. Only the progressive total
  // continues the running LOFT-hours tally on from wherever Phase 4's
  // final total left off, then amends as this form's own flight time is
  // entered (same chaining as Phase4Form). Pilots only - cabin attendants
  // have no Phase 4.
  const [phase4Data, setPhase4Data] = useState(null);
  useEffect(() => {
    if (isCabinAttendant) return;
    api.get(`/api/phase4/${traineeId}`).then(setPhase4Data).catch(() => {});
  }, [traineeId, isCabinAttendant]);

  const round1 = (n) => Math.round(n * 10) / 10;
  const ctlThisFlight12 = Number(form.sectorDetails?.sectors12?.thisFlight) || 0;
  const ctlThisFlight34 = Number(form.sectorDetails?.sectors34?.thisFlight) || 0;
  useEffect(() => {
    if (isCabinAttendant || !canEdit || !data || !phase4Data?.assessment) return;
    const baseline = Number(phase4Data.assessment.sectorDetails?.sectors34?.progressiveTotal) || 0;
    const progressive12 = round1(baseline + ctlThisFlight12);
    const progressive34 = round1(progressive12 + ctlThisFlight34);

    const patch = {};
    if (form.sectorDetails?.sectors12?.progressiveTotal !== progressive12) {
      patch.sectors12 = { ...form.sectorDetails?.sectors12, progressiveTotal: progressive12 };
    }
    if (form.sectorDetails?.sectors34?.progressiveTotal !== progressive34) {
      patch.sectors34 = { ...form.sectorDetails?.sectors34, progressiveTotal: progressive34 };
    }
    if (Object.keys(patch).length > 0) {
      save({ sectorDetails: { ...form.sectorDetails, ...patch } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase4Data, data, canEdit, isCabinAttendant, ctlThisFlight12, ctlThisFlight34]);

  // Cabin attendant items stay a simple boolean pass/fail tick.
  async function setCaItem(item, value) {
    const next = { ...form.assessmentItems };
    next[item] = next[item] === value ? undefined : value;
    await save({ assessmentItems: next });
  }

  async function setItemStatus(item, status) {
    const key = itemKey(item);
    const next = { ...form.assessmentItems, [key]: status === form.assessmentItems[key] ? undefined : status };
    await save({ assessmentItems: next });
  }

  async function setItemText(item, value) {
    const key = itemKey(item);
    await save({ assessmentItems: { ...form.assessmentItems, [key]: value } });
  }

  function updateNts(marker, value) {
    save({ ntsScores: { ...form.ntsScores, [marker]: value } });
  }

  async function setResult(overallResult) {
    await save({ overallResult });
  }

  async function complete() {
    setError(null);
    try {
      await api.post(`/api/ctl/${traineeId}/complete`);
      onCompleted();
    } catch (err) { setError(err.message); }
  }

  async function assign(staffMember) {
    await save({ assignedTo: staffMember?.id || null });
  }

  async function archiveForm() {
    setError(null);
    try {
      const updated = await api.post(`/api/ctl/${traineeId}/archive`);
      setData((d) => ({ ...d, form: { ...d.form, ...updated } }));
    } catch (err) { setError(err.message); }
  }

  async function unarchiveForm() {
    setError(null);
    try {
      const updated = await api.post(`/api/ctl/${traineeId}/unarchive`);
      setData((d) => ({ ...d, form: { ...d.form, ...updated } }));
    } catch (err) { setError(err.message); }
  }

  if (!data) return null;

  // Includes archived items too, but only ones this particular form already
  // answered - retiring an item from the active catalog must never erase a
  // historical Check to Line's ticked answer (see lib/checkFormItems.js).
  const visibleItems = visibleCheckFormItems(data.items, form.assessmentItems);
  const grouped = new Map();
  if (!isCabinAttendant) {
    for (const item of visibleItems) {
      if (!grouped.has(item.section)) grouped.set(item.section, []);
      grouped.get(item.section).push(item);
    }
  }

  const allItemsAnswered = isCabinAttendant
    ? CA_ASSESSMENT_ITEMS.every((item) => form.assessmentItems[item] !== undefined)
    : visibleItems.length > 0 && visibleItems.every((item) => form.assessmentItems[itemKey(item)] !== undefined);

  function printForm() {
    openPrintWindow('Check to Line Assessment', buildCtlFormHtml(data, traineeType));
  }

  const locked = !canEdit || !!form.completedAt;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 500 }}>Check to Line Assessment</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(form.archived || form.completedAt) && <PrintButton onPrint={printForm} />}
          <ArchiveButton
            archived={form.archived}
            canArchive={!!form.completedAt}
            onArchive={archiveForm}
            onUnarchive={unarchiveForm}
          />
          <button onClick={() => setOpen((v) => !v)}>{open ? 'Close' : 'Open'}</button>
        </div>
      </div>
      {form.completedAt && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Completed {formatDate(form.completedAt)}</div>}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
        {form.assignedToName ? `${form.assignedToRole ? formatUserRole(form.assignedToRole) : 'Assigned to'} ${form.assignedToName}${form.assignedToArn ? ` · ARN ${form.assignedToArn}` : ''}` : 'Unassigned'}
      </div>
      <AssignedToPicker value={form.assignedTo} accessType="CHECK_TO_LINE" fleet={fleet} onAssign={assign} />

      {open && (
        <div style={{ marginTop: '0.75rem' }}>
          {isCabinAttendant ? (
            <>
              {CA_ASSESSMENT_ITEMS.map((item) => (
                <div key={item} className="row" style={{ cursor: 'default' }}>
                  <div style={{ flex: 1, fontSize: 13 }}>{item}</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className={`tick-btn ${form.assessmentItems[item] === true ? 'active-pass' : ''}`}
                      disabled={locked}
                      onClick={() => setCaItem(item, true)}
                    >✓</button>
                    <button
                      className={`tick-btn ${form.assessmentItems[item] === false ? 'active-fail' : ''}`}
                      disabled={locked}
                      onClick={() => setCaItem(item, false)}
                    >✗</button>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="grid2">
                <SectorFields
                  label="Sectors 1 & 2"
                  progressiveLabel="progr. total"
                  value={form.sectorDetails?.sectors12}
                  disabled={locked}
                  onChange={(v) => updateSector('sectors12', v)}
                />
                <SectorFields
                  label="Sectors 3 & 4"
                  progressiveLabel="total LOFT"
                  value={form.sectorDetails?.sectors34}
                  disabled={locked}
                  onChange={(v) => updateSector('sectors34', v)}
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 0.875rem' }}>
                New to type: Min Total LOFT Captain 100 Hrs; FO 50 Hrs
              </div>

              {[...grouped.entries()].map(([category, categoryItems]) => (
                <div key={category} className="card">
                  <div style={{ fontWeight: 500, marginBottom: 6 }}>{category}</div>
                  {categoryItems.map((item) => {
                    const key = itemKey(item);
                    const status = form.assessmentItems[key];
                    if (item.kind === 'text') {
                      return (
                        <div key={key} className="field" style={{ margin: '0 0 10px' }}>
                          <label>
                            {item.description}
                            <ReferenceDocIcon document={item.referenceDocument} name={item.referenceDocumentName} />
                          </label>
                          <input
                            defaultValue={status || ''}
                            disabled={locked}
                            onBlur={(e) => setItemText(item, e.target.value)}
                          />
                          {item.notes && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.notes}</div>}
                        </div>
                      );
                    }
                    return (
                      <div key={key} className="row" style={{ cursor: 'default' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13 }}>
                            {item.description}
                            <ReferenceDocIcon document={item.referenceDocument} name={item.referenceDocumentName} />
                          </div>
                          {item.notes && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.notes}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {STATUSES.map((s) => (
                            <button
                              key={s.value}
                              disabled={locked}
                              className={`tick-btn ${status === s.value ? (s.value === 'UNSATISFACTORY' ? 'active-fail' : 'active-pass') : ''}`}
                              onClick={() => setItemStatus(item, s.value)}
                            >{s.label}</button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              <div className="card">
                <div style={{ fontWeight: 500, marginBottom: 6 }}>Non Technical Skill Assessment</div>
                {data.ntsMarkers.map((marker) => (
                  <div key={marker} className="row" style={{ cursor: 'default' }}>
                    <div style={{ flex: 1, fontSize: 13 }}>{marker}</div>
                    <select disabled={locked} value={form.ntsScores?.[marker] || ''} onChange={(e) => updateNts(marker, e.target.value)} style={{ width: 100 }}>
                      <option value="">—</option>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              <div className="field">
                <label>Comments</label>
                <textarea
                  disabled={locked}
                  value={form.comments || ''}
                  onChange={(e) => setData((d) => ({ ...d, form: { ...d.form, comments: e.target.value } }))}
                  onBlur={() => save({ comments: form.comments })}
                  style={{ minHeight: 80 }}
                />
              </div>

              <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-secondary)', margin: '0.75rem 0' }}>
                We the undersigned, do hereby mutually agree upon and accept the comments written in this document
                as being a correct and honest account of the performance of the trainee in each and every check
                procedure carried out.
              </div>
            </>
          )}

          {!locked && !allItemsAnswered && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0.75rem 0' }}>
              Every item above must be ticked before the overall result can be set.
            </div>
          )}
          <div className="field" style={{ marginTop: 12 }}>
            <label>Overall result</label>
            <select disabled={locked || !allItemsAnswered} value={form.overallResult || ''} onChange={(e) => setResult(e.target.value || null)}>
              <option value="">—</option>
              <option value="PASS">PASS</option>
              <option value="FAIL">FAIL</option>
            </select>
          </div>
          {!isCabinAttendant && (
            <div className="field">
              <label>Overall score (1-5)</label>
              <input
                type="number" min="1" max="5" disabled={locked}
                value={form.overallScore || ''}
                onChange={(e) => setData((d) => ({ ...d, form: { ...d.form, overallScore: e.target.value } }))}
                onBlur={() => save({ overallScore: Number(form.overallScore) || null })}
              />
            </div>
          )}
          {!isCabinAttendant && (
            <div className="grid2">
              {form.assignedTo ? (
                <PinSignature
                  label="Assessor's signature" personType="user" personId={form.assignedTo}
                  signedName={form.assessorSignature} signedAt={form.assessorSignatureAt} disabled={locked}
                  onSigned={(name, at) => save({ assessorSignature: name, assessorSignatureAt: at })}
                />
              ) : (
                <div className="field">
                  <label>Assessor's signature</label>
                  <input
                    disabled={locked}
                    value={form.assessorSignature || ''}
                    onChange={(e) => setData((d) => ({ ...d, form: { ...d.form, assessorSignature: e.target.value } }))}
                    onBlur={() => save({ assessorSignature: form.assessorSignature })}
                  />
                </div>
              )}
              <PinSignature
                label="Candidate signature" personType="trainee" personId={traineeId}
                signedName={form.candidateSignature} signedAt={form.candidateSignatureAt} disabled={locked}
                onSigned={(name, at) => save({ candidateSignature: name, candidateSignatureAt: at })}
              />
            </div>
          )}

          {canEdit && !form.completedAt && (
            <button className="primary" onClick={complete} disabled={!form.overallResult}>
              Complete Check to Line
            </button>
          )}
          {error && <div className="error-text">{error}</div>}
        </div>
      )}
    </div>
  );
}
