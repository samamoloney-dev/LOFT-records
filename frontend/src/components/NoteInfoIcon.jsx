import { useState } from 'react';

// Small "i" reference icon that reveals sign-off guidance on click, instead
// of the note being permanently visible text on the syllabus item itself.
export function NoteInfoIcon({ note }) {
  const [open, setOpen] = useState(false);
  if (!note) return null;

  return (
    <span style={{ position: 'relative', display: 'inline-block', marginLeft: 6 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Sign-off guidance"
        style={{
          width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--border-strong)',
          background: 'var(--surface-2)', fontSize: 10, lineHeight: '14px', padding: 0, cursor: 'pointer',
        }}
      >i</button>
      {open && (
        <div
          style={{
            position: 'absolute', zIndex: 10, top: 20, left: 0, width: 240,
            background: 'var(--surface-1)', border: '0.5px solid var(--border-strong)', borderRadius: 6,
            padding: '8px 10px', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >{note}</div>
      )}
    </span>
  );
}
