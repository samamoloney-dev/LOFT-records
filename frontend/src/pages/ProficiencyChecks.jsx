import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { RECURRENT_TRAINING_ITEMS, KNOWLEDGE_ITEMS, FLIGHT_COMPONENT_SECTIONS } from './proficiency-check-items';
import { AssignedToPicker } from '../components/AssignedToPicker';

const VARIANTS = [
  { value: 'PC', label: 'Proficiency Check' },
  { value: 'IPC_PC', label: 'IPC and Proficiency Check' },
];
const AIRCRAFT_TYPES = ['Fokker 100', 'Dash 8', 'Metro'];

// IPC and Proficiency Check draw from different check-access ticks even
// though they're the same underlying record type.
function variantAccessType(variant) {
  return variant === 'IPC_PC' ? 'IPC' : 'PC';
}

const emptyForm = () => ({ name: '', date: '', assessor: '', actype: '', arn: '', variant: 'PC', assignedTo: '', examinerName: '', examinerArn: '' });

const emptyDetails = (variant) => ({
  variant,
  results: {},
  seatCheck: '',
  testNumber: '',
  applicantArn: '', applicantName: '', applicantSig: '',
  fstdDate: '', fstdNumber: '', fstdType: '', groundTime: '', simulatorTime: '',
  examinerArn: '', examinerName: '', examinerSig: '',
  examinerComments: '',
});

function ItemRow({ id, description, mos, result, disabled, onSetResult }) {
  return (
    <div className="row" style={{ cursor: 'default' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13 }}>{description}</div>
        {mos && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>MOS {mos}</div>}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {['S', 'X', 'N'].map((v) => (
          <button
            key={v}
            disabled={disabled}
            className={`tick-btn ${result === v ? (v === 'X' ? 'active-fail' : 'active-pass') : ''}`}
            onClick={() => onSetResult(id, result === v ? undefined : v)}
          >{v === 'S' ? '✓' : v === 'X' ? '✗' : 'N/A'}</button>
        ))}
      </div>
    </div>
  );
}

