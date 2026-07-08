import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatDate } from '../lib/format';
import { useAuth } from '../context/AuthContext';

// Signing off a clearance stage mirrors an actual FSM/HOFO signature on the
// paper form, so it's restricted tighter than the rest of this admin-only
// page - HOTC/HOFO only, not Flight Ops Admin.
function canSignClearance(user) {
  return user.role === 'HOTC' || user.role === 'HOFO';
}

// Mirrors the paper trail on Flight Standards Form SA 586 (pilots) / SA 539
// (cabin attendants) - a growing list of sign-off boxes rather than a fixed
// one-per-person record, since a pilot who converts onto another type or
// upgrades to Captain goes through the conversion/line-training stages
// again over their career.
const PILOT_STAGES = ['AIRCRAFT_CONVERSION', 'LINE_TRAINING', 'TRAINING_CAPTAIN', 'CHECK_CAPTAIN'];
const CA_STAGES = ['GROUND_SCHOOL', 'LINE_TRAINING', 'CA_TRAINER', 'CA_CHECKER'];

const PILOT_STAGE_LABELS = {
  AIRCRAFT_CONVERSION: 'Aircraft Conversion Completed',
  LINE_TRAINING: 'Line Training Completed',
  TRAINING_CAPTAIN: 'Training Captain Training Completed',
  CHECK_CAPTAIN: 'Check Captain Training Completed',
};
const CA_STAGE_LABELS = {
  GROUND_SCHOOL: 'Ground School Completed',
  LINE_TRAINING: 'Line Training Completed',
  CA_TRAINER: 'Cabin Attendant Trainer Training Completed',
  CA_CHECKER: 'Cabin Attendant Checker Training Completed',
};

const CAPACITY_LABELS = {
  F100_CAPTAIN: 'F100 Captain', F100_FO: 'F100 F/O',
  DHC8_CAPTAIN: 'DHC8 Captain', DHC8_FO: 'DHC8 F/O',
  METRO_CAPTAIN: 'Metro Captain', METRO_FO: 'Metro F/O',
};
const TYPE_LABELS = { F100: 'F100', DHC8: 'DHC8', METRO: 'Metro' };
const CA_FLEET_LABELS = { DASH_8: 'Dash 8', FOKKER_100: 'Fokker 100' };

function CheckboxGroup({ options, labels, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      {options.map((opt) => (
        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox" style={{ width: 'auto' }}
            checked={value.includes(opt)}
            onChange={(e) => onChange(e.target.checked ? [...value, opt] : value.filter((v) => v !== opt))}
          />
          {labels[opt] || opt}
        </label>
      ))}
    </div>
  );
}

function emptyDetailsFor(stage) {
  switch (stage) {
    case 'AIRCRAFT_CONVERSION': return { type: 'F100', date: '', capacities: [], conductedBy: 'ANY' };
    case 'LINE_TRAINING': return { capacities: [], checkToLineDate: '', restrictionsNil: true, restrictions: [] };
    case 'TRAINING_CAPTAIN': return { types: [] };
    case 'CHECK_CAPTAIN': return { types: [] };
    case 'GROUND_SCHOOL': return { fleet: 'DASH_8', date: '' };
    case 'CA_TRAINER': return {};
    case 'CA_CHECKER': return {};
    default: return {};
  }
}

