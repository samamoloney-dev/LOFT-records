import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { formatDate, formatFleet, formatTraineeRole } from '../lib/format';
import { AssignedToPicker } from '../components/AssignedToPicker';
import { DueBadge } from '../components/DueBadge';

// Maps a crew_planned_checks check_key to the CHECK_ACCESS_TYPES value
// AssignedToPicker/isEligibleForCheck expect (see
// backend/src/middleware/roles.js CHECK_ACCESS_TYPES), so the assignee
// dropdown only offers staff actually eligible for that check type.
const ACCESS_TYPE_FOR_KEY = {
  emergencyProcedures: 'EMERGENCY_PROCEDURES',
  ipc: 'IPC',
  proficiencyCheck: 'PC',
  lineCheck: 'LINE_CHECK',
};

// One central place to see everything coming up across the whole roster -
// planned recurrent checks (with an optional assigned examiner/instructor/
// check pilot), planned competency dates, and freeform planning items not
// tied to a specific crew member or check type. The per-crew-member planned
// date editors on each Crew profile still work exactly as before (see
// crew.js/CrewDetail.jsx) - this just aggregates them so HOTC/HOFO/Flight
// Ops Admin don't have to click through every profile to see what's ahead.
function PlannedChecksSection() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [savingKey, setSavingKey] = useState(null);

  function load() {
    api.get('/api/planning/planned-checks').then(setRows).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function updateDate(row, plannedDate) {
    setError(null);
    try {
      await api.put(`/api/crew/${row.crewMemberId}/planned-checks/${row.checkKey}`, { plannedDate: plannedDate || null });
      load();
    } catch (err) { setError(err.message); }
  }

  async function updateAssignee(row, staffMember) {
    setError(null);
    try {
      await api.put(`/api/crew/${row.crewMemberId}/planned-checks/${row.checkKey}`, {
        plannedDate: row.plannedDate,
        assignedTo: staffMember?.id || null,
      });
      load();
    } catch (err) { setError(err.message); }
  }

  // Separate, deliberate confirmation that this plan is actually on the
  // roster - not just a date and an assignee, both of which can exist
  // before anything's really booked in (mirrors IpcPcSpacingSection's own
  // "Mark rostered" button below, and crew.js's rostered gate on
  // create-check). A changed date/assignee already invalidates this
  // server-side (see crew.js PUT /planned-checks), so no client-side reset
  // needed here beyond the reload.
  async function toggleRostered(row) {
    const key = `${row.crewMemberId}-${row.checkKey}`;
    setSavingKey(key);
    setError(null);
    try {
      await api.put(`/api/crew/${row.crewMemberId}/planned-checks/${row.checkKey}`, { rostered: !row.rostered });
      load();
    } catch (err) { setError(err.message); }
    setSavingKey(null);
  }

  // Once a planned date, an assigned examiner/instructor/check pilot AND
  // an actual "Mark rostered" confirmation are all in place, this turns
  // the plan into the real (incomplete) check record - the row then
  // disappears since it's no longer just a plan. Requiring rostered too
  // (not just date+assignee) closes the loophole where a check form could
  // otherwise be created straight off a hopeful plan nobody had actually
  // confirmed was on the roster - crew.js enforces this server-side too.
  async function createCheck(row) {
    setError(null);
    try {
      await api.post(`/api/crew/${row.crewMemberId}/planned-checks/${row.checkKey}/create-check`);
      load();
    } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
        Planned simulator and line check dates, with an optional assigned examiner/instructor/check pilot -
        edit a date directly on a crew member's own Dates tab, or here. Once a date's actually confirmed on the
        schedule, click "Mark rostered" - only then can the check form itself be created.
      </div>
      {error && <div className="error-text">{error}</div>}
      {rows.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Nothing planned yet.</div>}
      {rows.map((r) => (
        <div key={`${r.crewMemberId}::${r.checkKey}`} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 500 }}>{r.crewMemberName}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.fleets.map(formatFleet).join(', ')} · {r.label}</div>
            </div>
          </div>
          <div className="grid2">
            <div className="field" style={{ margin: 0 }}>
              <label>Planned date</label>
              <input type="date" defaultValue={r.plannedDate || ''} onBlur={(e) => updateDate(r, e.target.value)} />
            </div>
            <AssignedToPicker
              value={r.assignedTo}
              accessType={ACCESS_TYPE_FOR_KEY[r.checkKey]}
              fleet={r.fleets?.length === 1 ? r.fleets[0] : undefined}
              onAssign={(s) => updateAssignee(r, s)}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <RosteredButton item={r} onToggle={() => toggleRostered(r)} saving={savingKey === `${r.crewMemberId}-${r.checkKey}`} />
          </div>
          {r.plannedDate && r.assignedTo && r.rostered && (
            <button className="primary" style={{ marginTop: 8 }} onClick={() => createCheck(r)}>Create check form</button>
          )}
        </div>
      ))}
    </div>
  );
}