export function ProficiencyChecks() {
  const [checks, setChecks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState(emptyForm());
  const [error, setError] = useState(null);

  function load() {
    api.get('/api/checks?checkType=RECURRENT_SIMULATOR').then(setChecks).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  const selected = checks.find((c) => c.id === selectedId);

  async function createCheck(e) {
    e.preventDefault();
    setError(null);
    if (!newForm.name.trim()) return;
    try {
      const details = {
        ...emptyDetails(newForm.variant),
        name: newForm.name, date: newForm.date, assessor: newForm.assessor, actype: newForm.actype, arn: newForm.arn,
        examinerName: newForm.examinerName, examinerArn: newForm.examinerArn,
      };
      await api.post('/api/checks', { checkType: 'RECURRENT_SIMULATOR', appliesTo: 'PILOT', assignedTo: newForm.assignedTo || undefined, details });
      setCreating(false);
      setNewForm(emptyForm());
      load();
    } catch (err) { setError(err.message); }
  }

  async function reassign(check, staffMember) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, {
        assignedTo: staffMember?.id || null,
        details: { ...check.details, examinerName: staffMember?.name || check.details?.examinerName, examinerArn: staffMember?.arn || check.details?.examinerArn },
      });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) { setError(err.message); }
  }

  async function patchDetails(check, patch) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, { details: { ...check.details, ...patch } });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) { setError(err.message); }
  }

  async function setResult(check, result) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, { result, completedAt: new Date().toISOString() });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) { setError(err.message); }
  }

  if (selected) {
    const d = selected.details || {};
    const isIpc = d.variant === 'IPC_PC';
    const results = d.results || {};

    function setItemResult(id, value) {
      patchDetails(selected, { results: { ...results, [id]: value } });
    }

    const flightSections = FLIGHT_COMPONENT_SECTIONS.map((s) => ({
      ...s,
      allItems: isIpc && s.ipcOnlyItems ? [...s.ipcOnlyItems, ...s.items] : s.items,
    }));

    return (
      <div>
        <button onClick={() => setSelectedId(null)} style={{ marginBottom: '1rem' }}>← Back</button>
        <div className="card">
          <div style={{ fontSize: 16, fontWeight: 500 }}>{d.name} — {VARIANTS.find((v) => v.value === d.variant)?.label}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.actype || 'No aircraft type'} · {d.date || 'No date'} · Assessor: {d.assessor || '—'}</div>
        </div>

        <div className="card">
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {selected.assignedToName ? `Assigned to ${selected.assignedToName}${selected.assignedToArn ? ` · ARN ${selected.assignedToArn}` : ''}` : 'Unassigned'}
          </div>
          <AssignedToPicker value={selected.assignedTo} accessType={variantAccessType(d.variant)} onAssign={(s) => reassign(selected, s)} />
        </div>

        <div className="card">
          <div style={{ fontWeight: 500, marginBottom: 6 }}>Recurrent Training (121.50 (1B))</div>
          {RECURRENT_TRAINING_ITEMS.map((item, i) => (
            <ItemRow key={i} id={`rt-${i}`} description={item.description} mos={item.mos} result={results[`rt-${i}`]} disabled={!!selected.completedAt} onSetResult={setItemResult} />
          ))}
        </div>

        {isIpc && (
          <div className="card">
            <div style={{ fontWeight: 500, marginBottom: 6 }}>Knowledge requirements (Ground Component)</div>
            {KNOWLEDGE_ITEMS.map((item, i) => (
              <ItemRow key={i} id={`kn-${i}`} description={item.description} mos={item.mos} result={results[`kn-${i}`]} disabled={!!selected.completedAt} onSetResult={setItemResult} />
            ))}
          </div>
        )}

        {flightSections.map((s) => (
          <div key={s.section} className="card">
            <div style={{ fontWeight: 500, marginBottom: 6 }}>{s.section} (Flight Component)</div>
            {s.allItems.map((item, i) => (
              <ItemRow key={i} id={`fc-${s.section}-${i}`} description={item.description} mos={item.mos} result={results[`fc-${s.section}-${i}`]} disabled={!!selected.completedAt} onSetResult={setItemResult} />
            ))}
          </div>
        ))}

        <div className="card">
          <div style={{ fontWeight: 500, marginBottom: 6 }}>Seat check conducted in</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Training captains in LHS and Other, F.O. in RHS, Captains in LHS</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['LHS', 'RHS', 'Other Seat'].map((seat) => (
              <button
                key={seat}
                disabled={!!selected.completedAt}
                className={d.seatCheck === seat ? 'primary' : ''}
                onClick={() => patchDetails(selected, { seatCheck: d.seatCheck === seat ? '' : seat })}
              >{seat}</button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="field"><label>Test number</label><input defaultValue={d.testNumber} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { testNumber: e.target.value })} /></div>
          <div className="grid2">
            <div className="field"><label>Applicant ARN</label><input defaultValue={d.applicantArn} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { applicantArn: e.target.value })} /></div>
            <div className="field"><label>Applicant name</label><input defaultValue={d.applicantName} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { applicantName: e.target.value })} /></div>
          </div>
          <div className="field"><label>Applicant signature</label><input defaultValue={d.applicantSig} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { applicantSig: e.target.value })} /></div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 500, marginBottom: 6 }}>FSTD</div>
          <div className="grid2">
            <div className="field"><label>Date</label><input type="date" defaultValue={d.fstdDate} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { fstdDate: e.target.value })} /></div>
            <div className="field"><label>FSTD number</label><input defaultValue={d.fstdNumber} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { fstdNumber: e.target.value })} /></div>
          </div>
          <div className="grid2">
            <div className="field"><label>FSTD type</label><input defaultValue={d.fstdType} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { fstdType: e.target.value })} /></div>
            <div className="field"><label>Ground time</label><input defaultValue={d.groundTime} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { groundTime: e.target.value })} /></div>
          </div>
          <div className="field"><label>Simulator time</label><input defaultValue={d.simulatorTime} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { simulatorTime: e.target.value })} /></div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 500, marginBottom: 6 }}>Examiner</div>
          <div className="grid2">
            <div className="field"><label>Examiner ARN</label><input defaultValue={d.examinerArn} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { examinerArn: e.target.value })} /></div>
            <div className="field"><label>Examiner name</label><input defaultValue={d.examinerName} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { examinerName: e.target.value })} /></div>
          </div>
          <div className="field"><label>Examiner signature</label><input defaultValue={d.examinerSig} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { examinerSig: e.target.value })} /></div>
          <div className="field"><label>Examiner's comments</label><textarea defaultValue={d.examinerComments} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { examinerComments: e.target.value })} style={{ minHeight: 70 }} /></div>
        </div>

        <div className="card">
          <div className="field">
            <label>Overall assessment</label>
            <select disabled={!!selected.completedAt} value={selected.result || ''} onChange={(e) => setResult(selected, e.target.value || null)}>
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
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Part 121 Proficiency Check / IPC and Proficiency Check</div>
        <button onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'Add check'}</button>
      </div>

      {creating && (
        <form className="card" onSubmit={createCheck}>
          <div className="field">
            <label>Check type</label>
            <select value={newForm.variant} onChange={(e) => setNewForm({ ...newForm, variant: e.target.value })}>
              {VARIANTS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
          <div className="grid2">
            <div className="field"><label>Candidate name</label><input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} required /></div>
            <div className="field"><label>Date</label><input type="date" value={newForm.date} onChange={(e) => setNewForm({ ...newForm, date: e.target.value })} /></div>
          </div>
          <div className="grid2">
            <div className="field"><label>Assessor(s)</label><input value={newForm.assessor} onChange={(e) => setNewForm({ ...newForm, assessor: e.target.value })} /></div>
            <div className="field">
              <label>Aircraft type</label>
              <select value={newForm.actype} onChange={(e) => setNewForm({ ...newForm, actype: e.target.value })}>
                <option value="">—</option>
                {AIRCRAFT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label>Applicant's ARN</label><input value={newForm.arn} onChange={(e) => setNewForm({ ...newForm, arn: e.target.value })} /></div>
          <AssignedToPicker
            value={newForm.assignedTo}
            accessType={variantAccessType(newForm.variant)}
            onAssign={(s) => setNewForm((f) => ({ ...f, assignedTo: s?.id || '', examinerName: s?.name || f.examinerName, examinerArn: s?.arn || f.examinerArn }))}
          />
          <button type="submit" className="primary">Create check record</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {checks.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No proficiency checks yet.</div>}
      {checks.map((c) => (
        <div key={c.id} className="card row" onClick={() => setSelectedId(c.id)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{c.details?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {VARIANTS.find((v) => v.value === c.details?.variant)?.label || 'Proficiency Check'} · {c.details?.actype || 'No aircraft type'} · {c.details?.date || 'No date'}
            </div>
          </div>
          {c.result && <span className={`badge ${c.result === 'PASS' ? 'pass' : 'fail'}`}>{c.result}</span>}
        </div>
      ))}
    </div>
  );
}
