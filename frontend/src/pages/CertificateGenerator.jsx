import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { openCertificateWindow } from '../lib/print';
import { buildCertificateHtml } from '../lib/printBuilders';

const todayIso = () => new Date().toISOString().slice(0, 10);

// Standalone certificate tool, matching the operator's Skippers paper
// certificate template - name, tick whichever course(s) were completed,
// set the validity dates, print. Deliberately manual/decoupled from any
// specific check record (unlike an earlier version of this that derived
// everything from a completed Emergency Procedures/Life Jacket/Smoke &
// Fire/F100 Slide check) - the operator asked for the simpler version,
// since it works for any crew member regardless of whether a matching
// check exists in this app at all. The checklist itself is admin-editable
// from the Syllabus tab (see SyllabusAdmin.jsx CertificateChecklistSection)
// rather than fixed in source.
export function CertificateGenerator() {
  const [checklist, setChecklist] = useState([]);
  const [name, setName] = useState('');
  const [ticked, setTicked] = useState([]);
  const [validFrom, setValidFrom] = useState(todayIso());
  const [validTo, setValidTo] = useState('');
  // Explicit "No Expiry" toggle - per the operator's explicit request,
  // rather than leaving the date field blank meaning the same thing
  // implicitly (which read as an unfinished field, not a deliberate
  // choice, e.g. for a once-off course like Life Jacket Training that
  // never needs renewing).
  const [noExpiry, setNoExpiry] = useState(false);
  const [assessorName, setAssessorName] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/certificate-checklist').then(setChecklist).catch((e) => setError(e.message));
  }, []);

  function toggle(id) {
    setTicked((t) => (t.includes(id) ? t.filter((k) => k !== id) : [...t, id]));
  }

  function generate(e) {
    e.preventDefault();
    openCertificateWindow(`Certificate - ${name}`, buildCertificateHtml({
      name,
      items: checklist,
      tickedKeys: ticked,
      validFrom: validFrom ? new Date(validFrom) : null,
      validTo: noExpiry || !validTo ? null : new Date(validTo),
      assessorName,
    }));
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Generate a Skippers completion certificate for any crew member - tick whichever course(s) were completed, set the validity dates, and print.
        The checklist itself is managed from the Syllabus tab's Certificate Checklist section.
      </div>
      {error && <div className="error-text">{error}</div>}
      <form className="card" onSubmit={generate}>
        <div className="field"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="field">
          <label>Course(s) completed</label>
          {checklist.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Loading checklist…</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {checklist.map((item) => (
              <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={ticked.includes(item.id)} onChange={() => toggle(item.id)} />
                {item.label}
              </label>
            ))}
          </div>
        </div>
        <div className="grid2">
          <div className="field"><label>Valid From</label><input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /></div>
          <div className="field">
            <label>Expiry (Valid To)</label>
            <input type="date" value={validTo} disabled={noExpiry} onChange={(e) => setValidTo(e.target.value)} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox" style={{ width: 'auto' }} checked={noExpiry}
                onChange={(e) => { setNoExpiry(e.target.checked); if (e.target.checked) setValidTo(''); }}
              />
              No Expiry
            </label>
          </div>
        </div>
        <div className="field"><label>Assessor name</label><input value={assessorName} onChange={(e) => setAssessorName(e.target.value)} /></div>
        <button type="submit" className="primary" disabled={!name.trim() || ticked.length === 0}>Generate Certificate</button>
      </form>
    </div>
  );
}
