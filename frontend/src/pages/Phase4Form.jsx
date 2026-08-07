import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { formatDate } from '../lib/format';
import { PinSignature } from '../components/PinSignature';

const STATUSES = [
  { value: 'SATISFACTORY', label: '✓' },
  { value: 'UNSATISFACTORY', label: '✗' },
  { value: 'NA', label: 'N/A' },
];

// Flight Ops Admin excluded - Captain in Training assessment is a check,
// and they cannot conduct any checking.
const CAN_EDIT_ROLES = [
  'HOTC', 'HOFO', 'ALTERNATE', 'EXAMINER', 'TRAINING_CAPTAIN',
];

function itemKey(item) {
  return `${item.category}||${item.description}`;
}

function SectorFields({ label, value, disabled, onChange }) {
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

  return (
    <div className="card">
      <div style={{ fontWeight: 500, marginBottom: 6 }}>{label}</div>
      <div className="grid2">
        <div className="field">
          <label>Route</label>
          <input disabled={disabled} value={route} onChange={(e) => setRoute(e.target.value)} onBlur={() => update('route', route)} />
        </div>
        <div className="field">
          <label>Aircraft</label>
          <input disabled={disabled} value={aircraft} onChange={(e) => setAircraft(e.target.value)} onBlur={() => update('aircraft', aircraft)} />
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>Date</label>
          <input type="date" disabled={disabled} value={v.date || ''} onChange={(e) => update('date', e.target.value)} />
        </div>
        <div className="field">
          <label>Flight time (this flight)</label>
          <input type="number" step="0.1" disabled={disabled} value={thisFlight} onChange={(e) => setThisFlight(e.target.value)} onBlur={() => update('thisFlight', thisFlight)} />
        </div>
      </div>
      <div className="field">
        <label>Flight time (progressive total)</label>
        <div style={{ fontSize: 14, padding: '6px 0' }}>{v.progressiveTotal ?? 0}h</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Flights tab total plus flight time entered above - not editable here.</div>
      </div>
    </div>
  );
}