function PlannedCompetenciesSection() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/api/planning/planned-competencies').then(setRows).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
        Planned competency dates - add or change these from a crew member's own Dates tab.
      </div>
      {error && <div className="error-text">{error}</div>}
      {rows.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Nothing planned yet.</div>}
      {/* Deep-links straight to the Expiration tab, per the operator's
          explicit request - overrides CrewDetail's own default (Clearance
          Form), since a planned competency date is exactly what that tab
          shows. */}
      {rows.map((r, i) => (
        <div key={i} className="card row" onClick={() => navigate(`/crew/${r.crewMemberId}?top=expiry`)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{r.crewMemberName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.fleets.map(formatFleet).join(', ')} · {r.name}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13 }}>Planned for {formatDate(r.plannedDate)}</div>
            {r.courseSent && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Course sent</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

const emptyNote = () => ({ title: '', notes: '', plannedDate: '' });

function OtherPlanningItemsSection() {
  const [notes, setNotes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyNote());
  const [error, setError] = useState(null);

  function load() {
    api.get('/api/planning/notes').then(setNotes).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyNote());
    setShowForm((v) => !v);
  }

  function openEditForm(note) {
    setEditingId(note.id);
    setForm({ title: note.title, notes: note.notes || '', plannedDate: note.plannedDate || '' });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      const payload = { title: form.title, notes: form.notes || null, plannedDate: form.plannedDate || null };
      if (editingId) await api.patch(`/api/planning/notes/${editingId}`, payload);
      else await api.post('/api/planning/notes', payload);
      setShowForm(false);
      setEditingId(null);
      setForm(emptyNote());
      load();
    } catch (err) { setError(err.message); }
  }

  async function remove(id) {
    setError(null);
    try { await api.delete(`/api/planning/notes/${id}`); load(); }
    catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Other planning items - not tied to a specific crew member or check type</div>
        <button onClick={openCreateForm}>{showForm ? 'Cancel' : 'Add planning item'}</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleSubmit}>
          <div className="field"><label>Title</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
          <div className="field"><label>Planned date (optional)</label><input type="date" value={form.plannedDate} onChange={(e) => setForm({ ...form, plannedDate: e.target.value })} /></div>
          <div className="field"><label>Notes (optional)</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ minHeight: 60 }} /></div>
          <button type="submit" className="primary">{editingId ? 'Save changes' : 'Add'}</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {notes.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Nothing here yet.</div>}
      {notes.map((n) => (
        <div key={n.id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 500 }}>{n.title}</div>
              {n.plannedDate && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Planned for {formatDate(n.plannedDate)}</div>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => openEditForm(n)}>Edit</button>
              <button onClick={() => remove(n.id)}>Delete</button>
            </div>
          </div>
          {n.notes && <div style={{ fontSize: 13, marginTop: 6 }}>{n.notes}</div>}
        </div>
      ))}
    </div>
  );
}

// A check is only actually non-compliant once it lapses past its own CASR
// recency limit (IPC: Part 61.880, 12 months from the last IPC; PC: 12
// months from the last one, under the operator's Part 121
// training-and-checking approval) - that's exactly what DueBadge's
// 'overdue' status already means everywhere else in the app, so this reuses
// the same signal rather than inventing a second one.
function isBreached(item) {
  return item?.status === 'overdue';
}

