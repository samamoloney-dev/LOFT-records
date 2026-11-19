import { api } from '../api/client';

// What every form shows about itself: its form number (SA###) and revision, and
// the line "Check conducted IAW specific Instructor Reference Documents DOC###".
// All three come from the per-form list set on Edit Forms (GET
// /api/reference-docs). Fetched once and shared, so the forms on screen and the
// print builders (which are plain functions, not components) read the same
// values. Until real numbers are confirmed a form shows the placeholders SA###
// and DOC###, and every form starts on revision 27/01.
const PLACEHOLDER = 'DOC###';
const DEFAULT_FORM_NUMBER = 'SA###';
const DEFAULT_REVISION = '27/01';
let docs = null;
let loading = null;
const listeners = new Set();

function notify() { listeners.forEach((l) => l()); }

export function ensureReferenceDocs() {
  if (docs) return Promise.resolve(docs);
  if (!loading) {
    loading = api.get('/api/reference-docs')
      .then((rows) => { docs = Object.fromEntries(rows.map((r) => [r.formKey, r])); notify(); return docs; })
      .catch(() => { loading = null; return {}; });
  }
  return loading;
}

export function subscribeReferenceDocs(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// After an edit on Edit Forms, so open forms pick the new values up at once.
export function setReferenceDocLocal(formKey, patch) {
  docs = { ...(docs || {}), [formKey]: { ...(docs?.[formKey] || {}), ...patch } };
  notify();
}

export function referenceDocLine(formKey) {
  return `Check conducted IAW specific Instructor Reference Documents ${docs?.[formKey]?.docRef || PLACEHOLDER}`;
}

// "Form SA### Rev 27/01" - on screen above each form and in the footer of every
// printed page.
export function formFooterText(formKey) {
  const d = docs?.[formKey];
  return `Form ${d?.formNumber || DEFAULT_FORM_NUMBER} Rev ${d?.revision || DEFAULT_REVISION}`;
}
