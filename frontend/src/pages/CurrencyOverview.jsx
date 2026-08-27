import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { formatDate, formatFleet, formatTraineeRole } from '../lib/format';
import { crewLinkForItem } from '../lib/checkNav';
import { PrintButton } from '../components/PrintButton';
import { ExportCsvButton } from '../components/ExportCsvButton';
import { openPrintWindow } from '../lib/print';
import { buildCurrencyOverviewHtml } from '../lib/printBuilders';
import { downloadCsv } from '../lib/exportCsv';

// Overdue and not-yet-completed rank above the three graduated advance-
// warning bands (important > due_soon > approaching - closest deadline
// first), matching backend/src/lib/currency.js's statusFor bands.
const STATUS_ORDER = { overdue: 0, not_completed: 1, important: 2, due_soon: 3, approaching: 4, ok: 5, in_training: 6 };

// Overdue is bold on top of its red, so it still reads as more urgent than
// Important even though both are red - per the operator's explicit request
// that overdue "must be in BOLD RED as to be alerted". Approaching uses a
// paler yellow, deliberately the least alerting of the three warning bands.
const STATUS_STYLES = {
  overdue: { background: '#f8caca', color: '#7a1414', fontWeight: 700 },
  important: { background: '#fbe1e1', color: '#9b2020' },
  due_soon: { background: '#fdf2d0', color: '#8a6100' },
  approaching: { background: '#fdf8d6', color: '#8a7f00' },
  not_completed: { background: '#e0e7ff', color: '#3730a3' },
  ok: { background: '#dff5e1', color: '#14632f' },
  in_training: { background: '#e5e7eb', color: '#4b5563' },
};

const STATUS_TEXT = {
  overdue: 'Overdue', important: 'Important', due_soon: 'Due Soon', approaching: 'Approaching',
  not_completed: 'Not yet completed', ok: 'Current', in_training: 'In training',
};

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'not_completed', label: 'Not Yet Completed' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'important', label: 'Important' },
  { key: 'due_soon', label: 'Due Soon' },
  { key: 'approaching', label: 'Approaching' },
  { key: 'ok', label: 'Current' },
  { key: 'in_training', label: 'In Training' },
];

const FLEET_VALUES = ['DASH_8', 'FOKKER_100', 'METRO_23'];
// Cabin Dash 8 and Cabin Fokker 100 share a single "Cabin Attendants" tab
// here rather than two separate fleet tabs - per the operator's request,
// cabin crew are tracked together regardless of which aircraft they're
// current on. Fleet Currency Snapshot on the Home dashboard still deep-links
// with the raw CA_DASH_8/CA_FOKKER_100 values (see requestedFleet below),
// so both still land on this one tab.
const CABIN_FLEETS = ['CA_DASH_8', 'CA_FOKKER_100'];
const FLEET_FILTERS = [
  { key: 'all', label: 'All fleets' },
  ...FLEET_VALUES.map((f) => ({ key: f, label: formatFleet(f) })),
  { key: 'CABIN_ATTENDANTS', label: 'Cabin Attendants' },
];

// "Not yet rostered" used to just be text baked into the Home Dashboard's
// Needs Attention rows - promoted to a real filter here so the whole
// not-yet-booked-in backlog (not just the top few overdue/due-soon rows)
// is browsable in one place. Only meaningful for items that actually need
// action (overdue/due soon/not yet completed) - "Current"/"In training"
// rows have no rostering concept, so they fall under "Rostered" by default
// (no planned date needed) rather than cluttering "Not Yet Rostered".
const ROSTERED_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'not_rostered', label: 'Not Yet Rostered' },
  { key: 'rostered', label: 'Rostered' },
];

function FilterBar({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '1rem' }}>
      {options.map((f) => (
        <div
          key={f.key}
          onClick={() => onChange(f.key)}
          style={{
            padding: '6px 12px', border: '0.5px solid var(--border-strong)', borderRadius: 8,
            cursor: 'pointer', fontSize: 13,
            background: value === f.key ? 'var(--bg-accent)' : 'var(--surface-2)',
            color: value === f.key ? 'var(--text-accent)' : 'inherit',
          }}
        >{f.label}</div>
      ))}
    </div>
  );
}

