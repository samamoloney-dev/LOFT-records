import { useState } from 'react';

// Small reference-document icon next to a check-form item, opening an
// attached SOP excerpt/diagram in a new tab - same interaction pattern as
// NoteInfoIcon's "i" (a small circular button rather than permanently
// visible text/links cluttering the item row), but for a real attached
// file instead of inline guidance text.
//
// Deliberately not a plain <a href={dataUri} target="_blank">: modern
// browsers (Chrome in particular) block a link from navigating a new tab
// straight to a data: URL - the tab opens blank instead of showing the
// document. Converting to a blob URL first (same bytes, different URL
// scheme) isn't subject to that restriction.
export function ReferenceDocIcon({ document: doc, name }) {
  const [failed, setFailed] = useState(false);
  if (!doc) return null;

  async function open() {
    setFailed(false);
    try {
      const res = await fetch(doc);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      // The new tab has already started loading it by the time this fires -
      // safe to release rather than holding it for the rest of the page's
      // lifetime.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setFailed(true);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      title={failed ? 'Could not open this document' : (name ? `View ${name}` : 'View reference document')}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--border-strong)',
        background: failed ? 'var(--bg-danger)' : 'var(--surface-2)', fontSize: 9, lineHeight: 1, marginLeft: 6,
        padding: 0, cursor: 'pointer', verticalAlign: 'middle',
      }}
    >📄</button>
  );
}
