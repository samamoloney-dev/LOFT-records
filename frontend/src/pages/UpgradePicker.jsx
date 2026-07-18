import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { UpgradeRecordForm } from './UpgradeRecordForm';
import { UPGRADE_VARIANTS } from '../lib/roles';
import { formatFleet, formatTraineeRole } from '../lib/format';

const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];

// A candidate already linked to a staff role at or above the tier a variant
// upgrades to doesn't need that form - HOTC/HOFO/a current Check Captain
// don't need a Training Captain Upgrade, and likewise on the cabin side, a
// current CA Checker/CA Manager don't need a Training Cabin Attendant
// Upgrade. Deliberately per-variant rather than one blanket list, since a
// Training Captain is still very much a valid candidate for the Check
// Captain Upgrade (that's the whole point of the progression). The
// variant's own target role is always added on top of this list below (see
// seniorExcluded in UpgradePicker) - someone already holding the role a
// variant upgrades TO obviously doesn't need that same upgrade again.
const SENIOR_EXCLUDED_ROLES = {
  TRAINING_CAPTAIN: ['HOTC', 'HOFO', 'CC'],
  CHECK_CAPTAIN: ['HOTC', 'HOFO', 'CC'],
  TRAINING_CABIN_ATTENDANT: ['HOTC', 'HOFO', 'CA_CHECKER', 'CA_MANAGER'],
  CHECK_CABIN_ATTENDANT: ['HOTC', 'HOFO', 'CA_MANAGER'],
};

// The Check tier normally requires already holding the Training tier first
// (Training Captain -> Check Captain, Training Cabin Attendant -> Check
// Cabin Attendant) - per the operator's explicit rule, a plain line
// Captain/Cabin Attendant can't be upgraded straight to Check. The one
// exception: someone who's already a trainer or checker on a different
// fleet (already CC, or already CA Checker) has the experience to skip
// straight to Check on this new fleet, so those roles qualify too. No
// entry here (Training Captain/Training Cabin Attendant) means no gate -
// those are the entry-level upgrade, open to any line Captain/Cabin
// Attendant, same as before.
const REQUIRED_PRIOR_ROLES = {
  CHECK_CAPTAIN: ['TRAINING_CAPTAIN', 'CC'],
  CHECK_CABIN_ATTENDANT: ['CA_TRAINER', 'CA_CHECKER'],
};

