import { useCallback, useRef } from 'react';

// Ticking a box on a check form used to wait for the server to answer before
// the box changed, which on a slow connection felt like the click hadn't
// registered (and a second click in the meantime could be built on stale
// data). This applies the change on screen straight away, then sends the saves
// one at a time in the order they were made. The server's copy replaces the
// screen's only once the last save is back, so an older reply can never undo a
// newer click; if a save fails, onError is called so the form can reload the
// real state.
//
//   apply()      - change local state now
//   send()       - the request; resolves to the server's updated record
//   onServer(r)  - take the server's record (only called when nothing is queued)
//   onError(err) - report the failure and resync
export function useOptimisticSave() {
  const queue = useRef({ pending: 0, chain: Promise.resolve() });
  return useCallback(({ apply, send, onServer, onError }) => {
    const q = queue.current;
    apply();
    q.pending += 1;
    q.chain = q.chain.then(async () => {
      try {
        const updated = await send();
        q.pending -= 1;
        if (q.pending === 0) onServer(updated);
      } catch (err) {
        q.pending -= 1;
        onError(err);
      }
    });
    return q.chain;
  }, []);
}
