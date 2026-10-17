// Collects every call made in the same tick and answers them with one query.
// The roster-wide views (Crew list, Home dashboard) work out each person's
// currency independently, all at once - that was ~25 separate database
// queries per person (1,500+ for 62 people). Wrapping each per-person lookup
// in a batch loader turns "62 people each asking one question" into one query
// for everyone, without changing what any lookup returns. Nothing is cached:
// each batch is a fresh query, so results are never stale.
//
// loadMany(keys) receives the distinct keys and returns a Map of key -> value;
// a key missing from the Map resolves to undefined.
function batchLoader(loadMany) {
  let pending = null;
  return (key) => new Promise((resolve, reject) => {
    if (!pending) {
      const batch = { entries: [] };
      pending = batch;
      setImmediate(async () => {
        pending = null;
        try {
          const results = await loadMany([...new Set(batch.entries.map((e) => e.key))]);
          for (const e of batch.entries) e.resolve(results.get(e.key));
        } catch (err) {
          for (const e of batch.entries) e.reject(err);
        }
      });
    }
    pending.entries.push({ key, resolve, reject });
  });
}

module.exports = { batchLoader };
