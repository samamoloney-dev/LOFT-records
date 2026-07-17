import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { TabBar } from '../components/TabBar';
import { CONTINUOUS_IMPROVEMENT_ROLES, UPGRADE_VARIANTS } from '../lib/roles';
import { formatFleet, formatUserRole } from '../lib/format';

const FLEETS = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];
const ROLE_SCOPES = ['BOTH', 'CAPTAIN_ONLY', 'FO_ONLY'];
const SECTIONS = ['SYLLABUS', 'DISCUSSION'];

// Pilot and cabin attendant ground school are entirely separate training
// programmes - a category name matching between them (e.g. both happening
// to use "Course") is coincidence, not a real comparable subject, so
// suggestions/grouping must never cross this line. Fleets within the same
// group (Dash 8/Fokker 100/Metro for pilots) can genuinely share a
// category, since that's the same kind of training on a different type.
const CA_FLEETS = ['CA_DASH_8', 'CA_FOKKER_100'];
const PILOT_FLEETS = ['DASH_8', 'FOKKER_100', 'METRO_23'];
function fleetGroup(fleet) {
  return CA_FLEETS.includes(fleet) ? 'CA' : 'PILOT';
}

// fleets is always an array in form state (see emptyGroundSchoolForm's
// comment below for why) - "All pilot fleets"/"All cabin crew fleets"
// just set it to PILOT_FLEETS/CA_FLEETS in one click instead of ticking
// each box.
const emptyForm = () => ({ fleets: ['DASH_8'], roleScope: 'BOTH', phase: 1, category: '', section: 'SYLLABUS', description: '', notes: '', required: true });

// fleets is always an array in form state - when creating, every fleet
// ticked gets its own item (one POST per fleet, see handleSubmit); when
// editing an existing item, it's just a single-element array since one
// row can only ever belong to one fleet.
const emptyGroundSchoolForm = () => ({ fleets: ['DASH_8'], category: '', description: '', notes: '', required: true });