export function Phase4Form({ traineeId, flights }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/phase4/${traineeId}`).then(setData).catch((e) => setError(e.message));
  }
  useEffect(load, [traineeId]);

  const assessment = data?.assessment || { sectorDetails: {}, itemResults: {}, categoryRemarks: {}, ntsScores: {}, comments: '' };
  const isTrainee = user.role === 'TRAINEE';
  const canEdit = CAN_EDIT_ROLES.includes(user.role) && !assessment.completedAt;
  const canSignApplicant = isTrainee ? user.traineeId === traineeId && !assessment.completedAt : !assessment.completedAt;
  const canComplete = canEdit && !!assessment.trainingCaptainSignature && !!assessment.applicantSignature && !assessment.completedAt;

  async function save(patch) {
    setError(null);
    try {
      const updated = await api.put(`/api/phase4/${traineeId}`, patch);
      setData((d) => ({ ...d, assessment: updated }));
    } catch (err) { setError(err.message); }
  }

  function updateSector(key, value) {
    save({ sectorDetails: { ...assessment.sectorDetails, [key]: value } });
  }

  // Progressive total starts from the trainee's current total flight hours
  // on the Flights tab, then amends as flight time is added for each sector
  // pair - Sectors 1&2's total is the Flights-tab baseline plus whatever's
  // entered as their "this flight" time, and Sectors 3&4's total carries on
  // from there plus its own "this flight" time. Kept live (re-synced
  // whenever a flight is added/edited or a "this flight" value changes),
  // not manually editable.
  const round1 = (n) => Math.round(n * 10) / 10;
  const thisFlight12 = Number(assessment.sectorDetails?.sectors12?.thisFlight) || 0;
  const thisFlight34 = Number(assessment.sectorDetails?.sectors34?.thisFlight) || 0;
  useEffect(() => {
    if (!canEdit || !data || !flights) return;
    // Hours are only ever recorded to one decimal place, but summing
    // floating-point numbers in JS (e.g. 3.8 + 2.7) can land on something
    // like 6.499999999999999 - round back to 1dp so this reads the same as
    // every other total hours figure in the app.
    const baseline = round1(flights.reduce((sum, f) => sum + Number(f.hours), 0));
    const progressive12 = round1(baseline + thisFlight12);
    const progressive34 = round1(progressive12 + thisFlight34);

    const patch = {};
    if (assessment.sectorDetails?.sectors12?.progressiveTotal !== progressive12) {
      patch.sectors12 = { ...assessment.sectorDetails?.sectors12, progressiveTotal: progressive12 };
    }
    if (assessment.sectorDetails?.sectors34?.progressiveTotal !== progressive34) {
      patch.sectors34 = { ...assessment.sectorDetails?.sectors34, progressiveTotal: progressive34 };
    }
    if (Object.keys(patch).length > 0) {
      save({ sectorDetails: { ...assessment.sectorDetails, ...patch } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flights, data, canEdit, thisFlight12, thisFlight34]);

  if (error) return <div className="error-text">{error}</div>;
  if (!data) return null;

  function updateItemResult(item, field, value) {
    const key = itemKey(item);
    const next = { ...assessment.itemResults, [key]: { ...assessment.itemResults[key], [field]: value } };
    save({ itemResults: next });
  }

  function updateCategoryRemarks(category, value) {
    save({ categoryRemarks: { ...assessment.categoryRemarks, [category]: value } });
  }

  function updateNts(marker, value) {
    save({ ntsScores: { ...assessment.ntsScores, [marker]: value } });
  }

  async function complete() {
    setError(null);
    try {
      const updated = await api.post(`/api/phase4/${traineeId}/complete`);
      setData((d) => ({ ...d, assessment: updated }));
    } catch (err) { setError(err.message); }
  }

  const grouped = new Map();
  for (const item of data.items) {
    if (!grouped.has(item.category)) grouped.set(item.category, []);
    grouped.get(item.category).push(item);
  }

  return (
    <div>
      <div className="card">
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Phase 4 — Check to Line Preparation</div>
        {assessment.completedAt ? (
          <div className="badge pass">Signed off {formatDate(assessment.completedAt)}</div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            A minimum of 4 sectors is dedicated to this phase, verifying all aspects of Phases 1–3 before the Applicant is recommended for a Check to Line.
          </div>
        )}
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="grid2">
        <SectorFields label="Sectors 1 & 2" value={assessment.sectorDetails?.sectors12} disabled={!canEdit} onChange={(v) => updateSector('sectors12', v)} />
        <SectorFields label="Sectors 3 & 4" value={assessment.sectorDetails?.sectors34} disabled={!canEdit} onChange={(v) => updateSector('sectors34', v)} />
      </div>

      {[...grouped.entries()].map(([category, categoryItems]) => (
        <div key={category} className="card">
          <div style={{ fontWeight: 500, marginBottom: 6 }}>{category}</div>
          {categoryItems.map((item) => {
            const key = itemKey(item);
            const result = assessment.itemResults?.[key] || {};
            return (
              <div key={key} className="row" style={{ cursor: 'default' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13 }}>{item.description}</div>
                  {item.notes && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.notes}</div>}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {STATUSES.map((s) => (
                    <button
                      key={s.value}
                      disabled={!canEdit}
                      className={`tick-btn ${result.status === s.value ? (s.value === 'UNSATISFACTORY' ? 'active-fail' : 'active-pass') : ''}`}
                      onClick={() => updateItemResult(item, 'status', s.value)}
                    >{s.label}</button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="field" style={{ marginTop: 10 }}>
            <label>Remarks — {category}</label>
            <textarea
              disabled={!canEdit}
              value={assessment.categoryRemarks?.[category] || ''}
              onChange={(e) => setData((d) => ({ ...d, assessment: { ...d.assessment, categoryRemarks: { ...d.assessment.categoryRemarks, [category]: e.target.value } } }))}
              onBlur={() => updateCategoryRemarks(category, assessment.categoryRemarks?.[category] || '')}
              style={{ minHeight: 50 }}
            />
          </div>
        </div>
      ))}

      <div className="card">
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Non Technical Skill Assessment</div>
        {data.ntsMarkers.map((marker) => (
          <div key={marker} className="row" style={{ cursor: 'default' }}>
            <div style={{ flex: 1, fontSize: 13 }}>{marker}</div>
            <select disabled={!canEdit} value={assessment.ntsScores?.[marker] || ''} onChange={(e) => updateNts(marker, e.target.value)} style={{ width: 100 }}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="field">
          <label>Comments</label>
          <textarea
            disabled={!canEdit}
            value={assessment.comments || ''}
            onChange={(e) => setData((d) => ({ ...d, assessment: { ...d.assessment, comments: e.target.value } }))}
            onBlur={() => save({ comments: assessment.comments })}
            style={{ minHeight: 80 }}
          />
        </div>

        <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-secondary)', margin: '0.75rem 0' }}>
          The Applicant has satisfactorily completed Training Phase 4. All paperwork and syllabus items have been
          checked for totality and accuracy and he/she is recommended for a Check to Line Flight Test.
        </div>
        <div className="grid2">
          <PinSignature
            label="Training Captain signature" personType="user" personId={user.id}
            signedName={assessment.trainingCaptainSignature} signedAt={assessment.trainingCaptainSignatureAt} disabled={!canEdit}
            onSigned={(name, at) => save({ trainingCaptainSignature: name, trainingCaptainSignatureAt: at })}
          />
          <PinSignature
            label="Applicant signature" personType="trainee" personId={traineeId}
            signedName={assessment.applicantSignature} signedAt={assessment.applicantSignatureAt} disabled={!canSignApplicant}
            onSigned={(name, at) => save({ applicantSignature: name, applicantSignatureAt: at })}
          />
        </div>
        {canComplete && <button className="primary" onClick={complete}>Complete Phase 4</button>}
      </div>
    </div>
  );
}