// Whether the next occurrence of a check has actually been organised, not
// just estimated - a planned date with no assigned examiner is a tentative
// plan, not a booking.
function organisedLabel(item) {
  if (!item) return null;
  if (item.plannedAssignedTo) return { text: `Booked with ${item.plannedAssignedTo.name}`, color: '#14632f' };
  if (item.plannedDate) return { text: 'Date planned - no examiner assigned yet', color: '#8a6100' };
  return { text: 'Not yet booked or rostered', color: 'var(--text-secondary)' };
}

// The hard rule the operator explicitly asked for: whether a planned date
// for this pilot's next check falls after nextDeadline - the CASR
// 121.575(1)(b) deadline computed server-side from their most recent two
// checks (see planning.js's GET /ipc-pc-spacing). This is NOT always 8
// months out - clause (iii) of that regulation often pulls it earlier,
// based on the OLDER of the two checks, whenever they're spaced more than
// ~4 months apart (the normal case at this operator's ~6-month cadence).
// A pilot planned past this date would have a real gap in valid Part 121
// proficiency check coverage before the planned date is even reached.
function exceedsLimit(item, nextDeadline) {
  return !!(item?.plannedDate && nextDeadline && new Date(item.plannedDate) > new Date(nextDeadline));
}

// Maps this tab's field names to the crew_planned_checks check_key the
// PUT /api/crew/:id/planned-checks/:checkKey route expects - 'ipc' matches
// already, but the Proficiency Check's own key is 'proficiencyCheck'.
const PLANNED_CHECK_KEY = { ipc: 'ipc', pc: 'proficiencyCheck' };

// Manual "actually on the roster" toggle - deliberately not derived from
// plannedDate/plannedAssignedTo like Currency Overview's own "Rostered"
// filter (which just means "has a planned date or issued check"). A date
// with an examiner assigned is still only a plan until someone confirms
// it's really on the schedule; needs a planned date to exist first (the
// backend rejects otherwise), so this button is hidden until one is set.
function RosteredButton({ item, onToggle, saving }) {
  if (!item?.plannedDate) return <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 6 }}>Set a date to enable rostering</div>;
  const isRostered = !!item.rostered;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={saving}
      style={{
        marginTop: 6, fontSize: 11, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
        border: isRostered ? '1px solid #1e5c1e' : '1px solid var(--border-strong)',
        background: isRostered ? '#d7f0d7' : 'var(--surface-2)',
        color: isRostered ? '#1e5c1e' : 'inherit',
      }}
    >{isRostered ? '✓ Rostered' : 'Mark rostered'}</button>
  );
}

