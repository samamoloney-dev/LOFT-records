import { api } from '../api/client';

// The line printed on every check form - "Check conducted IAW specific
// Instructor Reference Documents DOC###" - with the reference taken from the
// per-form list set on Edit Forms (GET /api/reference-docs). Fetched once and
// shared, so the forms on screen and the print builders (which are plain
// functions, not components) read the same values. A form with no reference
// confirmed yet shows the placeholder DOC###.
const PLACEHOLDER = 'DOC###';
let docs = null;
let loading = null;
const listeners = new Set();

function notify() { listeners.forEach((l) => l()); }

export function ensureReferenceDocs() {
  if (docs) return Promise.resolve(docs);
  if (!loading) {
    loading = api.get('/api/reference-docs')
      .then((rows) => { docs = Object.fromEntries(rows.map((r) => [r.formKey, r.docRef])); notify(); return docs; })
      .catch(() => { loading = null; return {}; });
  }
  return loading;
}

export function subscribeReferenceDocs(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// After an edit on Edit Forms, so open forms pick the new reference up at once.
export function setReferenceDocLocal(formKey, docRef) {
  docs = { ...(docs || {}), [formKey]: docRef };
  notify();
}

export function referenceDocLine(formKey) {
  return `Check conducted IAW specific Instructor Reference Documents ${(docs && docs[formKey]) || PLACEHOLDER}`;
}
