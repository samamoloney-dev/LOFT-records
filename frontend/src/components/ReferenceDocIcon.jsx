// Small reference-document icon next to a check-form item, opening an
// attached SOP excerpt/diagram in a new tab - same interaction pattern as
// NoteInfoIcon's "i" (a small circular button rather than permanently
// visible text/links cluttering the item row), but for a real attached
// file instead of inline guidance text.
export function ReferenceDocIcon({ document, name }) {
  if (!document) return null;

  return (
    <a
      href={document}
      target="_blank"
      rel="noreferrer"
      title={name ? `View ${name}` : 'View reference document'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--border-strong)',
        background: 'var(--surface-2)', fontSize: 9, lineHeight: 1, marginLeft: 6,
        textDecoration: 'none', color: 'inherit', cursor: 'pointer', verticalAlign: 'middle',
      }}
    >📄</a>
  );
}