// Calendar-day difference (not a 24h-period count), so a due date later
// today still reads as "due today" rather than "overdue" or "-1 days".
function daysToExpiry(dueDate) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const today = new Date();
  const dueDay = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((dueDay - todayDay) / (24 * 60 * 60 * 1000));
}

function expiryText(dueDate) {
  const days = daysToExpiry(dueDate);
  if (days === null) return '';
  if (days === 0) return 'due today';
  if (days < 0) return `overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
  return `due in ${days} day${days === 1 ? '' : 's'}`;
}

function StatusPill({ status }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, ...STATUS_STYLES[status] }}>
      {STATUS_TEXT[status]}
    </span>
  );
}

// Fixed 7-letter join key per competency, for handing dates off to the new
// rostering system (which tracks the same competencies by a short code
// rather than this app's full label) - see Export CSV below. Anything not
// listed here (an admin-added ad-hoc competency, or a future catalog type
// added after this map was written) falls through to codeFor's generated
// fallback instead of coming through blank.
const COMPETENCY_CODE_MAP = {
  'Emergency Procedures': 'EMERPRC',
  IPC: 'IPCHECK',
  'Proficiency Check': 'PROFCHK',
  'Line Check': 'LINECHK',
  'Cabin Attendant Line Check': 'CALNCHK',
  Medical: 'MEDICAL',
  'Refresher Training': 'REFRESH',
  'Dangerous Goods': 'DANGGDS',
  'First Aid': 'FIRSTAD',
  'SMS Training': 'SMSTRNG',
  'Fatigue Management': 'FATIGMT',
  'Human Factor and NTS': 'HUMFCTR',
  'Human Factor and NTS 2': 'HUMFCT2',
  'Human Factor and NTS 3': 'HUMFCT3',
  'Human Factor and NTS 4': 'HUMFCT4',
  DAMP: 'DAMPPGM',
  CFIT: 'CFITAWR',
  'CPR Training': 'CPRTRNG',
  'Smoke and Firing Training': 'SMKFIRE',
  'EFB Training': 'EFBTRNG',
  'Emergency Slide F100 & Safety Equipment': 'ESLIDF1',
  'Maintenance Authority': 'MAINTAU',
  UPRT: 'UPRTRNG',
  'Right Hand Seat': 'RGHTHND',
};

// Deterministic fallback for any label not in COMPETENCY_CODE_MAP above -
// letters only, uppercased, truncated/padded to exactly 7 characters, so
// every exported row always has some code rather than a blank one that'd
// silently fail to match on the rostering side.
function codeFor(label) {
  if (COMPETENCY_CODE_MAP[label]) return COMPETENCY_CODE_MAP[label];
  const letters = String(label || '').toUpperCase().replace(/[^A-Z]/g, '');
  return (letters + 'XXXXXXX').slice(0, 7);
}

// Flattens a crew member's allItems (see backend/src/routes/crew.js
// withCurrency/allItemsFor) into rows for this page - every recurrent
// check and competency, whatever its status, so the whole roster's
// picture is visible here rather than just the problems. A planned date
// doesn't change the status (it's still due) - it's just shown alongside
// it as a reminder it's in hand.
function allRows(member) {
  return member.allItems.map((item) => ({
    memberId: member.id,
    name: member.name,
    arn: member.arn,
    type: member.type,
    fleets: member.fleets,
    fleet: member.fleets.map(formatFleet).join(', '),
    item: item.label,
    itemCode: codeFor(item.label),
    dueDate: item.dueDate,
    completedDate: item.completedDate,
    plannedDate: item.plannedDate,
    // Set once a real (not yet completed) check record actually exists for
    // this item - see DueBadge.jsx's "Check Form Issued" note on the crew
    // profile, which this page previously had no equivalent of. Distinct
    // from plannedDate (a purely informational note typed on the Planning
    // tab): an admin can assign/issue a check via the Checks tab without
    // ever separately entering a planned date, and that candidate is
    // clearly no longer "not yet rostered" even though plannedDate is null.
    issued: item.issued,
    // Whether a plannedDate above has actually been confirmed on the
    // roster (see crew.js itemsFor/crew_planned_checks.rostered) - only
    // ever set for EP/IPC/PC/Line Check rows; competencies have no
    // rostered concept and this stays undefined for them (see isInHand
    // below, same fallback as the backend's dashboard.js uses).
    rostered: item.rostered,
    status: item.status,
    // A typed note explaining why this is overdue (see crew.js's
    // ReasonEditor/overdueReason) - only ever set on the recurrent
    // check items (EP/IPC/PC/Line Check), not ad-hoc competencies.
    overdueReason: item.overdueReason,
    // Still has an active (non-archived) linked LOFT trainee record - see
    // backend/src/routes/crew.js withCurrency's inLoft. Flagged overdue
    // while still in training is often expected, not an oversight, so it
    // gets a remark here rather than looking identical to a lapsed check.
    inLoft: !!member.inLoft,
  }));
}

export function CurrencyOverview() {
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  // Lets the Home Dashboard's summary cards (?filter=overdue etc.) and its
  // Fleet Currency Snapshot (?fleet=DASH_8 etc.) land here pre-filtered -
  // falls back to "all" for any unrecognised value.
  const requestedFilter = searchParams.get('filter');
  const [statusFilter, setStatusFilter] = useState(
    STATUS_FILTERS.some((f) => f.key === requestedFilter) ? requestedFilter : 'all',
  );
  const rawRequestedFleet = searchParams.get('fleet');
  const requestedFleet = CABIN_FLEETS.includes(rawRequestedFleet) ? 'CABIN_ATTENDANTS' : rawRequestedFleet;
  const [fleetFilter, setFleetFilter] = useState(
    FLEET_FILTERS.some((f) => f.key === requestedFleet) ? requestedFleet : 'all',
  );
  const requestedRostered = searchParams.get('rostered');
  const [rosteredFilter, setRosteredFilter] = useState(
    ROSTERED_FILTERS.some((f) => f.key === requestedRostered) ? requestedRostered : 'all',
  );
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      api.get('/api/crew?type=PILOT'),
      api.get('/api/crew?type=CABIN_ATTENDANT'),
    ])
      .then(([pilots, cabinAttendants]) => {
        const flattened = [...pilots, ...cabinAttendants].flatMap(allRows);
        flattened.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
        setRows(flattened);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-text">{error}</div>;

  // "Not Yet Rostered" only ever means something for items that actually
  // need action - current/in-training rows have no rostering concept, so
  // they're excluded here even with no planned date, rather than
  // cluttering this filter with things that don't need booking in. A real
  // check form already issued/assigned via the Checks tab counts as
  // "rostered" too, even with no separate planned date typed in on the
  // Planning tab - an admin who's already assigned an examiner has plainly
  // actioned it, so it shouldn't still read as "not yet rostered".
  const ROSTERABLE_STATUSES = ['overdue', 'not_completed', 'important', 'due_soon', 'approaching'];
  // A bare plannedDate/assigned examiner used to be enough to count as
  // "rostered" here - but neither is a firm commitment until "Mark
  // rostered" is actually clicked (see Planning.jsx), so a check with just
  // a hopeful plannedDate could sit in the "Rostered" bucket and never get
  // followed up. Competencies have no rostered concept of their own
  // (r.rostered stays undefined), so a plannedDate still counts there.
  // Either way, once the planned date itself has already slipped by with
  // nothing actually issued/completed, the plan clearly didn't happen -
  // this stops counting it as "in hand" rather than hiding it forever
  // (mirrors backend/src/routes/dashboard.js's own isInHand).
  const isInHand = (r) => {
    if (r.issued) return true;
    if (!r.plannedDate) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (new Date(r.plannedDate) < today) return false;
    return r.rostered !== undefined ? !!r.rostered : true;
  };
  const filteredRows = rows
    .filter((r) => statusFilter === 'all' || r.status === statusFilter)
    .filter((r) => fleetFilter === 'all' || (fleetFilter === 'CABIN_ATTENDANTS' ? r.fleets.some((f) => CABIN_FLEETS.includes(f)) : r.fleets.includes(fleetFilter)))
    .filter((r) => {
      if (rosteredFilter === 'all') return true;
      if (rosteredFilter === 'not_rostered') return ROSTERABLE_STATUSES.includes(r.status) && !isInHand(r);
      return isInHand(r);
    });
  // Once specifically looking at what's already booked in, the planned date
  // itself (closest first) is more useful than the usual overdue-first
  // ordering - that's the whole point of checking what's coming up next.
  // Rows with no planned date (issued but never separately dated) have
  // nothing to sort on, so they fall to the end rather than all clustering
  // at the epoch via new Date(null).
  if (rosteredFilter === 'rostered') {
    filteredRows.sort((a, b) => {
      if (!a.plannedDate && !b.plannedDate) return 0;
      if (!a.plannedDate) return 1;
      if (!b.plannedDate) return -1;
      return new Date(a.plannedDate) - new Date(b.plannedDate);
    });
  }

  function printReport() {
    openPrintWindow('Currency Overview', buildCurrencyOverviewHtml(filteredRows));
  }

  // Exports the whole roster's competency dates (not just whatever's
  // currently filtered on screen) - this is meant as a full handoff to the
  // rostering system, not a snapshot of what an admin happens to be
  // looking at. ISO dates (YYYY-MM-DD), not this app's usual dd/mm/yyyy
  // display format, so whatever imports this file can't misparse it as
  // mm/dd/yyyy regardless of its own locale settings.
  function exportCsv() {
    const isoDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');
    const headers = ['Crew Member', 'ARN', 'Type', 'Fleet', 'Competency', 'Competency Code', 'Completed Date', 'Due Date', 'Status'];
    const csvRows = rows.map((r) => [
      r.name, r.arn || '', formatTraineeRole(r.type), r.fleet, r.item, r.itemCode,
      isoDate(r.completedDate), isoDate(r.dueDate), STATUS_TEXT[r.status] || r.status,
    ]);
    downloadCsv(`competency-dates-${isoDate(new Date())}.csv`, headers, csvRows);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: '0.75rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Every recurrent check and competency across the roster - not yet completed and overdue items need attention first
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <ExportCsvButton onExport={exportCsv} />
          <PrintButton onPrint={printReport} />
        </div>
      </div>
      <FilterBar options={FLEET_FILTERS} value={fleetFilter} onChange={setFleetFilter} />
      <FilterBar options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
      <FilterBar options={ROSTERED_FILTERS} value={rosteredFilter} onChange={setRosteredFilter} />

      {filteredRows.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Nothing here.</div>}
      {filteredRows.map((r, i) => (
        <div key={i} className="card row" onClick={() => navigate(crewLinkForItem(r.memberId, r.item))}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{r.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {r.fleet} · {r.item}{r.completedDate ? ` · Completed ${formatDate(r.completedDate)}` : ''}{r.dueDate ? ` · Due ${formatDate(r.dueDate)} (${expiryText(r.dueDate)})` : ''}
            </div>
            {r.issued ? (
              <div style={{ fontSize: 11, color: 'var(--text-accent)', marginTop: 2 }}>Check Form Issued</div>
            ) : r.plannedDate && (
              <div style={{ fontSize: 11, color: r.rostered ? '#14632f' : 'var(--text-accent)', marginTop: 2, fontWeight: r.rostered ? 600 : 400 }}>
                {r.rostered ? '✓ Rostered for ' : 'Planned for '}{formatDate(r.plannedDate)}
              </div>
            )}
            {r.overdueReason && <span className="badge warn" style={{ marginTop: 4, display: 'inline-block' }}>{r.overdueReason}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {r.inLoft && r.status === 'overdue' && (
              <span className="badge" style={{ background: 'var(--bg-accent)', color: 'var(--text-accent)' }}>IN LOFT</span>
            )}
            <StatusPill status={r.status} />
          </div>
        </div>
      ))}
    </div>
  );
}
