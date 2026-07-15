import { useEffect, useRef } from 'react';

// A textarea that grows to fit its content instead of scrolling inside a
// fixed-height box - never shrinks below minHeight, but always tall enough
// to show everything typed. Resizes on every value change (including the
// initial value on load, not just user typing).
export function AutoTextarea({ minHeight = 50, style, value, ...rest }) {
  const ref = useRef(null);

  function resize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  }

  useEffect(resize, [value, minHeight]);

  return (
    <textarea
      ref={ref}
      value={value}
      style={{ ...style, minHeight, overflow: 'hidden', resize: 'none' }}
      {...rest}
    />
  );
}
