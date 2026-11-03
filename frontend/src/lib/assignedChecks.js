import { useEffect, useState } from 'react';
import { api } from '../api/client';

// Check forms issued to the logged-in person and not yet completed, with the
// Checks tab each one lives on (GET /api/checks/assigned-to-me). One shared
// store, so the left-hand Checks item and the Checks page's own tabs always
// agree. Refreshed on a timer, when the window regains focus, and on demand.
const EMPTY = { total: 0, tops: {}, tabs: {} };
let state = EMPTY;
const listeners = new Set();
let timer = null;

export async function refreshAssignedChecks() {
  try {
    state = await api.get('/api/checks/assigned-to-me');
    listeners.forEach((l) => l(state));
  } catch {
    // A failed count just leaves the last known numbers in place.
  }
}

export function useAssignedChecks() {
  const [value, setValue] = useState(state);
  useEffect(() => {
    listeners.add(setValue);
    if (listeners.size === 1) {
      refreshAssignedChecks();
      timer = setInterval(refreshAssignedChecks, 45000);
      window.addEventListener('focus', refreshAssignedChecks);
    } else {
      setValue(state);
    }
    return () => {
      listeners.delete(setValue);
      if (listeners.size === 0) {
        clearInterval(timer);
        window.removeEventListener('focus', refreshAssignedChecks);
        state = EMPTY; // never carry one person's numbers over to the next login
      }
    };
  }, []);
  return value;
}
