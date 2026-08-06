import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { compressImage } from '../lib/imageCompress';
import { formatDate } from '../lib/format';

const emptyForm = () => ({ name: '', completedDate: '', notes: '' });

// Lets the user name a photo before picking it, rather than a blocking
// window.prompt after the fact - onUpload receives (name, file) and is
// responsible for the actual upload/compression.
function PhotoUploader({ onUpload }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function pick(file) {
    if (!file) return;
    setBusy(true);
    try {
      await onUpload(name.trim() || file.name.replace(/\.[^.]+$/, ''), file);
      setName('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid2" style={{ gap: 6 }}>
      <input placeholder="Photo name (optional)" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} />
      <input type="file" accept="image/*" disabled={busy} onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; pick(f); }} />
    </div>
  );
}

// Free-form training records that don't have their own dedicated check
// form (e.g. a water survival course, a manufacturer type course) - just a
// name, an optional completed date, and evidence photos attached to prove
// it happened, each separately named (e.g. "Certificate front"). Lives
// alongside Upgrade Records/GIC/PAC on the Specialist Training tab (see
// CrewDetail.jsx SpecialistTrainingTab), but isn't tied to any fixed form -
// purely a named list per crew member.
export function SpecialistTrainingItems({ crewMemberId, crewArchived }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState(null);

  function load() {
    setLoading(true);
    api.get(`/api/specialist-training?crewMemberId=${crewMemberId}`)
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [crewMemberId]);

  async function createItem(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setError(null);
    try {
      await api.post('/api/specialist-training', {
        crewMemberId,
        name: form.name.trim(),
        completedDate: form.completedDate || null,
        notes: form.notes || null,
      });
      setForm(emptyForm());
      setCreating(false);
      load();
    } catch (err) { setError(err.message); }
  }

  async function updateItem(item, patch) {
    setError(null);
    try {
      const updated = await api.patch(`/api/specialist-training/${item.id}`, patch);
      setItems((its) => its.map((i) => (i.id === updated.id ? updated : i)));
    } catch (err) { setError(err.message); }
  }

  async function deleteItem(item) {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await api.delete(`/api/specialist-training/${item.id}`);
      setItems((its) => its.filter((i) => i.id !== item.id));
    } catch (err) { setError(err.message); }
  }

  async function addPhoto(item, name, file) {
    setError(null);
    try {
      const data = await compressImage(file);
      const updated = await api.post(`/api/specialist-training/${item.id}/photos`, { name, data });
      setItems((its) => its.map((i) => (i.id === updated.id ? updated : i)));
    } catch (err) { setError(err.message); throw err; }
  }

  async function deletePhoto(item, photo) {
    if (!window.confirm(`Remove photo "${photo.name}"?`)) return;
    setError(null);
    try {
      const updated = await api.delete(`/api/specialist-training/${item.id}/photos/${photo.id}`);
      setItems((its) => its.map((i) => (i.id === updated.id ? updated : i)));
    } catch (err) { setError(err.message); }
  }

  if (loading) return <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Additional training that doesn't have its own form - name it, optionally note when it was completed, and attach evidence photos or screenshots.
        </div>
        {!crewArchived && <button onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'Add training'}</button>}
      </div>

      {creating && (
        <form className="card" onSubmit={createItem}>
          <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Water Survival Course" required /></div>
          <div className="field"><label>Completed date</label><input type="date" value={form.completedDate} onChange={(e) => setForm({ ...form, completedDate: e.target.value })} /></div>
          <div className="field"><label>Notes</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ minHeight: 60 }} /></div>
          <button type="submit" className="primary">Add training</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {items.length === 0 && !creating && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No additional training on file yet.</div>
      )}
      {items.map((item) => (
        <div key={item.id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontWeight: 500 }}>{item.name}</div>
            {!crewArchived && <button className="danger" onClick={() => deleteItem(item)}>Delete</button>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {item.completedDate ? `Completed ${formatDate(item.completedDate)}` : 'No completed date on file'}
          </div>

          <div className="grid2" style={{ marginTop: 8 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Completed date</label>
              {/* completedDate comes back from Postgres as a full ISO
                  timestamp (e.g. 2026-01-15T00:00:00.000Z) - a date input
                  only accepts the plain yyyy-mm-dd prefix, same fix used
                  elsewhere in the app (see Planning.jsx's plannedDate). */}
              <input type="date" disabled={crewArchived} defaultValue={item.completedDate ? item.completedDate.slice(0, 10) : ''} onBlur={(e) => updateItem(item, { completedDate: e.target.value || null })} />
            </div>
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea disabled={crewArchived} defaultValue={item.notes || ''} onBlur={(e) => updateItem(item, { notes: e.target.value || null })} style={{ minHeight: 50 }} />
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Photos</div>
            {(item.photos || []).length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>No photos attached yet.</div>
            )}
            {(item.photos || []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                {item.photos.map((photo) => (
                  <div key={photo.id} style={{ width: 140 }}>
                    <img src={photo.data} alt={photo.name} style={{ width: '100%', borderRadius: 6, display: 'block' }} />
                    <div style={{ fontSize: 11, marginTop: 2, wordBreak: 'break-word' }}>{photo.name}</div>
                    {!crewArchived && (
                      <button style={{ fontSize: 11, padding: '2px 6px', marginTop: 2 }} onClick={() => deletePhoto(item, photo)}>Remove</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!crewArchived && <PhotoUploader onUpload={(name, file) => addPhoto(item, name, file)} />}
          </div>
        </div>
      ))}
    </div>
  );
}