// The fields specific to each stage, rendered while adding a new entry -
// once saved, entries are read-only (see ClearanceEntry) since they're a
// signed record, not something to keep editing after the fact.
function StageFields({ isPilot, stage, details, onChange }) {
  const set = (patch) => onChange({ ...details, ...patch });

  if (stage === 'AIRCRAFT_CONVERSION') {
    return (
      <>
        <div className="grid2">
          <div className="field">
            <label>Aircraft type</label>
            <select value={details.type} onChange={(e) => set({ type: e.target.value })}>
              {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="field"><label>Date</label><input type="date" value={details.date} onChange={(e) => set({ date: e.target.value })} /></div>
        </div>
        <div className="field">
          <label>Cleared for Supervised Line Training (LOFT) as</label>
          <CheckboxGroup options={Object.keys(CAPACITY_LABELS)} labels={CAPACITY_LABELS} value={details.capacities} onChange={(v) => set({ capacities: v })} />
        </div>
        <div className="field">
          <label>Supervised Line Training (LOFT) to be conducted by</label>
          <select value={details.conductedBy === 'ANY' ? 'ANY' : 'NAMED'} onChange={(e) => set({ conductedBy: e.target.value === 'ANY' ? 'ANY' : '' })}>
            <option value="ANY">Any applicable Training Captains</option>
            <option value="NAMED">Named Training Captain(s)</option>
          </select>
          {details.conductedBy !== 'ANY' && (
            <input style={{ marginTop: 6 }} placeholder="Training Captain name(s)" value={details.conductedBy} onChange={(e) => set({ conductedBy: e.target.value })} />
          )}
        </div>
      </>
    );
  }

  if (stage === 'LINE_TRAINING' && isPilot) {
    return (
      <>
        <div className="field">
          <label>Cleared as a line pilot in the following capacity</label>
          <CheckboxGroup options={Object.keys(CAPACITY_LABELS)} labels={CAPACITY_LABELS} value={details.capacities} onChange={(v) => set({ capacities: v })} />
        </div>
        <div className="field"><label>Check to Line date</label><input type="date" value={details.checkToLineDate} onChange={(e) => set({ checkToLineDate: e.target.value })} /></div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={details.restrictionsNil} onChange={(e) => set({ restrictionsNil: e.target.checked, restrictions: e.target.checked ? [] : details.restrictions })} />
            Nil restrictions
          </label>
        </div>
        {!details.restrictionsNil && (
          <div className="field">
            <label>Restrictions - prohibited destinations until cleared</label>
            {details.restrictions.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input
                  placeholder="Destination" value={r.destination}
                  onChange={(e) => set({ restrictions: details.restrictions.map((x, j) => (j === i ? { ...x, destination: e.target.value } : x)) })}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox" style={{ width: 'auto' }} checked={r.cleared}
                    onChange={(e) => set({ restrictions: details.restrictions.map((x, j) => (j === i ? { ...x, cleared: e.target.checked } : x)) })}
                  />
                  Cleared
                </label>
                <button type="button" onClick={() => set({ restrictions: details.restrictions.filter((_, j) => j !== i) })}>Remove</button>
              </div>
            ))}
            <button type="button" onClick={() => set({ restrictions: [...details.restrictions, { destination: '', cleared: false }] })}>+ Add destination</button>
          </div>
        )}
      </>
    );
  }

  if (stage === 'LINE_TRAINING' && !isPilot) {
    return (
      <div className="grid2">
        <div className="field">
          <label>Fleet</label>
          <select value={details.fleet} onChange={(e) => set({ fleet: e.target.value })}>
            {Object.entries(CA_FLEET_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="field"><label>Check to Line date</label><input type="date" value={details.checkToLineDate} onChange={(e) => set({ checkToLineDate: e.target.value })} /></div>
      </div>
    );
  }

  if (stage === 'GROUND_SCHOOL') {
    return (
      <div className="grid2">
        <div className="field">
          <label>Fleet</label>
          <select value={details.fleet} onChange={(e) => set({ fleet: e.target.value })}>
            {Object.entries(CA_FLEET_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="field"><label>Date</label><input type="date" value={details.date} onChange={(e) => set({ date: e.target.value })} /></div>
      </div>
    );
  }

  if (stage === 'TRAINING_CAPTAIN' || stage === 'CHECK_CAPTAIN') {
    return (
      <div className="field">
        <label>{stage === 'TRAINING_CAPTAIN' ? 'Cleared as a Training Captain on the following type' : 'Approved as a Check Captain on the following'}</label>
        <CheckboxGroup options={Object.keys(TYPE_LABELS)} labels={TYPE_LABELS} value={details.types} onChange={(v) => set({ types: v })} />
      </div>
    );
  }

  return null; // CA_TRAINER / CA_CHECKER: just a sign-off, no extra fields
}

function summarize(isPilot, entry) {
  const d = entry.details || {};
  switch (entry.stage) {
    case 'AIRCRAFT_CONVERSION':
      return `${TYPE_LABELS[d.type] || d.type} · ${d.date ? formatDate(d.date) : 'no date'}${d.capacities?.length ? ` · Cleared for LOFT as ${d.capacities.map((c) => CAPACITY_LABELS[c]).join(', ')}` : ''}`;
    case 'LINE_TRAINING':
      if (isPilot) {
        return `${d.capacities?.length ? d.capacities.map((c) => CAPACITY_LABELS[c]).join(', ') : 'No capacity recorded'} · Check to Line ${d.checkToLineDate ? formatDate(d.checkToLineDate) : 'no date'}${d.restrictionsNil ? ' · Nil restrictions' : ` · Restrictions: ${(d.restrictions || []).map((r) => `${r.destination}${r.cleared ? ' (cleared)' : ''}`).join(', ')}`}`;
      }
      return `${CA_FLEET_LABELS[d.fleet] || d.fleet} · Check to Line ${d.checkToLineDate ? formatDate(d.checkToLineDate) : 'no date'}`;
    case 'GROUND_SCHOOL':
      return `${CA_FLEET_LABELS[d.fleet] || d.fleet} · ${d.date ? formatDate(d.date) : 'no date'}`;
    case 'TRAINING_CAPTAIN':
    case 'CHECK_CAPTAIN':
      return d.types?.length ? d.types.map((t) => TYPE_LABELS[t]).join(', ') : 'No type recorded';
    default:
      return null;
  }
}

function ClearanceEntry({ isPilot, entry, onDelete, canSign }) {
  const label = (isPilot ? PILOT_STAGE_LABELS : CA_STAGE_LABELS)[entry.stage] || entry.stage;
  const summary = summarize(isPilot, entry);
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 500 }}>{label}</div>
          {summary && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{summary}</div>}
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            {entry.signedByName ? `Signed by ${entry.signedByName}` : 'Unsigned'}{entry.signedAt ? ` · ${formatDate(entry.signedAt)}` : ''}
          </div>
        </div>
        {canSign && (
          <button className="danger" onClick={() => { if (window.confirm('Remove this clearance entry? This cannot be undone.')) onDelete(entry.id); }}>Delete</button>
        )}
      </div>
    </div>
  );
}

