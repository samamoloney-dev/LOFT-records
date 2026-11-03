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

// A place to file scans/photos (JPEG or PDF) against a staff member's profile -
// used for a Simulator Only Examiner's Examiner Proficiency Check paperwork.
// "Remove" archives rather than deletes, so the record is always kept.
export function StaffDocuments({ userId, title, description }) {
  const [docs, setDocs] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/staff-documents?userId=${userId}&archived=${showArchived}`).then(setDocs).catch((e) => setError(e.message));
  }
  useEffect(load, [userId, showArchived]);

  async function upload(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    const okType = /\.(pdf|jpe?g)$/i.test(file.name) || ['application/pdf', 'image/jpeg'].includes(file.type);
    if (!okType) { setError('Only JPEG or PDF files can be stored here'); return; }
    if (file.size > MAX_BYTES) { setError('That file is too large - the limit is about 10 MB'); return; }
    setBusy(true);
    try {
      const fileData = await readFileAsDataUrl(file);
      await api.post('/api/staff-documents', { userId, name: name.trim() || nameFromFileName(file.name), fileName: file.name, fileData });
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

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 500 }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{description}</div>
        </div>
        <button onClick={() => setShowArchived((v) => !v)}>{showArchived ? 'Show current' : 'Show removed'}</button>
      </div>

      {!showArchived && (
        <div className="grid2" style={{ marginTop: 10, alignItems: 'end' }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`sd-name-${userId}`}>Name (optional)</label>
            <input id={`sd-name-${userId}`} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} placeholder="e.g. Examiner Proficiency Check 2026" />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`sd-file-${userId}`}>{busy ? 'Uploading…' : 'Add a JPEG or PDF'}</label>
            <input id={`sd-file-${userId}`} type="file" accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg" disabled={busy} onChange={upload} />
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
              <div style={{ fontWeight: 500, fontSize: 13 }}>{d.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {d.fileName} · added {formatDate(d.createdAt)}{d.uploadedByName ? ` by ${d.uploadedByName}` : ''}
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
