import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatDate } from '../lib/format';
import { viewFile } from '../lib/pdf';

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}

function nameFromFileName(fileName) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || fileName;
}

const MAX_BYTES = 10 * 1024 * 1024;
const PERSONAL_DEVELOPMENT = 'PERSONAL_DEVELOPMENT';
const todayIso = () => new Date().toISOString().slice(0, 10);

// A place to file scans/photos (JPEG or PDF) against a staff member's profile.
// Used for a Simulator Only Examiner's Examiner Proficiency Check paperwork
// (the default kind) and, with kind="PERSONAL_DEVELOPMENT", for every staff
// member's Personal Development evidence: each file is filed under one of the
// rotating topics with the date it was completed, and a summary above the list
// shows when each topic was last done. "Remove" archives rather than deletes,
// so the record is always kept.
export function StaffDocuments({ userId, title, description, kind }) {
  const isPd = kind === PERSONAL_DEVELOPMENT;
  // Human Factors for Supervisors files carry a completed date too, but have no topic.
  const dated = isPd || kind === 'HUMAN_FACTORS_SUPERVISOR';
  const [docs, setDocs] = useState(null);
  const [topics, setTopics] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [docDate, setDocDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function load() {
    const kindParam = kind ? `&kind=${kind}` : '';
    api.get(`/api/staff-documents?userId=${userId}&archived=${showArchived}${kindParam}`).then(setDocs).catch((e) => setError(e.message));
  }
  useEffect(load, [userId, showArchived, kind]);

  useEffect(() => {
    if (isPd) api.get('/api/personal-development-topics').then(setTopics).catch((e) => setError(e.message));
  }, [isPd]);

  async function upload(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    if (isPd && !topic) { setError('Choose the topic first'); return; }
    if (dated && !docDate) { setError('Enter the date it was completed first'); return; }
    const okType = /\.(pdf|jpe?g)$/i.test(file.name) || ['application/pdf', 'image/jpeg'].includes(file.type);
    if (!okType) { setError('Only JPEG or PDF files can be stored here'); return; }
    if (file.size > MAX_BYTES) { setError('That file is too large - the limit is about 10 MB'); return; }
    setBusy(true);
    try {
      const fileData = await readFileAsDataUrl(file);
      const body = { userId, name: name.trim() || (isPd ? topic : nameFromFileName(file.name)), fileName: file.name, fileData };
      if (kind) body.kind = kind;
      if (isPd) body.topic = topic;
      if (dated) body.documentDate = docDate;
      await api.post('/api/staff-documents', body);
      setName('');
      load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function view(doc) {
    setError(null);
    try {
      const full = await api.get(`/api/staff-documents/${doc.id}`);
      viewFile(full.fileData, full.mimeType);
    } catch (err) { setError(err.message); }
  }

  async function setArchived(doc, archive) {
    setError(null);
    try {
      await api.post(`/api/staff-documents/${doc.id}/${archive ? 'archive' : 'unarchive'}`);
      setDocs((ds) => ds.filter((d) => d.id !== doc.id));
    } catch (err) { setError(err.message); }
  }

  // Latest completed date per topic across the current (not removed) files -
  // every active topic is listed, plus any retired topic that still has files.
  const lastDone = {};
  if (isPd && !showArchived) {
    for (const d of docs || []) {
      if (d.topic && d.documentDate && (!lastDone[d.topic] || d.documentDate > lastDone[d.topic])) lastDone[d.topic] = d.documentDate;
    }
  }
  const summaryTopics = isPd && !showArchived
    ? [...new Set([...topics.map((t) => t.name), ...Object.keys(lastDone)])]
    : [];

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 500 }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{description}</div>
        </div>
        <button onClick={() => setShowArchived((v) => !v)}>{showArchived ? 'Show current' : 'Show removed'}</button>
      </div>

      {summaryTopics.length > 0 && docs !== null && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {summaryTopics.map((t) => (
            <span
              key={t} className="badge"
              style={{ background: lastDone[t] ? 'var(--bg-success)' : 'var(--bg-warning)', color: lastDone[t] ? 'var(--text-success)' : 'var(--text-warning)', padding: '3px 10px' }}
            >{t}: {lastDone[t] ? `last done ${formatDate(lastDone[t])}` : 'not yet done'}</span>
          ))}
        </div>
      )}

      {!showArchived && (
        <div className="grid2" style={{ marginTop: 10, alignItems: 'end' }}>
          {isPd && (
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor={`sd-topic-${kind || "x"}-${userId}`}>Topic</label>
              <select id={`sd-topic-${kind || "x"}-${userId}`} value={topic} disabled={busy} onChange={(e) => setTopic(e.target.value)}>
                <option value="">{topics.length === 0 ? 'No topics set up yet' : 'Choose a topic…'}</option>
                {topics.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>
          )}
          {dated && (
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor={`sd-date-${kind || "x"}-${userId}`}>Date completed</label>
              <input id={`sd-date-${kind || "x"}-${userId}`} type="date" max={todayIso()} value={docDate} disabled={busy} onChange={(e) => setDocDate(e.target.value)} />
            </div>
          )}
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`sd-name-${kind || "x"}-${userId}`}>Name (optional)</label>
            <input id={`sd-name-${kind || "x"}-${userId}`} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} placeholder={isPd ? 'Defaults to the topic' : `e.g. ${title} 2026`} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`sd-file-${kind || "x"}-${userId}`}>{busy ? 'Uploading…' : 'Add a JPEG or PDF'}</label>
            <input id={`sd-file-${kind || "x"}-${userId}`} type="file" accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg" disabled={busy} onChange={upload} />
          </div>
        </div>
      )}
      {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}

      <div style={{ marginTop: 10 }}>
        {docs === null && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</div>}
        {docs && docs.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{showArchived ? 'Nothing removed.' : 'No files on record yet.'}</div>
        )}
        {(docs || []).map((d) => (
          <div key={d.id} className="row" style={{ cursor: 'default', borderTop: '0.5px solid var(--border)', padding: '8px 0' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>
                {d.name}
                {d.topic && d.topic !== d.name ? <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}> · {d.topic}</span> : null}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {d.documentDate ? `Completed ${formatDate(d.documentDate)} · ` : ''}{d.fileName} · added {formatDate(d.createdAt)}{d.uploadedByName ? ` by ${d.uploadedByName}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => view(d)}>View</button>
              <button onClick={() => setArchived(d, !showArchived)}>{showArchived ? 'Restore' : 'Remove'}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