export function ClearanceTab({ member }) {
  const { user } = useAuth();
  const canSign = canSignClearance(user);
  const isPilot = member.type === 'PILOT';
  const stages = isPilot ? PILOT_STAGES : CA_STAGES;
  const stageLabels = isPilot ? PILOT_STAGE_LABELS : CA_STAGE_LABELS;

  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [stage, setStage] = useState(stages[0]);
  const [details, setDetails] = useState(() => emptyDetailsFor(stages[0]));

  function load() {
    api.get(`/api/crew/${member.id}/clearances`).then(setEntries).catch((e) => setError(e.message));
  }
  useEffect(load, [member.id]);

  function startAdding() {
    setStage(stages[0]);
    setDetails(emptyDetailsFor(stages[0]));
    setAdding(true);
  }

  function changeStage(next) {
    setStage(next);
    setDetails(emptyDetailsFor(next));
  }

  async function save(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/api/crew/${member.id}/clearances`, { stage, details });
      setAdding(false);
      load();
    } catch (err) { setError(err.message); }
  }

  async function remove(id) {
    setError(null);
    try {
      await api.delete(`/api/crew/${member.id}/clearances/${id}`);
      load();
    } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
        Clearance sign-off history ({isPilot ? 'Form SA 586' : 'Form SA 539'}) - each entry is a signed clearance stage, added as this crew member progresses.
      </div>
      {error && <div className="error-text">{error}</div>}

      {!canSign && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Only HOTC and HOFO can sign a new clearance stage.</div>}
      {canSign && !adding && <button onClick={startAdding}>+ Add clearance stage</button>}

      {adding && (
        <form className="card" onSubmit={save}>
          <div className="field">
            <label>Stage</label>
            <select value={stage} onChange={(e) => changeStage(e.target.value)}>
              {stages.map((s) => <option key={s} value={s}>{stageLabels[s]}</option>)}
            </select>
          </div>
          <StageFields isPilot={isPilot} stage={stage} details={details} onChange={setDetails} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="submit">Sign off</button>
            <button type="button" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      )}

      {entries.length === 0 && !adding && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No clearance stages recorded yet.</div>
      )}
      {[...entries].reverse().map((entry) => (
        <ClearanceEntry key={entry.id} isPilot={isPilot} entry={entry} onDelete={remove} canSign={canSign} />
      ))}
    </div>
  );
}
