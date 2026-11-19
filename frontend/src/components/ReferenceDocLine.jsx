import { useEffect, useState } from 'react';
import { ensureReferenceDocs, formFooterText, referenceDocLine, subscribeReferenceDocs } from '../lib/referenceDocs';

// "Form SA### Rev 27/01 - Check conducted IAW specific Instructor Reference
// Documents DOC###" - shown on each check form. formKey says which form's
// number, revision and reference to use.
export function ReferenceDocLine({ formKey }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const off = subscribeReferenceDocs(() => setTick((n) => n + 1));
    ensureReferenceDocs();
    return off;
  }, []);
  return <div className="ref-doc-line">{formFooterText(formKey)} · {referenceDocLine(formKey)}</div>;
}