// Replicates the operator's own IPC/PC forward-planning spreadsheet, but
// simplified to what's actually decision-relevant: real CASR compliance -
// both each check's own recency (reusing the same due-date/status the rest
// of the app already computes) and CASR 121.575(1)(b)'s cap on the gap
// between the last two (this operator's IPC also satisfies the Part 121
// proficiency check requirement, so that gap is exactly the lastIpc/lastPc
// spacing tracked here) - plus whether the next check has actually been
// booked/rostered, not just estimated. See backend/src/routes/planning.js's
// GET /ipc-pc-spacing for the full reasoning, including what this
// deliberately doesn't attempt to model.
function IpcPcSpacingSection() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [savingPlanKey, setSavingPlanKey] = useState(null);
  const navigate = useNavigate();

  // Computing currency for the whole pilot roster in one go (every check
  // type, every pilot) is genuinely slow on a cold connection - a couple of
  // seconds is normal, not a hang. Without its own loading state this would
  // flash "No pilots on file" for that whole stretch, which reads as the
  // roster being empty rather than still loading.
  function load() {
    setLoading(true);
    api.get('/api/planning/ipc-pc-spacing').then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function saveNote(row, value) {
    setSavingId(row.crewMemberId);
    setError(null);
    try {
      await api.patch(`/api/crew/${row.crewMemberId}`, { pcIpcOverrideComment: value || null });
      setRows((prev) => prev.map((r) => (r.crewMemberId === row.crewMemberId ? { ...r, note: value || null } : r)));
    } catch (err) { setError(err.message); }
    setSavingId(null);
  }

  // Saves a planned date for this pilot's next IPC or PC via the same
  // crew_planned_checks mechanism the Planned Checks tab and each crew
  // profile's own Dates tab already use - one shared source of truth for
  // what's actually planned, not a parallel system. Updates locally rather
  // than a full reload so the hard-limit warning appears instantly.
  async function savePlannedDate(row, field, value) {
    const key = `${row.crewMemberId}-${field}`;
    setSavingPlanKey(key);
    setError(null);
    try {
      await api.put(`/api/crew/${row.crewMemberId}/planned-checks/${PLANNED_CHECK_KEY[field]}`, { plannedDate: value || null });
      // A changed planned date invalidates any earlier "rostered"
      // confirmation server-side (see crew.js's PUT /planned-checks) -
      // mirrored here so the button reflects that without a full reload.
      setRows((prev) => prev.map((r) => (r.crewMemberId === row.crewMemberId
        ? { ...r, [field]: { ...r[field], plannedDate: value ? new Date(value).toISOString() : null, rostered: false } }
        : r)));
    } catch (err) { setError(err.message); }
    setSavingPlanKey(null);
  }

  // Manual "actually on the roster" confirmation, per the operator's
  // explicit request - distinct from having a planned date or an assigned
  // examiner, both of which can exist without this being true yet.
  async function toggleRostered(row, field) {
    const key = `${row.crewMemberId}-${field}-rostered`;
    const nextValue = !row[field]?.rostered;
    setSavingPlanKey(key);
    setError(null);
    try {
      await api.put(`/api/crew/${row.crewMemberId}/planned-checks/${PLANNED_CHECK_KEY[field]}`, { rostered: nextValue });
      setRows((prev) => prev.map((r) => (r.crewMemberId === row.crewMemberId
        ? { ...r, [field]: { ...r[field], rostered: nextValue } }
        : r)));
    } catch (err) { setError(err.message); }
    setSavingPlanKey(null);
  }

  const breaches = rows.filter((r) => isBreached(r.ipc) || isBreached(r.pc) || r.chainBreach || r.ipcHardBreach);
  const plannedBreaches = rows.filter((r) => (
    exceedsLimit(r.ipc, r.nextDeadline) || exceedsLimit(r.pc, r.nextDeadline) || exceedsLimit(r.ipc, r.ipcHardDeadline)
  ));

  // Section headers group by fleet + rank (e.g. "Fokker 100 - Captain") -
  // rows already arrive sorted this way from the backend.
  let lastGroup = null;

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
        Forward planning for pilot IPC/PC recurrency, covering two separate CASA rules with different arithmetic. CASR 61.880 is a hard
        rule for the IPC itself: it stays valid until the END of the calendar month, 12 months after the month it was completed in - not
        the same day next year (an IPC done 8/12, for example, is valid to 31/12 the following year). CASR 121.575(1)(b) covers the gap
        between successive Part 121 proficiency checks - since a completed IPC also satisfies that requirement here, this applies to the
        gap between a pilot's last IPC and last PC - and unlike Part 61, it's exact-day arithmetic, not month-end. That cap is usually
        earlier than 8 months - it's calculated per pilot below (shown as the deadline in any warning), since spacing checks more than
        ~4 months apart pulls it in based on the older of the two. Aim for roughly 6 months apart using the date fields below - if a date
        you enter would breach either rule, it's flagged immediately, labelled with which one, so you're never caught out by unexpected
        sim planning. None of this changes the crew currency dates shown elsewhere in the app (Currency Overview, the crew profile) -
        this is an additional safeguard on top of them. Once a date's actually confirmed on the schedule, click "Mark rostered" -
        separate from just having a planned date or an assigned examiner, since either of those can exist before it's really booked in.
        Use the Planning note to record why a check needed to be pushed earlier or later than the 6-month target.
      </div>

      {breaches.length > 0 && (
        <div className="card" style={{ background: '#f8caca', color: '#7a1414', marginBottom: '0.75rem' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ {breaches.length} pilot{breaches.length > 1 ? 's' : ''} currently non-compliant</div>
          {breaches.map((r) => (
            <div key={r.crewMemberId} style={{ fontSize: 13 }}>
              <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigate(`/crew/${r.crewMemberId}?top=expiry`)}>{r.name}</span>
              {' - '}
              {[
                isBreached(r.ipc) && 'IPC overdue',
                isBreached(r.pc) && 'PC overdue',
                r.chainBreach && 'IPC/PC gap exceeded 8 months (CASR 121.575)',
                r.ipcHardBreach && `IPC lapsed - CASR 61.880 (valid to end of ${formatDate(r.ipcHardDeadline)})`,
              ].filter(Boolean).join(', ')}
            </div>
          ))}
        </div>
      )}

      {plannedBreaches.length > 0 && (
        <div className="card" style={{ background: '#fdf2d0', color: '#8a6100', marginBottom: '0.75rem' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ {plannedBreaches.length} pilot{plannedBreaches.length > 1 ? 's' : ''} planned beyond a CASR deadline</div>
          {plannedBreaches.map((r) => {
            const issues = [
              exceedsLimit(r.ipc, r.nextDeadline) && `planned IPC would land after ${formatDate(r.nextDeadline)} (CASR 121.575)`,
              exceedsLimit(r.pc, r.nextDeadline) && `planned PC would land after ${formatDate(r.nextDeadline)} (CASR 121.575)`,
              exceedsLimit(r.ipc, r.ipcHardDeadline) && `planned IPC would land after ${formatDate(r.ipcHardDeadline)} (CASR 61.880)`,
            ].filter(Boolean);
            return (
              <div key={r.crewMemberId} style={{ fontSize: 13 }}>
                <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigate(`/crew/${r.crewMemberId}?top=expiry`)}>{r.name}</span>
                {' - '}{issues.join('; ')}
              </div>
            );
          })}
        </div>
      )}

      {error && <div className="error-text">{error}</div>}
      {loading && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>}
      {!loading && rows.length === 0 && !error && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No pilots on file.</div>}
      {!loading && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-strong)' }}>
                <th style={{ padding: '6px 8px' }}>Name</th>
                <th style={{ padding: '6px 8px' }}>IPC</th>
                <th style={{ padding: '6px 8px' }}>PC</th>
                <th style={{ padding: '6px 8px' }}>Spacing</th>
                <th style={{ padding: '6px 8px' }}>Planning note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const group = `${formatFleet(r.fleet)} - ${formatTraineeRole(r.role)}`;
                const showGroupHeader = group !== lastGroup;
                lastGroup = group;
                const ipcOrganised = organisedLabel(r.ipc);
                const pcOrganised = organisedLabel(r.pc);
                return (
                  <Fragment key={r.crewMemberId}>
                    {showGroupHeader && (
                      <tr>
                        <td colSpan={5} style={{ padding: '10px 8px 4px', fontWeight: 600, fontSize: 12.5, color: 'var(--text-secondary)' }}>{group}</td>
                      </tr>
                    )}
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                        <span style={{ cursor: 'pointer', color: 'var(--text-accent)' }} onClick={() => navigate(`/crew/${r.crewMemberId}?top=expiry`)}>{r.name}</span>
                      </td>
                      <td style={{ padding: '6px 8px', verticalAlign: 'top', minWidth: 150 }}>
                        <DueBadge label="IPC" info={r.ipc} />
                        {ipcOrganised && <div style={{ fontSize: 10.5, color: ipcOrganised.color, marginTop: 4 }}>{ipcOrganised.text}</div>}
                        {r.ipcHardDeadline && !exceedsLimit(r.ipc, r.ipcHardDeadline) && (
                          <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 4 }}>IPC valid to {formatDate(r.ipcHardDeadline)} (CASR 61.880)</div>
                        )}
                        <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 6 }}>Plan next for</div>
                        <input
                          type="date"
                          defaultValue={r.ipc?.plannedDate ? r.ipc.plannedDate.slice(0, 10) : ''}
                          disabled={savingPlanKey === `${r.crewMemberId}-ipc`}
                          onBlur={(e) => {
                            const current = r.ipc?.plannedDate ? r.ipc.plannedDate.slice(0, 10) : '';
                            if (e.target.value !== current) savePlannedDate(r, 'ipc', e.target.value);
                          }}
                          style={{ width: '100%', fontSize: 11, marginTop: 6 }}
                        />
                        {exceedsLimit(r.ipc, r.nextDeadline) && (
                          <div style={{ fontSize: 10.5, color: '#7a1414', fontWeight: 700, marginTop: 4 }}>⚠ Exceeds projected limit (CASR 121.575)</div>
                        )}
                        {exceedsLimit(r.ipc, r.ipcHardDeadline) && (
                          <div style={{ fontSize: 10.5, color: '#7a1414', fontWeight: 700, marginTop: 4 }}>⚠ Exceeds IPC hard limit (CASR 61.880) - valid to {formatDate(r.ipcHardDeadline)}</div>
                        )}
                        <div>
                          <RosteredButton item={r.ipc} onToggle={() => toggleRostered(r, 'ipc')} saving={savingPlanKey === `${r.crewMemberId}-ipc-rostered`} />
                        </div>
                      </td>
                      <td style={{ padding: '6px 8px', verticalAlign: 'top', minWidth: 150 }}>
                        <DueBadge label="PC" info={r.pc} />
                        {pcOrganised && <div style={{ fontSize: 10.5, color: pcOrganised.color, marginTop: 4 }}>{pcOrganised.text}</div>}
                        <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 6 }}>Plan next for</div>
                        <input
                          type="date"
                          defaultValue={r.pc?.plannedDate ? r.pc.plannedDate.slice(0, 10) : ''}
                          disabled={savingPlanKey === `${r.crewMemberId}-pc`}
                          onBlur={(e) => {
                            const current = r.pc?.plannedDate ? r.pc.plannedDate.slice(0, 10) : '';
                            if (e.target.value !== current) savePlannedDate(r, 'pc', e.target.value);
                          }}
                          style={{ width: '100%', fontSize: 11, marginTop: 6 }}
                        />
                        {exceedsLimit(r.pc, r.nextDeadline) && (
                          <div style={{ fontSize: 10.5, color: '#7a1414', fontWeight: 700, marginTop: 4 }}>⚠ Exceeds projected limit (CASR 121.575)</div>
                        )}
                        <div>
                          <RosteredButton item={r.pc} onToggle={() => toggleRostered(r, 'pc')} saving={savingPlanKey === `${r.crewMemberId}-pc-rostered`} />
                        </div>
                      </td>
                      <td style={{ padding: '6px 8px', verticalAlign: 'top', maxWidth: 170 }}>
                        {r.spacingDays === null ? (
                          <span style={{ color: 'var(--text-secondary)' }}>-</span>
                        ) : r.chainBreach ? (
                          <span style={{ color: '#7a1414', fontWeight: 700 }}>
                            ⚠ {(r.spacingDays / 30.44).toFixed(1)} months apart<br />
                            <span style={{ fontSize: 10.5, fontWeight: 400 }}>exceeds the 8-month CASR 121.575 limit</span>
                          </span>
                        ) : (
                          <span>
                            {(r.spacingDays / 30.44).toFixed(1)} months apart<br />
                            <span style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>
                              target ~6 months{r.nextDeadline && <> - next due by {formatDate(r.nextDeadline)}</>}
                            </span>
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '6px 8px', verticalAlign: 'top', minWidth: 180 }}>
                        <input
                          defaultValue={r.note || ''}
                          placeholder="e.g. simulator slot booked with 3rd party"
                          disabled={savingId === r.crewMemberId}
                          onBlur={(e) => { if (e.target.value !== (r.note || '')) saveNote(r, e.target.value); }}
                          style={{ width: '100%', fontSize: 12 }}
                        />
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const PLANNING_TABS = [
  { key: 'checks', label: 'Planned Checks' },
  { key: 'competencies', label: 'Planned Competencies' },
  { key: 'ipcPcSpacing', label: 'IPC/PC Spacing' },
  { key: 'other', label: 'Other Planning Items' },
];

export function Planning() {
  const [tab, setTab] = useState('checks');

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
        {PLANNING_TABS.map((t) => (
          <div
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '6px 12px', border: '0.5px solid var(--border-strong)', borderRadius: 8,
              cursor: 'pointer', fontSize: 13,
              background: tab === t.key ? 'var(--bg-accent)' : 'var(--surface-2)',
              color: tab === t.key ? 'var(--text-accent)' : 'inherit',
            }}
          >{t.label}</div>
        ))}
      </div>
      {tab === 'checks' && <PlannedChecksSection />}
      {tab === 'competencies' && <PlannedCompetenciesSection />}
      {tab === 'ipcPcSpacing' && <IpcPcSpacingSection />}
      {tab === 'other' && <OtherPlanningItemsSection />}
    </div>
  );
}