// Candidate picker in front of UpgradeRecordForm - a line Captain/Cabin
// Attendant being upgraded to Training/Check Captain or Training/Check
// Cabin Attendant. Scoped to the logged-in checker's own fleet(s) ("for
// their relevant fleet", per the operator's explicit request) - admins see
// every candidate of the matching crew type regardless of fleet.
//
// Deliberately does NOT auto-list every eligible crew member up front - per
// the operator's explicit feedback, that made it look like people (e.g. a
// Cabin Attendant already holding the Trainer role) had been "automatically
// added" as upgrade candidates. Instead this shows only upgrade records that
// already exist (in progress or completed, not yet archived), plus an
// explicit "Start new upgrade" search box the checker has to type into and
// pick from - nothing is offered as a candidate unless asked for.
export function UpgradePicker({ variant }) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const variantConfig = UPGRADE_VARIANTS[variant];
  const [crew, setCrew] = useState([]);
  const [existingChecks, setExistingChecks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [starting, setStarting] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/crew?type=${variantConfig.crewType}`).then(setCrew).catch((e) => setError(e.message));
    api.get('/api/checks?checkType=UPGRADE_RECORD&archived=false').then(setExistingChecks).catch(() => {});
  }
  useEffect(load, [variant]);
  // Switching variant tabs (or arriving via a dashboard deep link) always
  // starts from the existing-records list, not mid-selection or mid-search.
  useEffect(() => {
    setStarting(false);
    setSearch('');
    const requestedCrewMemberId = searchParams.get('crewMemberId');
    setSelectedId(searchParams.get('variant') === variant ? requestedCrewMemberId : null);
  }, [variant]);

  // Training/Check Captain upgrades only apply to Captains, not First
  // Officers - a Captain must be held first (crew.role is the only signal
  // for this, since CABIN_ATTENDANT has just the one role either way).
  // Someone already holding the variant's own target role (e.g. a current
  // CA Trainer showing up for the Training Cabin Attendant Upgrade) is
  // always excluded on top of the per-variant senior-role list - they don't
  // need the same upgrade twice.
  const seniorExcluded = [...(SENIOR_EXCLUDED_ROLES[variant] || []), variantConfig.targetRole];
  const requiredPrior = REQUIRED_PRIOR_ROLES[variant];
  // Upgrade Record checks don't carry their own fleet column (see
  // UpgradeRecordForm's createCheck, which never sets one) - the
  // candidate's own crew record is the only source of fleet, so fleet
  // scoping for non-admins has to join back to the crew list by id.
  const crewFleetsById = new Map(crew.map((c) => [c.id, c.fleets || []]));
  const variantChecks = existingChecks
    .filter((c) => c.details?.variant === variant)
    .filter((c) => isAdmin || (crewFleetsById.get(c.crewMemberId) || []).some((f) => (user.fleets || []).includes(f)));
  const inProgressCandidateIds = new Set(variantChecks.map((c) => c.crewMemberId));
  const eligible = crew
    .filter((c) => variantConfig.crewType !== 'PILOT' || c.role === 'CAPTAIN')
    .filter((c) => !c.linkedRole || !seniorExcluded.includes(c.linkedRole))
    .filter((c) => !requiredPrior || requiredPrior.includes(c.linkedRole))
    .filter((c) => isAdmin || (c.fleets || []).some((f) => (user.fleets || []).includes(f)))
    .filter((c) => !inProgressCandidateIds.has(c.id));
  const searchResults = search.trim()
    ? eligible.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
    : [];
  const selected = crew.find((c) => c.id === selectedId);

  if (selected) {
    return (
      <div>
        <button onClick={() => setSelectedId(null)} style={{ marginBottom: '1rem' }}>← Back</button>
        <div className="card">
          <div style={{ fontWeight: 500 }}>{selected.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {(selected.fleets || []).map(formatFleet).join(', ')} · {formatTraineeRole(selected.role)}
          </div>
        </div>
        <UpgradeRecordForm
          variant={variant} crewMemberId={selected.id} crewMemberName={selected.name}
          fleet={selected.fleets?.[0]} crewIsLinked={selected.isLinked}
        />
      </div>
    );
  }

  return (
    <div>
      {error && <div className="error-text">{error}</div>}
      {variantChecks.length === 0 && !starting && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          No {variantConfig.label.toLowerCase()} records yet.
        </div>
      )}
      {variantChecks
        .slice()
        .sort((a, b) => (a.completedAt ? 1 : 0) - (b.completedAt ? 1 : 0))
        .map((c) => (
          <div key={c.id} className="card row" onClick={() => setSelectedId(c.crewMemberId)} style={{ marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{c.crewMemberName}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {!c.completedAt && 'In progress'}
                {c.completedAt && c.result === 'PASS' && 'Passed — ready to archive once reviewed'}
                {c.completedAt && c.result && c.result !== 'PASS' && `Completed — ${c.result}`}
                {c.completedAt && !c.result && 'Completed'}
              </div>
            </div>
          </div>
        ))}

      <div style={{ marginTop: '1.5rem' }}>
        {!starting && <button onClick={() => setStarting(true)}>+ Start new upgrade</button>}
        {starting && (
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Search for the {variantConfig.crewType === 'PILOT' ? 'line Captain' : 'Cabin Attendant'} to start their {variantConfig.label}.
              {requiredPrior && ' Only candidates who already hold the Training tier (or are already a trainer/checker on another fleet) are eligible.'}
            </div>
            <input
              autoFocus placeholder="Search by name…" value={search}
              onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 8, width: '100%', maxWidth: 320 }}
            />
            {search.trim() && searchResults.length === 0 && (
              <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No eligible match found.</div>
            )}
            {searchResults.map((c) => (
              <div key={c.id} className="card row" onClick={() => { setSelectedId(c.id); setStarting(false); }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{(c.fleets || []).map(formatFleet).join(', ')}</div>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 8 }}>
              <button onClick={() => { setStarting(false); setSearch(''); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
