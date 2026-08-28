import { useState } from 'react';
import { openCertificateWindow } from '../lib/print';
import { buildCertificateHtml, CERTIFICATE_CHECKLIST } from '../lib/printBuilders';

const todayIso = () => new Date().toISOString().slice(0, 10);

// Standalone certificate tool, matching the operator's Skippers paper
// certificate template - name, tick whichever course(s) were completed,
// set the validity dates, print. Deliberately manual/decoupled from any
// specific check record (unlike an earlier version of this that derived
// everything from a completed Emergency Procedures/Life Jacket/Smoke &
// Fire/F100 Slide check) - the operator asked for the simpler version,
// since it works for any crew member regardless of whether a matching
// check exists in this app at all.
export function CertificateGenerator() {
  const [name, setName] = useState('');
  const [ticked, setTicked] = useState([]);
  const [validFrom, setValidFrom] = useState(todayIso());
  const [validTo, setValidTo] = useState('');
  const [assessorName, setAssessorName] = useState('');

  function toggle(key) {
    setTicked((t) => (t.includes(key) ? t.filter((k) => k !== key) : [...t, key]));
  }

  function generate(e) {
    e.preventDefault();
    openCertificateWindow(`Certificate - ${name}`, buildCertificateHtml({
      name,
      tickedKeys: ticked,
      validFrom: validFrom ? new Date(validFrom) : null,
      validTo: validTo ? new Date(validTo) : null,
      assessorName,
    }));
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Generate a Skippers completion certificate for any crew member - tick whichever course(s) were completed, set the validity dates, and print.
      </div>
      <form className="card" onSubmit={generate}>
        <div className="field"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="field">
          <label>Course(s) completed</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {CERTIFICATE_CHECKLIST.map((item) => (
              <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={ticked.includes(item.key)} onChange={() => toggle(item.key)} />
                {item.label}
              </label>
            ))}
          </div>
        </div>
        <div className="grid2">
          <div className="field"><label>Valid From</label><input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /></div>
          <div className="field"><label>Expiry (Valid To)</label><input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} /></div>
        </div>
        <div className="field"><label>Assessor name</label><input value={assessorName} onChange={(e) => setAssessorName(e.target.value)} /></div>
        <button type="submit" className="primary" disabled={!name.trim() || ticked.length === 0}>Generate Certificate</button>
      </form>
    </div>
  );
}
