import { useEffect, useState } from 'react';
import { api } from '../api/client';

const FLEETS = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];
const ROLE_SCOPES = ['BOTH', 'CAPTAIN_ONLY', 'FO_ONLY'];
const SECTIONS = ['SYLLABUS', 'DISCUSSION'];

const emptyForm = () => ({ fleet: 'DASH_8', roleScope: 'BOTH', phase: 1, category: '', section: 'SYLLABUS', description: '', notes: '', required: true });

const emptyGroundSchoolForm = () => ({ fleet: 'DASH_8', category: '', description: '', notes: '', required: true });

function GroundSchoolAdminSection() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyGroundSchoolForm());
  const [expandedFleet, setExpandedFleet] = useState(null);

  function load() {
    api.get('/api/ground-school/items').then(setItems).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyGroundSchoolForm());
    setShowForm((v) => !v);
  }

  function openEditForm(item) {
    setEditingId(item.id);
    setForm({ fleet: item.fleet, category: item.category, description: item.description, notes: item.notes || '', required: item.required });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      if (editingId) {
        await api.patch(`/api/ground-school/items/${editingId}`, form);
      } else {
        await api.post('/api/ground-school/items', form);
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyGroundSchoolForm());
      load();
    } catch (err) { setError(err.message); }
  }

  async function remove(id) {
    setError(null);
    try { await api.delete(`/api/ground-school/items/${id}`); load(); }
    catch (err) { setError(err.message); }
  }

  const byFleet = items.reduce((acc, item) => {
    (acc[item.fleet] ||= []).push(item);
    return acc;
  }, {});

  return (
    <div style={{ marginTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Ground School courses/exams, by fleet</div>
        <button onClick={openCreateForm}>{showForm ? 'Cancel' : 'Add ground school item'}</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleSubmit}>
          <div className="field">
            <label>Fleet</label>
            <select value={form.fleet} onChange={(e) => setForm({ ...form, fleet: e.target.value })}>
              {FLEETS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Category (e.g. "Admin", "Course", "Dash 8 Ground School (Module CBT)")</label>
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required />
          </div>
          <div className="field">
            <label>Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          </div>
          <div className="field">
            <label>Notes (optional)</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={form.required}
                onChange={(e) => setForm({ ...form, required: e.target.checked })}
                style={{ width: 'auto' }}
              />
              Required
            </label>
          </div>
          <button type="submit" className="primary">{editingId ? 'Save changes' : 'Create'}</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {Object.keys(byFleet).length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No ground school items yet.</div>
      )}
      {Object.entries(byFleet).map(([fleet, fleetItems]) => {
        const byCategory = fleetItems.reduce((acc, item) => {
          (acc[item.category] ||= []).push(item);
          return acc;
        }, {});
        const isExpanded = expandedFleet === fleet;

        return (
          <div key={fleet} className="card">
            <div className="row" style={{ cursor: 'pointer' }} onClick={() => setExpandedFleet(isExpanded ? null : fleet)}>
              <div style={{ flex: 1, fontWeight: 500 }}>{fleet}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fleetItems.length} items</div>
            </div>
            {isExpanded && Object.entries(byCategory).map(([category, categoryItems]) => (
              <div key={category} style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{category}</div>
                {categoryItems.map((item) => (
                  <div key={item.id} className="row" style={{ cursor: 'default' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13 }}>{item.description}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {item.required ? 'required' : 'optional'}{item.notes ? ` · ${item.notes}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => openEditForm(item)}>Edit</button>
                      <button className="danger" onClick={() => remove(item.id)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function SyllabusAdmin() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [expandedFleet, setExpandedFleet] = useState(null);

  function load() {
    api.get('/api/syllabus/items').then(setItems).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm((v) => !v);
  }

  function openEditForm(item) {
    setEditingId(item.id);
    setForm({
      fleet: item.fleet,
      roleScope: item.roleScope,
      phase: item.phase,
      category: item.category,
      section: item.section,
      description: item.description,
      notes: item.notes || '',
      required: item.required,
    });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      if (editingId) {
        await api.patch(`/api/syllabus/items/${editingId}`, { ...form, phase: Number(form.phase) });
      } else {
        await api.post('/api/syllabus/items', { ...form, phase: Number(form.phase) });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      load();
    } catch (err) { setError(err.message); }
  }

  async function remove(id) {
    setError(null);
    try { await api.delete(`/api/syllabus/items/${id}`); load(); }
    catch (err) { setError(err.message); }
  }

  const byFleet = items.reduce((acc, item) => {
    (acc[item.fleet] ||= []).push(item);
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Syllabus curriculum, by fleet, section and phase</div>
        <button onClick={openCreateForm}>{showForm ? 'Cancel' : 'Add syllabus item'}</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleSubmit}>
          <div className="grid2">
            <div className="field">
              <label>Fleet</label>
              <select value={form.fleet} onChange={(e) => setForm({ ...form, fleet: e.target.value })}>
                {FLEETS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Section</label>
              <select value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })}>
                {SECTIONS.map((s) => <option key={s} value={s}>{s === 'SYLLABUS' ? 'Syllabus' : 'Line Training Discussion'}</option>)}
              </select>
            </div>
          </div>
          <div className="grid2">
            <div className="field">
              <label>Role scope</label>
              <select value={form.roleScope} onChange={(e) => setForm({ ...form, roleScope: e.target.value })}>
                {ROLE_SCOPES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Phase</label>
              <input type="number" min="1" value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })} required />
            </div>
          </div>
          <div className="field">
            <label>Category (section heading, e.g. "Pre-Departure" or "Fuel and Refuelling")</label>
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required />
          </div>
          <div className="field">
            <label>Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          </div>
          <div className="field">
            <label>Notes (optional)</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={form.required}
                onChange={(e) => setForm({ ...form, required: e.target.checked })}
                style={{ width: 'auto' }}
              />
              Required to complete phase
            </label>
          </div>
          <button type="submit" className="primary">{editingId ? 'Save changes' : 'Create'}</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {Object.keys(byFleet).length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No syllabus items yet.</div>
      )}
      {Object.entries(byFleet).map(([fleet, fleetItems]) => {
        const bySection = fleetItems.reduce((acc, item) => {
          (acc[item.section] ||= {});
          (acc[item.section][item.category] ||= []).push(item);
          return acc;
        }, {});
        const isExpanded = expandedFleet === fleet;

        return (
          <div key={fleet} className="card">
            <div className="row" style={{ cursor: 'pointer' }} onClick={() => setExpandedFleet(isExpanded ? null : fleet)}>
              <div style={{ flex: 1, fontWeight: 500 }}>{fleet}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fleetItems.length} items</div>
            </div>
            {isExpanded && Object.entries(bySection).map(([section, categories]) => (
              <div key={section} style={{ marginTop: 12 }}>
                <div className="badge" style={{ background: 'var(--bg-accent)', color: 'var(--text-accent)', marginBottom: 8 }}>
                  {section === 'SYLLABUS' ? 'Syllabus' : 'Line Training Discussion'}
                </div>
                {Object.entries(categories).map(([category, categoryItems]) => (
                  <div key={category} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{category}</div>
                    {categoryItems.map((item) => (
                      <div key={item.id} className="row" style={{ cursor: 'default' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13 }}>{item.description}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            Phase {item.phase} · {item.roleScope}{item.required ? ' · required' : ''}{item.notes ? ` · ${item.notes}` : ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => openEditForm(item)}>Edit</button>
                          <button className="danger" onClick={() => remove(item.id)}>Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}

      <GroundSchoolAdminSection />
    </div>
  );
}
