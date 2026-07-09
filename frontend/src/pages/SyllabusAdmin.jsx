import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { TabBar } from '../components/TabBar';
import { CONTINUOUS_IMPROVEMENT_ROLES } from '../lib/roles';
import { formatFleet } from '../lib/format';

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
    setForm({ fleets: [item.fleet], category: item.category, description: item.description, notes: item.notes || '', required: item.required });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const { fleets, ...rest } = form;
    if (fleets.length === 0) { setError('Pick at least one fleet'); return; }
    try {
      if (editingId) {
        await api.patch(`/api/ground-school/items/${editingId}`, { ...rest, fleet: fleets[0] });
      } else {
        // One item per fleet ticked, so the same course/exam can be added
        // for several fleets at once instead of repeating this form.
        for (const fleet of fleets) {
          await api.post('/api/ground-school/items', { ...rest, fleet });
        }
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
                {FLEETS.map((f) => <option key={f} value={f}>{formatFleet(f)}</option>)}
              </select>
            ) : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {FLEETS.map((f) => (
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
const NEW_SECTION_VALUE = '__new__';

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
    const { fleets, ...rest } = form;
    if (fleets.length === 0) { setError('Pick at least one fleet'); return; }
    try {
      const payload = { ...rest, phase: Number(form.phase) };
      if (editingId) {
        await api.patch(`/api/syllabus/items/${editingId}`, { ...payload, fleet: fleets[0] });
      } else {
        // One item per fleet ticked, so the same syllabus item can be
        // added for every pilot (or cabin crew) fleet in one go.
        for (const fleet of fleets) {
          await api.post('/api/syllabus/items', { ...payload, fleet });
        }
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
          <div className="field">
            <label>Fleet{!editingId ? 's' : ''}</label>
            {editingId ? (
              <select value={form.fleets[0]} onChange={(e) => setForm({ ...form, fleets: [e.target.value] })}>
                {FLEETS.map((f) => <option key={f} value={f}>{formatFleet(f)}</option>)}
              </select>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button type="button" onClick={() => setForm({ ...form, fleets: PILOT_FLEETS })}>All pilot fleets</button>
                  <button type="button" onClick={() => setForm({ ...form, fleets: CA_FLEETS })}>All cabin crew fleets</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {FLEETS.map((f) => (
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
              {SECTIONS.map((s) => <option key={s} value={s}>{s === 'SYLLABUS' ? 'Syllabus' : 'Line Training Discussion'}</option>)}
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
              <div style={{ flex: 1, fontWeight: 500 }}>{formatFleet(fleet)}</div>
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

const CHECK_FORM_TABS = [
  { key: 'EMERGENCY_PROCEDURES', label: 'Emergency Procedures' },
  { key: 'PROFICIENCY_CHECK', label: 'Proficiency Check / IPC' },
  { key: 'CABIN_ATTENDANT_LINE_CHECK', label: 'Line Check (CA)' },
  { key: 'PILOT_LINE_CHECK', label: 'Line Check (Pilot)' },
  { key: 'CHECK_TO_LINE', label: 'Check to Line (Pilot)' },
  { key: 'GROUND_INSTRUCTOR_COMPETENCY', label: 'Ground Instructor Check' },
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
// pilot Check to Line, and Ground Instructor Competency Check forms (see
// EpChecks.jsx/ProficiencyChecks.jsx/CaChecks.jsx/PilotLineCheck.jsx/
// CtlForm.jsx/GroundInstructorCheckForm.jsx) instead of being fixed in
// source code.
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
          {!isCtl && formKey !== 'GROUND_INSTRUCTOR_COMPETENCY' && (
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
                <option value="tick_approach">Tick + instrument approach type</option>
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
                  {item.kind === 'tick_approach' ? ' · Tick + approach type' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => openEditForm(item)}>Edit</button>
                <button onClick={() => toggleArchive(item)}>{item.archived ? 'Unarchive' : 'Archive'}</button>
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

function CompetencyTypesSection() {
  const [types, setTypes] = useState([]);
  const [name, setName] = useState('');
  const [appliesTo, setAppliesTo] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingAppliesTo, setEditingAppliesTo] = useState('');
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
      await api.post('/api/competency-types', { name: name.trim(), appliesTo: appliesTo || null });
      setName('');
      setAppliesTo('');
      load();
    } catch (err) { setError(err.message); }
  }

  async function saveName(id) {
    if (!editingName.trim()) return;
    setError(null);
    try {
      await api.patch(`/api/competency-types/${id}`, { name: editingName.trim(), appliesTo: editingAppliesTo || null });
      setEditingId(null);
      load();
    } catch (err) { setError(err.message); }
  }

  async function toggleArchive(t) {
    setError(null);
    try { await api.patch(`/api/competency-types/${t.id}`, { archived: !t.archived }); load(); }
    catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
        Every active competency here is required for every crew member (unless scoped to pilots or cabin attendants only) - archiving one removes it from crew profiles going forward without losing past dates.
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
        <button type="submit" className="primary">Add</button>
      </form>
      {error && <div className="error-text">{error}</div>}

      {types.map((t) => (
        <div key={t.id} className="card row" style={{ cursor: 'default' }}>
          {editingId === t.id ? (
            <>
              <div style={{ flex: 1, display: 'flex', gap: 8, marginRight: 8 }}>
                <input style={{ flex: 1 }} value={editingName} onChange={(e) => setEditingName(e.target.value)} />
                <select value={editingAppliesTo} onChange={(e) => setEditingAppliesTo(e.target.value)} style={{ width: 180 }}>
                  <option value="">All crew</option>
                  <option value="PILOT">Pilots only</option>
                  <option value="CABIN_ATTENDANT">Cabin attendants only</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => saveName(t.id)}>Save</button>
                <button onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ flex: 1, fontWeight: 500, opacity: t.archived ? 0.6 : 1 }}>
                {t.name}
                {t.appliesTo ? ` (${APPLIES_TO_LABELS[t.appliesTo]})` : ''}
                {t.archived ? ' (archived)' : ''}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => { setEditingId(t.id); setEditingName(t.name); setEditingAppliesTo(t.appliesTo || ''); }}>Edit</button>
                <button onClick={() => toggleArchive(t)}>{t.archived ? 'Unarchive' : 'Archive'}</button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// Single home for all course/form/survey editing: Syllabus curriculum,
// Ground School courses/exams, check form item lists, the competency
// catalog, and the Continuous Improvement survey question bank. Survey
// Questions is HOTC/HOFO only (mirrors the Continuous Improvement
// analytics tab's own gating) even though the page itself is reachable by
// Flight Ops Admin too.
export function SyllabusAdmin() {
  const { user } = useAuth();
  const canManageSurveyQuestions = CONTINUOUS_IMPROVEMENT_ROLES.includes(user.role);
  const [tab, setTab] = useState('syllabus');

  const tabs = [
    { key: 'syllabus', label: 'Syllabus' },
    { key: 'ground-school', label: 'Ground School' },
    { key: 'check-forms', label: 'Check Forms' },
    { key: 'competencies', label: 'Competencies' },
    ...(canManageSurveyQuestions ? [{ key: 'survey', label: 'Survey Questions' }] : []),
  ];

  return (
    <div>
      <TabBar tabs={tabs} active={tab} onSelect={setTab} />
      {tab === 'syllabus' && <SyllabusItemsSection />}
      {tab === 'ground-school' && <GroundSchoolAdminSection />}
      {tab === 'check-forms' && <CheckFormItemsSection />}
      {tab === 'competencies' && <CompetencyTypesSection />}
      {tab === 'survey' && canManageSurveyQuestions && <SurveyQuestionsSection />}
    </div>
  );
}
