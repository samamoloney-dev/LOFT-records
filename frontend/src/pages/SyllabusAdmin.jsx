import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { TabBar } from '../components/TabBar';
import { CONTINUOUS_IMPROVEMENT_ROLES } from '../lib/roles';

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

// Syllabus curriculum items, by fleet/section/phase - one sub-tab of the
// Syllabus page (see SyllabusAdmin below), which is the single place all
// courses/forms/surveys get edited from.
const NEW_CATEGORY_VALUE = '__new__';

function SyllabusItemsSection() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [expandedFleet, setExpandedFleet] = useState(null);
  // Whether the Category field is showing a free-text box (for a brand new
  // category) rather than a dropdown of ones already in use for this
  // fleet/section - see categoryOptions below.
  const [addingCategory, setAddingCategory] = useState(false);

  function load() {
    api.get('/api/syllabus/items').then(setItems).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyForm());
    setAddingCategory(false);
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
    setAddingCategory(false);
    setShowForm(true);
  }

  // Categories already used for this fleet/section - "the current list of
  // categories from the relevant syllabus" the operator wants to pick from,
  // with a way to add a new one when needed.
  const categoryOptions = [...new Set(
    items.filter((i) => i.fleet === form.fleet && i.section === form.section).map((i) => i.category),
  )].sort();

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
            {addingCategory ? (
              <>
                <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="New category name" required />
                {categoryOptions.length > 0 && (
                  <button type="button" onClick={() => { setAddingCategory(false); setForm({ ...form, category: categoryOptions[0] }); }} style={{ marginTop: 6 }}>
                    Choose an existing category instead
                  </button>
                )}
              </>
            ) : (
              <select
                value={form.category}
                onChange={(e) => {
                  if (e.target.value === NEW_CATEGORY_VALUE) { setAddingCategory(true); setForm({ ...form, category: '' }); }
                  else setForm({ ...form, category: e.target.value });
                }}
                required
              >
                <option value="">— Select category —</option>
                {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value={NEW_CATEGORY_VALUE}>+ Add new category</option>
              </select>
            )}
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
    </div>
  );
}

const OPTION_LABELS = ['1 — lowest', '2', '3', '4', '5 — highest'];

// Add/edit form for one performance criteria and its 5 behavioural
// descriptors (worst to best) - shared between "Add question" and
// "Edit" so the two stay in sync.
function QuestionForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [text, setText] = useState(initial?.text || '');
  const [options, setOptions] = useState(initial?.options?.length === 5 ? initial.options : ['', '', '', '', '']);

  function updateOption(i, value) {
    setOptions((opts) => opts.map((o, idx) => (idx === i ? value : o)));
  }

  function submit(e) {
    e.preventDefault();
    if (!text.trim() || options.some((o) => !o.trim())) return;
    onSubmit({ text: text.trim(), options: options.map((o) => o.trim()) });
  }

  return (
    <form onSubmit={submit} className="card">
      <div className="field"><label>Performance criteria (e.g. Technique)</label><input value={text} onChange={(e) => setText(e.target.value)} required /></div>
      {OPTION_LABELS.map((label, i) => (
        <div className="field" key={i}>
          <label>{label}</label>
          <textarea value={options[i]} onChange={(e) => updateOption(i, e.target.value)} style={{ minHeight: 60 }} required />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="primary">{submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

// HOTC/HOFO manage the Continuous Improvement question bank here too -
// archiving keeps historical data intact but removes the question from new
// surveys going forward. Moved onto the Syllabus tab so all course/form/
// survey editing lives in one place.
function SurveyQuestionsSection() {
  const [questions, setQuestions] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    api.get('/api/survey/questions?includeArchived=true').then(setQuestions).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function addQuestion(data) {
    setError(null);
    try {
      await api.post('/api/survey/questions', data);
      setShowAddForm(false);
      load();
    } catch (err) { setError(err.message); }
  }

  async function updateQuestion(id, patch) {
    setError(null);
    try {
      await api.patch(`/api/survey/questions/${id}`, patch);
      setEditingId(null);
      load();
    } catch (err) { setError(err.message); }
  }

  async function toggleArchive(q) {
    setError(null);
    try { await api.patch(`/api/survey/questions/${q.id}`, { archived: !q.archived }); load(); }
    catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Continuous Improvement survey questions</div>
        <button onClick={() => setShowAddForm((v) => !v)}>{showAddForm ? 'Cancel' : 'Add question'}</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
        Each question is a performance criteria (e.g. "Technique") with 5 behavioural descriptors, worst to best - the assessor picks whichever one matches. Archiving keeps past data but drops the question from new surveys.
      </div>
      {error && <div className="error-text">{error}</div>}

      {showAddForm && <QuestionForm submitLabel="Add question" onSubmit={addQuestion} />}

      {questions.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No questions yet - add your first one above.</div>}
      {questions.map((q) => (
        <div key={q.id} className="card">
          {editingId === q.id ? (
            <QuestionForm initial={q} submitLabel="Save changes" onSubmit={(data) => updateQuestion(q.id, data)} onCancel={() => setEditingId(null)} />
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 500, opacity: q.archived ? 0.6 : 1 }}>{q.text}{q.archived ? ' (archived)' : ''}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setEditingId(q.id)}>Edit</button>
                <button onClick={() => toggleArchive(q)}>{q.archived ? 'Unarchive' : 'Archive'}</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Single home for all course/form/survey editing: Syllabus curriculum,
// Ground School courses/exams, and the Continuous Improvement survey
// question bank. Survey Questions is HOTC/HOFO only (mirrors the
// Continuous Improvement analytics tab's own gating) even though the page
// itself is reachable by Flight Ops Admin too.
export function SyllabusAdmin() {
  const { user } = useAuth();
  const canManageSurveyQuestions = CONTINUOUS_IMPROVEMENT_ROLES.includes(user.role);
  const [tab, setTab] = useState('syllabus');

  const tabs = [
    { key: 'syllabus', label: 'Syllabus' },
    { key: 'ground-school', label: 'Ground School' },
    ...(canManageSurveyQuestions ? [{ key: 'survey', label: 'Survey Questions' }] : []),
  ];

  return (
    <div>
      <TabBar tabs={tabs} active={tab} onSelect={setTab} />
      {tab === 'syllabus' && <SyllabusItemsSection />}
      {tab === 'ground-school' && <GroundSchoolAdminSection />}
      {tab === 'survey' && canManageSurveyQuestions && <SurveyQuestionsSection />}
    </div>
  );
}
