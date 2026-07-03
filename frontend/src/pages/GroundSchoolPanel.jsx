import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/format';

function groupByCategory(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  }
  return groups;
}

// Which extra fields a category needs beyond the standard tick/name/date
// sign-off, per SA_632: Course needs a completed date; the Dash 8 Ground
// School modules need a completed date and pass mark %; Observation
// Flights need a date and route. Rendered as aligned table columns
// alongside the description, rather than a separate labelled box per item.
function extraFieldsForCategory(category) {
  if (category === 'Course') {
    return [{ key: 'completedDate', label: 'Completed', type: 'date', width: 150 }];
  }
  if (category === 'Dash 8 Ground School (Module CBT)' || category === 'Dash 8 Ground School (Instructor-led)') {
    return [
      { key: 'completedDate', label: 'Completed', type: 'date', width: 150 },
      { key: 'passMark', label: 'Pass mark %', type: 'number', width: 100 },
    ];
  }
  if (category === 'Observation Flights') {
    return [
      { key: 'date', label: 'Date', type: 'date', width: 150 },
      { key: 'route', label: 'Route', type: 'text', width: 130 },
    ];
  }
  return [];
}

function DetailInput({ item, field, onSave }) {
  const [value, setValue] = useState(item.details?.[field.key] || '');

  return (
    <input
      type={field.type}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onSave(item.id, { ...item.details, [field.key]: value })}
      style={{ fontSize: 13, padding: '6px 8px' }}
    />
  );
}

function GroundSchoolItemRow({ item, fields, gridTemplate, onSignOff, onSaveDetails }) {
  const { user } = useAuth();
  const [signing, setSigning] = useState(false);
  const [name, setName] = useState(item.signedOffByName || user.name);
  const [error, setError] = useState(null);

  async function confirm() {
    if (!name.trim()) return;
    setError(null);
    try {
      await onSignOff(item.id, name.trim());
      setSigning(false);
    } catch (err) { setError(err.message); }
  }

  return (
    <div style={{ borderBottom: '0.5px solid var(--border)', padding: '8px 6px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <button
            className={`tick-btn ${item.completedAt ? 'active-pass' : ''}`}
            onClick={() => setSigning((v) => !v)}
          >{item.completedAt ? '✓' : ''}</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13 }}>{item.description}</div>
            {item.notes && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.notes}</div>}
            {item.completedAt && (
              <div style={{ fontSize: 11, color: 'var(--text-success)' }}>
                Signed off by {item.signedOffByName} on {formatDate(item.completedAt)}
              </div>
            )}
          </div>
        </div>
        {fields.map((f) => (
          <DetailInput key={f.key} item={item} field={f} onSave={onSaveDetails} />
        ))}
      </div>
      {signing && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, marginLeft: 44, alignItems: 'center' }}>
          <input
            style={{ maxWidth: 220 }}
            placeholder="Signed off by (name)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button className="primary" onClick={confirm}>Sign off</button>
          <button onClick={() => setSigning(false)}>Cancel</button>
        </div>
      )}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

function CategoryNoteField({ traineeId, category, initialNotes }) {
  const [value, setValue] = useState(initialNotes || '');
  const [error, setError] = useState(null);

  async function save() {
    setError(null);
    try {
      await api.put(`/api/ground-school/trainee/${traineeId}/category-notes`, { category, notes: value });
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="field" style={{ marginTop: 12 }}>
      <label>Additional notes</label>
      <textarea value={value} onChange={(e) => setValue(e.target.value)} onBlur={save} style={{ minHeight: 60 }} />
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

function GroundSchoolCategoryCard({ category, items, traineeId, noteFor, onSignOff, onSaveDetails }) {
  const fields = extraFieldsForCategory(category);
  const gridTemplate = fields.length > 0 ? `1fr ${fields.map((f) => `${f.width}px`).join(' ')}` : '1fr';

  return (
    <div className="card">
      <div style={{ fontWeight: 500, marginBottom: fields.length > 0 ? 4 : 6 }}>{category}</div>
      {fields.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: 10, padding: '0 6px 4px' }}>
          <div />
          {fields.map((f) => (
            <div key={f.key} style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {f.label}
            </div>
          ))}
        </div>
      )}
      {items.map((item) => (
        <GroundSchoolItemRow
          key={item.id}
          item={item}
          fields={fields}
          gridTemplate={gridTemplate}
          onSignOff={onSignOff}
          onSaveDetails={onSaveDetails}
        />
      ))}
      {category === 'Pre-Simulator Assessment' && (
        <CategoryNoteField traineeId={traineeId} category={category} initialNotes={noteFor(category)} />
      )}
    </div>
  );
}

export function GroundSchoolPanel({ trainee }) {
  const [items, setItems] = useState([]);
  const [categoryNotes, setCategoryNotes] = useState([]);
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/ground-school/trainee/${trainee.id}`).then(setItems).catch((e) => setError(e.message));
  }
  useEffect(load, [trainee.id]);
  useEffect(() => {
    api.get(`/api/ground-school/trainee/${trainee.id}/category-notes`).then(setCategoryNotes).catch(() => {});
  }, [trainee.id]);

  async function signOff(itemId, signedOffByName) {
    await api.post(`/api/ground-school/trainee/${trainee.id}/complete`, { groundSchoolItemId: itemId, signedOffByName });
    load();
  }

  async function saveDetails(itemId, details) {
    await api.put(`/api/ground-school/trainee/${trainee.id}/items/${itemId}/details`, { details });
    load();
  }

  const outstanding = items.filter((i) => i.required && !i.completedAt);
  const grouped = groupByCategory(items);
  const noteFor = (category) => categoryNotes.find((n) => n.category === category)?.notes || '';

  return (
    <div>
      <div className="card">
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Ground School</div>
        {items.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No ground school items for this fleet yet.</div>
        ) : outstanding.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>All courses and exams complete.</div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-warning)' }}>
            {outstanding.length} course(s)/exam(s) outstanding before the simulator.
          </div>
        )}
      </div>

      {error && <div className="error-text">{error}</div>}

      {[...grouped.entries()].map(([category, categoryItems]) => (
        <GroundSchoolCategoryCard
          key={category}
          category={category}
          items={categoryItems}
          traineeId={trainee.id}
          noteFor={noteFor}
          onSignOff={signOff}
          onSaveDetails={saveDetails}
        />
      ))}
    </div>
  );
}