function GroundSchoolAdminSection() {
  const { user } = useAuth();
  // Cabin Attendant Manager can edit ground school here too, but only cabin
  // attendant fleets - the backend enforces this too (see ground-school.js
  // forbiddenFleetForCaManager), this just keeps the picker from offering a
  // choice that would just get rejected.
  const isCaManager = user.role === 'CA_MANAGER';
  const fleetOptions = isCaManager ? CA_FLEETS : FLEETS;
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
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
    setForm({ ...emptyGroundSchoolForm(), fleets: [fleetOptions[0]] });
    setShowForm((v) => !v);
  }

  function openEditForm(item) {
    setEditingId(item.id);
    setForm({ fleets: [item.fleet], category: item.category, description: item.description, notes: item.notes || '', required: item.required });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const { fleets, ...rest } = form;
    if (fleets.length === 0) { setError('Pick at least one fleet'); return; }
    try {
      let anyPending = false;
      if (editingId) {
        const res = await api.patch(`/api/ground-school/items/${editingId}`, { ...rest, fleet: fleets[0] });
        anyPending = !!res?.pending;
      } else {
        // One item per fleet ticked, so the same course/exam can be added
        // for several fleets at once instead of repeating this form.
        for (const fleet of fleets) {
          const res = await api.post('/api/ground-school/items', { ...rest, fleet });
          if (res?.pending) anyPending = true;
        }
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyGroundSchoolForm());
      load();
      if (anyPending) setNotice('Submitted for HOTC approval - this will appear once approved.');
    } catch (err) { setError(err.message); }
  }

  async function remove(item) {
    if (!window.confirm(`Permanently delete "${item.description}"? Any trainee's progress against it will be deleted too. This cannot be undone.`)) return;
    setError(null);
    setNotice(null);
    try {
      const res = await api.delete(`/api/ground-school/items/${item.id}`);
      load();
      if (res?.pending) setNotice('Deletion submitted for HOTC approval.');
    } catch (err) { setError(err.message); }
  }

  const byFleet = items.reduce((acc, item) => {
    (acc[item.fleet] ||= []).push(item);
    return acc;
  }, {});
  // Category suggestions never cross the pilot/cabin attendant line - only
  // fleets in the same group as whatever's currently selected contribute.
  const currentGroup = form.fleets[0] ? fleetGroup(form.fleets[0]) : null;
  const categories = [...new Set(
    items.filter((item) => fleetGroup(item.fleet) === currentGroup).map((item) => item.category),
  )].sort();

  // Ticking a fleet from the other group (pilot vs CA) replaces the
  // selection rather than adding to it - one item creation never spans
  // both, since they're not comparable training programmes.
  function toggleFleet(f, checked) {
    if (checked && form.fleets.length > 0 && fleetGroup(f) !== fleetGroup(form.fleets[0])) {
      setForm({ ...form, fleets: [f], category: '' });
      return;
    }
    const fleets = checked ? [...form.fleets, f] : form.fleets.filter((x) => x !== f);
    setForm({ ...form, fleets, category: fleets.length === 0 ? '' : form.category });
  }

  return (
    <div style={{ marginTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Ground School courses/exams, by fleet</div>
        <button onClick={openCreateForm}>{showForm ? 'Cancel' : 'Add ground school item'}</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleSubmit}>
          <div className="field">
            <label>Fleet{!editingId ? 's' : ''}</label>
            {editingId ? (
              <select value={form.fleets[0]} onChange={(e) => setForm({ ...form, fleets: [e.target.value] })}>
                {fleetOptions.map((f) => <option key={f} value={f}>{formatFleet(f)}</option>)}
              </select>
            ) : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {fleetOptions.map((f) => (
                    <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox" style={{ width: 'auto' }}
                        checked={form.fleets.includes(f)}
                        onChange={(e) => toggleFleet(f, e.target.checked)}
                      />
                      {formatFleet(f)}
                    </label>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Creates this item for every fleet ticked - pilot and cabin attendant fleets can't be mixed in one item.
                </div>
              </>
            )}
          </div>
          <div className="field">
            <label>Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required>
              <option value="">— Select category —</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
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
      {notice && <div className="card" style={{ background: 'var(--bg-accent)', color: 'var(--text-accent)' }}>{notice}</div>}

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
              <div style={{ flex: 1, fontWeight: 500 }}>{formatFleet(fleet)}</div>
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
                      <button className="danger" onClick={() => remove(item)}>Remove</button>
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
const NEW_SECTION_VALUE = '__new__';

function SyllabusItemsSection() {
  const { user } = useAuth();
  // Cabin Attendant Manager can edit the LOFT Package here too, but only
  // cabin attendant fleets - see syllabus.js forbiddenFleetForCaManager.
  const isCaManager = user.role === 'CA_MANAGER';
  const fleetOptions = isCaManager ? CA_FLEETS : FLEETS;
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => ({ ...emptyForm(), fleets: [isCaManager ? CA_FLEETS[0] : 'DASH_8'] }));
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
    // Already open (and not mid-edit) acts as Cancel; opening fresh from an
    // edit-in-progress or a closed state always lands on a blank form.
    const closing = showForm && !editingId;
    setEditingId(null);
    setForm({ ...emptyForm(), fleets: [fleetOptions[0]] });
    setAddingCategory(false);
    setShowForm(!closing);
  }

  function openEditForm(item) {
    setEditingId(item.id);
    setForm({
      fleets: [item.fleet],
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
    // The edit form renders inline next to the item itself (see
    // renderItemForm below) rather than at the top of the page - make sure
    // the fleet card it lives in is actually expanded so it's visible.
    setExpandedFleet(item.fleet);
  }

  // Categories already used for any of the ticked fleets, for this section
  // - "the current list of categories from the relevant syllabus" the
  // operator wants to pick from, with a way to add a new one when needed.
  const categoryOptions = [...new Set(
    items.filter((i) => form.fleets.includes(i.fleet) && i.section === form.section).map((i) => i.category),
  )].sort();

  // Ticking a fleet from the other group (pilot vs CA) replaces the
  // selection - one item creation never spans both.
  function toggleFleet(f, checked) {
    if (checked && form.fleets.length > 0 && fleetGroup(f) !== fleetGroup(form.fleets[0])) {
      setForm({ ...form, fleets: [f] });
      return;
    }
    setForm({ ...form, fleets: checked ? [...form.fleets, f] : form.fleets.filter((x) => x !== f) });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const { fleets, ...rest } = form;
    if (fleets.length === 0) { setError('Pick at least one fleet'); return; }
    try {
      const payload = { ...rest, phase: Number(form.phase) };
      let anyPending = false;
      if (editingId) {
        const res = await api.patch(`/api/syllabus/items/${editingId}`, { ...payload, fleet: fleets[0] });
        anyPending = !!res?.pending;
      } else {
        // One item per fleet ticked, so the same syllabus item can be
        // added for every pilot (or cabin crew) fleet in one go.
        for (const fleet of fleets) {
          const res = await api.post('/api/syllabus/items', { ...payload, fleet });
          if (res?.pending) anyPending = true;
        }
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      load();
      if (anyPending) setNotice('Submitted for HOTC approval - this will appear once approved.');
    } catch (err) { setError(err.message); }
  }

  async function remove(item) {
    if (!window.confirm(`Permanently delete "${item.description}"? Any trainee's progress against it will be deleted too. This cannot be undone.`)) return;
    setError(null);
    setNotice(null);
    try {
      const res = await api.delete(`/api/syllabus/items/${item.id}`);
      load();
      if (res?.pending) setNotice('Deletion submitted for HOTC approval.');
    } catch (err) { setError(err.message); }
  }

  const byFleet = items.reduce((acc, item) => {
    (acc[item.fleet] ||= []).push(item);
    return acc;
  }, {});

  // Shared by the top "Add" form (create) and the inline per-item form
  // (edit) below - editing opens right where the item already is instead
  // of forcing a scroll back up to a shared form at the top of the page.
  function renderItemForm() {
    return (
      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label>Fleet{!editingId ? 's' : ''}</label>
          {editingId ? (
            <select value={form.fleets[0]} onChange={(e) => setForm({ ...form, fleets: [e.target.value] })}>
              {fleetOptions.map((f) => <option key={f} value={f}>{formatFleet(f)}</option>)}
            </select>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {!isCaManager && <button type="button" onClick={() => setForm({ ...form, fleets: PILOT_FLEETS })}>All pilot fleets</button>}
                <button type="button" onClick={() => setForm({ ...form, fleets: CA_FLEETS })}>All cabin crew fleets</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {fleetOptions.map((f) => (
                  <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox" style={{ width: 'auto' }}
                      checked={form.fleets.includes(f)}
                      onChange={(e) => toggleFleet(f, e.target.checked)}
                    />
                    {formatFleet(f)}
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                Creates this item for every fleet ticked - pilot and cabin attendant fleets can't be mixed in one item.
              </div>
            </>
          )}
        </div>
        <div className="field">
          <label>Section</label>
          <select value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })}>
            {SECTIONS.map((s) => <option key={s} value={s}>{s === 'SYLLABUS' ? 'LOFT Package' : 'Line Training Discussion'}</option>)}
          </select>
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
        {error && <div className="error-text">{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="primary">{editingId ? 'Save changes' : 'Create'}</button>
          <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>LOFT Package curriculum, by fleet, section and phase</div>
        <button onClick={openCreateForm}>{showForm && !editingId ? 'Cancel' : 'Add LOFT Package item'}</button>
      </div>

      {showForm && !editingId && renderItemForm()}
      {!(showForm && !editingId) && error && <div className="error-text">{error}</div>}
      {notice && <div className="card" style={{ background: 'var(--bg-accent)', color: 'var(--text-accent)' }}>{notice}</div>}

      {Object.keys(byFleet).length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No LOFT Package items yet.</div>
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
              <div style={{ flex: 1, fontWeight: 500 }}>{formatFleet(fleet)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fleetItems.length} items</div>
            </div>
            {isExpanded && Object.entries(bySection).map(([section, categories]) => (
              <div key={section} style={{ marginTop: 12 }}>
                <div className="badge" style={{ background: 'var(--bg-accent)', color: 'var(--text-accent)', marginBottom: 8 }}>
                  {section === 'SYLLABUS' ? 'LOFT Package' : 'Line Training Discussion'}
                </div>
                {Object.entries(categories).map(([category, categoryItems]) => (
                  <div key={category} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{category}</div>
                    {categoryItems.map((item) => (
                      editingId === item.id ? (
                        <div key={item.id} style={{ marginBottom: 8 }}>{renderItemForm()}</div>
                      ) : (
                        <div key={item.id} className="row" style={{ cursor: 'default' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13 }}>{item.description}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                              Phase {item.phase} · {item.roleScope}{item.required ? ' · required' : ''}{item.notes ? ` · ${item.notes}` : ''}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => openEditForm(item)}>Edit</button>
                            <button className="danger" onClick={() => remove(item)}>Remove</button>
                          </div>
                        </div>
                      )
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

const CHECK_FORM_TABS = [
  { key: 'EMERGENCY_PROCEDURES', label: 'Emergency Procedures' },
  { key: 'PROFICIENCY_CHECK', label: 'Proficiency Check / IPC' },
  { key: 'CABIN_ATTENDANT_LINE_CHECK', label: 'Line Check (CA)' },
  { key: 'PILOT_LINE_CHECK', label: 'Line Check (Pilot)' },
  { key: 'CHECK_TO_LINE', label: 'Check to Line (Pilot)' },
  { key: 'GROUND_INSTRUCTOR_COMPETENCY', label: 'Ground Instructor Check' },
  { key: 'PERSONNEL_AIR_COMPETENCY', label: 'Personnel (Air) Competency Check' },
  // Upgrade Record briefing checklists (SA 507/510/522/523) - see
  // UpgradeRecordForm.jsx, which fetches these the same way as every other
  // check form's item list instead of a hardcoded array.
  ...Object.keys(UPGRADE_VARIANTS).map((variant) => ({
    key: `UPGRADE_${variant}`, label: `${UPGRADE_VARIANTS[variant].label} - Briefing`,
  })),
  // SA 507's FSM E5.2.3 required simulator training - Training Captain
  // upgrade only, see UpgradeRecordForm.jsx's Simulator tab.
  { key: 'UPGRADE_TRAINING_CAPTAIN_SIMULATOR', label: 'Training Captain Upgrade - Simulator Training' },
];

// Item kind is always a plain tick and there's no MOS reference for any of
// these form keys - they don't need the general item-type/MOS fields the
// aviation check forms use.
const NO_KIND_OR_MOS_FORMS = [
  'GROUND_INSTRUCTOR_COMPETENCY', 'PERSONNEL_AIR_COMPETENCY',
  ...Object.keys(UPGRADE_VARIANTS).map((v) => `UPGRADE_${v}`),
  'UPGRADE_TRAINING_CAPTAIN_SIMULATOR',
];

// Check to Line items vary per pilot fleet (the cabin attendant Check to
// Line items are a fixed 6-item list, not admin-editable here).
const CTL_FLEET_TABS = [
  { key: 'DASH_8', label: 'Dash 8' },
  { key: 'FOKKER_100', label: 'Fokker 100' },
  { key: 'METRO_23', label: 'Metro 23' },
];

const emptyCheckFormItemForm = (formKey, fleet) => ({ formKey, fleet: fleet || '', section: '', kind: 'tick', description: '', notes: '', mos: '', ipcOnly: false });

// One item list, editable here, drives the real Emergency Procedures,
// Proficiency Check/IPC, Cabin Attendant Line Check, pilot Line Check,
// pilot Check to Line, Ground Instructor Competency Check and Personnel
// (Air) Competency Check forms (see EpChecks.jsx/ProficiencyChecks.jsx/
// CaChecks.jsx/PilotLineCheck.jsx/CtlForm.jsx/GroundInstructorCheckForm.jsx/
// PersonnelCompetencyCheckForm.jsx) instead of being fixed in source code.
function CheckFormItemsSection() {
  const [formKey, setFormKey] = useState('EMERGENCY_PROCEDURES');
  const [ctlFleet, setCtlFleet] = useState('DASH_8');
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyCheckFormItemForm(formKey));
  const [error, setError] = useState(null);
  const isCtl = formKey === 'CHECK_TO_LINE';
  // Sections are grouped under named headings (e.g. "3.1 Pre-flight" etc.) -
  // picking from the headings already in use avoids near-duplicate sections
  // from a typo or slightly different wording, with a way to add a
  // genuinely new one when needed.
  const [addingSection, setAddingSection] = useState(false);

  function load() {
    const fleetParam = isCtl ? `&fleet=${ctlFleet}` : '';
    api.get(`/api/check-form-items?formKey=${formKey}${fleetParam}&includeArchived=true`).then(setItems).catch((e) => setError(e.message));
  }
  useEffect(load, [formKey, ctlFleet]);

  const sectionOptions = [...new Set(items.map((i) => i.section).filter(Boolean))].sort();

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyCheckFormItemForm(formKey, isCtl ? ctlFleet : ''));
    setAddingSection(false);
    setShowForm((v) => !v);
  }

  function openEditForm(item) {
    setEditingId(item.id);
    setForm({ formKey, fleet: item.fleet || '', section: item.section || '', kind: item.kind, description: item.description, notes: item.notes || '', mos: item.mos || '', ipcOnly: item.ipcOnly });
    setAddingSection(false);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        fleet: form.fleet || null, section: form.section || null, kind: form.kind,
        description: form.description, notes: form.notes || null, mos: form.mos || null, ipcOnly: form.ipcOnly,
      };
      if (editingId) {
        await api.patch(`/api/check-form-items/${editingId}`, payload);
      } else {
        await api.post('/api/check-form-items', { ...payload, formKey });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyCheckFormItemForm(formKey, isCtl ? ctlFleet : ''));
      load();
    } catch (err) { setError(err.message); }
  }

  async function toggleArchive(item) {
    setError(null);
    try { await api.patch(`/api/check-form-items/${item.id}`, { archived: !item.archived }); load(); }
    catch (err) { setError(err.message); }
  }

  async function remove(item) {
    if (!window.confirm(`Permanently delete "${item.description}"? This cannot be undone.`)) return;
    setError(null);
    try { await api.delete(`/api/check-form-items/${item.id}`); load(); }
    catch (err) { setError(err.message); }
  }

  const bySection = items.reduce((acc, item) => {
    (acc[item.section || '—'] ||= []).push(item);
    return acc;
  }, {});

  return (
    <div>
      <TabBar
        tabs={CHECK_FORM_TABS}
        active={formKey}
        onSelect={(key) => { setFormKey(key); setShowForm(false); setEditingId(null); setAddingSection(false); setForm(emptyCheckFormItemForm(key, key === 'CHECK_TO_LINE' ? ctlFleet : '')); }}
      />
      {formKey === 'PILOT_LINE_CHECK' && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
          This is a minimal starter set for the Pilot Line Check (SA_490) - add the rest of the real
          form's items here. "Refresher training and check" is a special case handled by name and is
          always auto-ticked from the crew member's Refresher Training competency, not editable per check.
        </div>
      )}
      {isCtl && (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
            The cabin attendant Check to Line uses a fixed 6-item list and isn't editable here.
          </div>
          <TabBar
            tabs={CTL_FLEET_TABS}
            active={ctlFleet}
            onSelect={(fleet) => { setCtlFleet(fleet); setShowForm(false); setEditingId(null); setForm(emptyCheckFormItemForm(formKey, fleet)); }}
          />
        </>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button onClick={openCreateForm}>{showForm ? 'Cancel' : 'Add item'}</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleSubmit}>
          <div className="field">
            <label>Section (optional grouping heading)</label>
            {addingSection || sectionOptions.length === 0 ? (
              <>
                <input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} placeholder="New section name" />
                {sectionOptions.length > 0 && (
                  <button type="button" onClick={() => { setAddingSection(false); setForm({ ...form, section: sectionOptions[0] }); }} style={{ marginTop: 6 }}>
                    Choose an existing section instead
                  </button>
                )}
              </>
            ) : (
              <select
                value={form.section}
                onChange={(e) => {
                  if (e.target.value === NEW_SECTION_VALUE) { setAddingSection(true); setForm({ ...form, section: '' }); }
                  else setForm({ ...form, section: e.target.value });
                }}
              >
                <option value="">— No section —</option>
                {sectionOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                <option value={NEW_SECTION_VALUE}>+ Add new section</option>
              </select>
            )}
          </div>
          <div className="field"><label>Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></div>
          {isCtl && (
            <div className="field"><label>Notes (optional)</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          )}
          {!isCtl && !NO_KIND_OR_MOS_FORMS.includes(formKey) && (
            <div className="field"><label>MOS reference (optional)</label><input value={form.mos} onChange={(e) => setForm({ ...form, mos: e.target.value })} /></div>
          )}
          {formKey === 'CABIN_ATTENDANT_LINE_CHECK' && (
            <div className="field">
              <label>Item type</label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="tick">Tick (S/X/N)</option>
                <option value="score_code">Score + code (NTS marker)</option>
              </select>
            </div>
          )}
          {formKey === 'PILOT_LINE_CHECK' && (
            <div className="field">
              <label>Item type</label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="tick">Tick (satisfactory/not)</option>
                <option value="text">Free text</option>
                <option value="score">Score (1-5, no code)</option>
              </select>
            </div>
          )}
          {formKey === 'PROFICIENCY_CHECK' && (
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={form.ipcOnly} onChange={(e) => setForm({ ...form, ipcOnly: e.target.checked })} style={{ width: 'auto' }} />
                IPC and Proficiency Check only (not shown on a plain Proficiency Check)
              </label>
            </div>
          )}
          <button type="submit" className="primary">{editingId ? 'Save changes' : 'Create'}</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {items.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No items yet.</div>}
      {Object.entries(bySection).map(([section, sectionItems]) => (
        <div key={section} className="card">
          <div style={{ fontWeight: 500, marginBottom: 8 }}>{section}</div>
          {sectionItems.map((item) => (
            <div key={item.id} className="row" style={{ cursor: 'default' }}>
              <div style={{ flex: 1, opacity: item.archived ? 0.6 : 1 }}>
                <div style={{ fontSize: 13 }}>{item.description}{item.archived ? ' (archived)' : ''}</div>
                {item.notes && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.notes}</div>}
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {item.mos ? `MOS ${item.mos}` : ''}{item.ipcOnly ? ' · IPC only' : ''}
                  {item.kind === 'score_code' ? ' · Score + code' : ''}
                  {item.kind === 'text' ? ' · Free text' : ''}
                  {item.kind === 'score' ? ' · Score (1-5)' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => openEditForm(item)}>Edit</button>
                <button onClick={() => toggleArchive(item)}>{item.archived ? 'Unarchive' : 'Archive'}</button>
                <button className="danger" onClick={() => remove(item)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Competency types (Dangerous Goods, First Aid, etc.) - every active one
// is required for every crew member automatically (see crew.js GET
// /:id/competencies), so managing this list is the only "add a
// competency" step there is. No dropdown on the crew side - just this
// shared, extensible catalog.
const APPLIES_TO_LABELS = { PILOT: 'Pilots only', CABIN_ATTENDANT: 'Cabin attendants only' };

// Further scopes a Pilots-only competency to pilots who are also linked to
// a staff account holding one of these roles (e.g. a competency only
// Examiners need) - see 0077_competency_type_staff_roles.sql. Only
// meaningful when appliesTo is 'PILOT'; leaving none ticked applies to
// every pilot, same as before this option existed.
const STAFF_ROLE_VALUES = ['EXAMINER', 'CC', 'TRAINING_CAPTAIN'];

function StaffRolePicker({ value, onChange }) {
  function toggle(r) {
    onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r]);
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {STAFF_ROLE_VALUES.map((r) => (
        <div
          key={r}
          onClick={() => toggle(r)}
          style={{
            padding: '6px 12px', border: '0.5px solid var(--border-strong)', borderRadius: 8,
            cursor: 'pointer', fontSize: 13,
            background: value.includes(r) ? 'var(--bg-accent)' : 'var(--surface-2)',
            color: value.includes(r) ? 'var(--text-accent)' : 'inherit',
          }}
        >{formatUserRole(r)}</div>
      ))}
    </div>
  );
}

function CompetencyFleetPicker({ value, onChange }) {
  function toggle(f) {
    onChange(value.includes(f) ? value.filter((x) => x !== f) : [...value, f]);
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {FLEETS.map((f) => (
        <div
          key={f}
          onClick={() => toggle(f)}
          style={{
            padding: '6px 12px', border: '0.5px solid var(--border-strong)', borderRadius: 8,
            cursor: 'pointer', fontSize: 13,
            background: value.includes(f) ? 'var(--bg-accent)' : 'var(--surface-2)',
            color: value.includes(f) ? 'var(--text-accent)' : 'inherit',
          }}
        >{formatFleet(f)}</div>
      ))}
    </div>
  );
}

function CompetencyTypesSection() {
  const [types, setTypes] = useState([]);
  const [name, setName] = useState('');
  const [appliesTo, setAppliesTo] = useState('');
  const [fleets, setFleets] = useState([]);
  const [staffRoles, setStaffRoles] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingAppliesTo, setEditingAppliesTo] = useState('');
  const [editingFleets, setEditingFleets] = useState([]);
  const [editingStaffRoles, setEditingStaffRoles] = useState([]);
  const [error, setError] = useState(null);

  function load() {
    api.get('/api/competency-types?includeArchived=true').then(setTypes).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function addType(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      await api.post('/api/competency-types', {
        name: name.trim(), appliesTo: appliesTo || null, fleets: fleets.length ? fleets : null,
        staffRoles: appliesTo === 'PILOT' && staffRoles.length ? staffRoles : null,
      });
      setName('');
      setAppliesTo('');
      setFleets([]);
      setStaffRoles([]);
      load();
    } catch (err) { setError(err.message); }
  }

  async function saveName(id) {
    if (!editingName.trim()) return;
    setError(null);
    try {
      await api.patch(`/api/competency-types/${id}`, {
        name: editingName.trim(), appliesTo: editingAppliesTo || null, fleets: editingFleets.length ? editingFleets : null,
        staffRoles: editingAppliesTo === 'PILOT' && editingStaffRoles.length ? editingStaffRoles : null,
      });
      setEditingId(null);
      load();
    } catch (err) { setError(err.message); }
  }

  async function toggleArchive(t) {
    setError(null);
    try { await api.patch(`/api/competency-types/${t.id}`, { archived: !t.archived }); load(); }
    catch (err) { setError(err.message); }
  }

  async function remove(t) {
    if (!window.confirm(`Permanently delete "${t.name}"? Any crew member's dates already entered against it will be deleted too. This cannot be undone.`)) return;
    setError(null);
    try { await api.delete(`/api/competency-types/${t.id}`); load(); }
    catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
        Every active competency here is required for every crew member (unless scoped to pilots/cabin attendants, specific fleets, and/or a specific pilot staff role) - archiving one removes it from crew profiles going forward without losing past dates.
      </div>
      <form className="card" onSubmit={addType}>
        <div className="field"><label>Add a competency</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dangerous Goods" required /></div>
        <div className="field">
          <label>Applies to</label>
          <select value={appliesTo} onChange={(e) => setAppliesTo(e.target.value)}>
            <option value="">All crew</option>
            <option value="PILOT">Pilots only</option>
            <option value="CABIN_ATTENDANT">Cabin attendants only</option>
          </select>
        </div>
        <div className="field">
          <label>Fleets (leave none ticked for every fleet - e.g. tick only Fokker 100/Cabin Fokker 100 for a Fokker-specific course)</label>
          <CompetencyFleetPicker value={fleets} onChange={setFleets} />
        </div>
        {appliesTo === 'PILOT' && (
          <div className="field">
            <label>Pilot roles (leave none ticked for every pilot - tick one or more to require this only of pilots who are also staff with that role)</label>
            <StaffRolePicker value={staffRoles} onChange={setStaffRoles} />
          </div>
        )}
        <button type="submit" className="primary">Add</button>
      </form>
      {error && <div className="error-text">{error}</div>}

      {types.map((t) => (
        <div key={t.id} className="card" style={{ cursor: 'default' }}>
          {editingId === t.id ? (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input style={{ flex: 1 }} value={editingName} onChange={(e) => setEditingName(e.target.value)} />
                <select value={editingAppliesTo} onChange={(e) => setEditingAppliesTo(e.target.value)} style={{ width: 180 }}>
                  <option value="">All crew</option>
                  <option value="PILOT">Pilots only</option>
                  <option value="CABIN_ATTENDANT">Cabin attendants only</option>
                </select>
              </div>
              <CompetencyFleetPicker value={editingFleets} onChange={setEditingFleets} />
              {editingAppliesTo === 'PILOT' && (
                <div style={{ marginTop: 8 }}>
                  <StaffRolePicker value={editingStaffRoles} onChange={setEditingStaffRoles} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={() => saveName(t.id)}>Save</button>
                <button onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            </>
          ) : (
            <div className="row" style={{ cursor: 'default' }}>
              <div style={{ flex: 1, fontWeight: 500, opacity: t.archived ? 0.6 : 1 }}>
                {t.name}
                {t.appliesTo ? ` (${APPLIES_TO_LABELS[t.appliesTo]})` : ''}
                {(t.fleets || []).length ? ` (${t.fleets.map(formatFleet).join(', ')} only)` : ''}
                {(t.staffRoles || []).length ? ` (${t.staffRoles.map(formatUserRole).join(', ')} only)` : ''}
                {t.archived ? ' (archived)' : ''}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => { setEditingId(t.id); setEditingName(t.name); setEditingAppliesTo(t.appliesTo || ''); setEditingFleets(t.fleets || []); setEditingStaffRoles(t.staffRoles || []); }}>Edit</button>
                <button onClick={() => toggleArchive(t)}>{t.archived ? 'Unarchive' : 'Archive'}</button>
                <button className="danger" onClick={() => remove(t)}>Delete</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const CHANGE_TABLE_LABELS = { syllabus_items: 'LOFT Package item', ground_school_items: 'Ground school item' };
const CHANGE_ACTION_LABELS = { CREATE: 'Add', UPDATE: 'Update', DELETE: 'Delete' };

// Curriculum edits made by anyone other than HOTC (e.g. the Cabin Attendant
// Manager) queue here instead of applying immediately - see
// backend/src/lib/approvals.js. Only HOTC/Alternate can see or act on this
// (mirrors content-changes.js's own gating).
function PendingApprovalsSection() {
  const [changes, setChanges] = useState([]);
  const [error, setError] = useState(null);

  function load() {
    api.get('/api/content-changes').then(setChanges).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function approve(id) {
    setError(null);
    try { await api.post(`/api/content-changes/${id}/approve`); load(); }
    catch (err) { setError(err.message); }
  }

  async function reject(id) {
    setError(null);
    try { await api.post(`/api/content-changes/${id}/reject`); load(); }
    catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
        Curriculum changes submitted by someone other than HOTC wait here until reviewed - approving applies the change, rejecting discards it.
      </div>
      {error && <div className="error-text">{error}</div>}
      {changes.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Nothing awaiting approval.</div>
      )}
      {changes.map((c) => (
        <div key={c.id} className="card">
          <div style={{ fontWeight: 500 }}>
            {CHANGE_ACTION_LABELS[c.action]} - {CHANGE_TABLE_LABELS[c.tableName] || c.tableName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0' }}>{c.summary}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Submitted by {c.createdByName} · {new Date(c.createdAt).toLocaleString()}
          </div>
          {c.action !== 'DELETE' && c.proposedData && (
            <pre style={{ fontSize: 11, background: 'var(--surface-2)', padding: 8, borderRadius: 6, overflowX: 'auto' }}>
              {JSON.stringify(c.proposedData, null, 2)}
            </pre>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="primary" onClick={() => approve(c.id)}>Approve</button>
            <button className="danger" onClick={() => reject(c.id)}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Login banner telling HOTC/Alternate a curriculum change (e.g. from the
// Cabin Attendant Manager) is waiting on their review - mirrors
// MeetingMinutes.jsx's own MeetingMinutesAlert pattern.
export function ContentApprovalAlert() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const navigate = useNavigate();
  const canReview = user.role === 'HOTC' || user.role === 'ALTERNATE';

  useEffect(() => {
    if (!canReview) return;
    api.get('/api/content-changes').then((rows) => setCount(rows.length)).catch(() => {});
  }, [canReview]);

  if (!canReview || count === 0) return null;

  return (
    <div
      className="card row"
      style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)', marginBottom: '1rem', cursor: 'pointer' }}
      onClick={() => navigate('/syllabus?tab=approvals')}
    >
      <div style={{ flex: 1, fontSize: 13 }}>
        {count} curriculum change{count === 1 ? '' : 's'} awaiting your approval.
      </div>
    </div>
  );
}

// Single home for all course/form/survey editing: Syllabus curriculum,
// Ground School courses/exams, check form item lists, the competency
// catalog, and the Continuous Improvement survey question bank. Survey
// Questions is HOTC/HOFO only (mirrors the Continuous Improvement
// analytics tab's own gating) even though the page itself is reachable by
// Flight Ops Admin too. Cabin Attendant Manager only gets Ground School and
// LOFT Package (cabin attendant fleet only, see those sections) - Check
// Forms/Competencies/Survey Questions stay out of scope for that role.
export function SyllabusAdmin() {
  const { user } = useAuth();
  const canManageSurveyQuestions = CONTINUOUS_IMPROVEMENT_ROLES.includes(user.role);
  const isCaManager = user.role === 'CA_MANAGER';
  // Alternate mirrors HOTC everywhere else in the app (see
  // lib/approvals.js) - it gets the same review access here.
  const canReviewChanges = user.role === 'HOTC' || user.role === 'ALTERNATE';
  const [searchParams] = useSearchParams();
  // Lets ContentApprovalAlert's login banner land straight on the Pending
  // Approvals tab (?tab=approvals) instead of just the page default.
  const [tab, setTab] = useState(searchParams.get('tab') === 'approvals' && canReviewChanges ? 'approvals' : 'syllabus');

  const tabs = isCaManager
    ? [
      { key: 'ground-school', label: 'Ground School' },
      { key: 'syllabus', label: 'LOFT Package' },
    ]
    : [
      { key: 'ground-school', label: 'Ground School' },
      { key: 'syllabus', label: 'LOFT Package' },
      { key: 'check-forms', label: 'Check Forms' },
      { key: 'competencies', label: 'Competencies' },
      ...(canReviewChanges ? [{ key: 'approvals', label: 'Pending Approvals' }] : []),
      ...(canManageSurveyQuestions ? [{ key: 'survey', label: 'Survey Questions' }] : []),
    ];

  return (
    <div>
      <TabBar tabs={tabs} active={tab} onSelect={setTab} />
      {tab === 'syllabus' && <SyllabusItemsSection />}
      {tab === 'ground-school' && <GroundSchoolAdminSection />}
      {tab === 'check-forms' && !isCaManager && <CheckFormItemsSection />}
      {tab === 'competencies' && !isCaManager && <CompetencyTypesSection />}
      {tab === 'approvals' && canReviewChanges && <PendingApprovalsSection />}
      {tab === 'survey' && canManageSurveyQuestions && <SurveyQuestionsSection />}
    </div>
  );
}
