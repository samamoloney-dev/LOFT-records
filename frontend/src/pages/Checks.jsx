import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { EpChecks } from './EpChecks';
import { CaChecks } from './CaChecks';
import { ProficiencyChecks } from './ProficiencyChecks';
import { CheckToLinePicker } from './CheckToLinePicker';
import { GroundInstructorCheckForm } from './GroundInstructorCheckForm';
import { PersonnelCompetencyCheckForm } from './PersonnelCompetencyCheckForm';
import { StaffCheckPicker } from '../components/StaffCheckPicker';
import { TabBar } from '../components/TabBar';
import { CHECK_ROLES, isGroundInstructorCheckEligible, PERSONNEL_AIR_COMPETENCY_ROLES } from '../lib/roles';

const CA_CHECK_ROLES = ['HOTC', 'CA_CHECKER', 'CA_MANAGER']; // Check to Line, Line Check
const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];

// Tells an admin an IPC/PC/EP/Line Check/Check to Line just finished, so
// they know to go update the crew member's records elsewhere (this app
// doesn't do that automatically) - see checks.js GET/POST /alerts/*. Mirrors
// the red count badge on the Checks nav tab (App.jsx ChecksAlertBadge),
// which this banner's "Mark reviewed" button clears.
function CompletedChecksAlert() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const [count, setCount] = useState(0);
  const [error, setError] = useState(null);

  function load() {
    api.get('/api/checks/alerts/count').then((d) => setCount(d.count)).catch(() => {});
  }
  useEffect(load, []);

  async function markReviewed() {
    setError(null);
    try { await api.post('/api/checks/alerts/mark-reviewed'); setCount(0); }
    catch (err) { setError(err.message); }
  }

  if (count === 0) return null;
  return (
    <div className="card row" style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)', marginBottom: '1rem' }}>
      <div style={{ flex: 1, fontSize: 13 }}>
        {count} check{count === 1 ? '' : 's'} recently completed - go update the crew's records.
        {error && <div className="error-text">{error}</div>}
      </div>
      {isAdmin && <button onClick={markReviewed}>Mark reviewed</button>}
    </div>
  );
}

export function Checks() {
  const { user } = useAuth();
  // Simulator-only staff can reach the Pilots tab, but only its IPC/PC
  // sub-tabs - not Emergency Procedures.
  const isSimulatorOnly = user.role === 'SIMULATOR_ONLY';
  // Cabin Attendant Manager is authorised to train and check Emergency
  // Procedures for all pilots and cabin crew unconditionally - no
  // checkAccess tick required (mirrors lib/checkAccess.js isEligibleForCheck
  // and backend checks.js canAccessCheckType).
  const isCaManager = user.role === 'CA_MANAGER';
  // A staff member ticked for Emergency Procedures on their Staff profile
  // (checkAccess) can conduct/check EP for both pilots and cabin attendants,
  // even if their broader role isn't one of the roles that otherwise unlocks
  // the Pilots/Cabin Attendants tabs (e.g. a CA_CHECKER or CA_TRAINER).
  const hasEpAccess = isCaManager || (user.checkAccess || []).includes('EMERGENCY_PROCEDURES');
  const canAccessPilotChecks = CHECK_ROLES.includes(user.role) || isSimulatorOnly;
  const canAccessPilotEp = !isSimulatorOnly && (CHECK_ROLES.includes(user.role) || hasEpAccess);
  const canAccessPilots = canAccessPilotChecks || canAccessPilotEp;
  const canAccessEpForCa = CHECK_ROLES.includes(user.role) || hasEpAccess;
  const canAccessCaOnly = CA_CHECK_ROLES.includes(user.role);
  const canAccessCabinAttendants = canAccessEpForCa || canAccessCaOnly;
  // Mirrors backend canAccessChecks (CHECK_ROLES) - the same staff who can
  // create/edit a Ground Instructor Check or Personnel (Air) Competency
  // Check, so Examiners aren't locked out of a tab they're allowed to use.
  const canAccessOthers = CHECK_ROLES.includes(user.role);

  const topTabs = [
    canAccessPilots && { key: 'pilots', label: 'Pilots' },
    canAccessCabinAttendants && { key: 'cabin-attendants', label: 'Cabin Attendants' },
    canAccessOthers && { key: 'others', label: 'Others' },
  ].filter(Boolean);

  const [topTab, setTopTab] = useState(topTabs[0]?.key);

  const pilotTabs = [
    canAccessPilotChecks && { key: 'ipc', label: 'IPC' },
    canAccessPilotChecks && { key: 'pc', label: 'PC' },
    canAccessPilotEp && { key: 'ep', label: 'Emergency Procedures' },
  ].filter(Boolean);
  const [pilotTab, setPilotTab] = useState(pilotTabs[0]?.key);

  const caTabs = [
    canAccessEpForCa && { key: 'ep', label: 'Emergency Procedures' },
    canAccessCaOnly && { key: 'ctl', label: 'Check to Line' },
    canAccessCaOnly && { key: 'linecheck', label: 'Line Check' },
  ].filter(Boolean);
  const [caTab, setCaTab] = useState(caTabs[0]?.key);

  const othersTabs = [
    { key: 'gic', label: 'Ground Instructor Check' },
    { key: 'pac', label: 'Personnel (Air) Competency Check' },
  ];
  const [othersTab, setOthersTab] = useState(othersTabs[0]?.key);

  return (
    <div>
      <CompletedChecksAlert />
      <TabBar tabs={topTabs} active={topTab} onSelect={setTopTab} />

      {topTab === 'pilots' && canAccessPilots && (
        <div>
          <TabBar tabs={pilotTabs} active={pilotTab} onSelect={setPilotTab} />
          {pilotTab === 'ipc' && canAccessPilotChecks && <ProficiencyChecks variant="IPC_PC" label="IPC" />}
          {pilotTab === 'pc' && canAccessPilotChecks && <ProficiencyChecks variant="PC" label="Proficiency Check" />}
          {pilotTab === 'ep' && canAccessPilotEp && <EpChecks appliesTo="PILOT" />}
        </div>
      )}

      {topTab === 'cabin-attendants' && canAccessCabinAttendants && (
        <div>
          <TabBar tabs={caTabs} active={caTab} onSelect={setCaTab} />
          {caTab === 'ep' && canAccessEpForCa && <EpChecks appliesTo="CABIN_ATTENDANT" />}
          {caTab === 'ctl' && canAccessCaOnly && <CheckToLinePicker />}
          {caTab === 'linecheck' && canAccessCaOnly && <CaChecks />}
        </div>
      )}

      {topTab === 'others' && canAccessOthers && (
        <div>
          <TabBar tabs={othersTabs} active={othersTab} onSelect={setOthersTab} />
          {othersTab === 'gic' && (
            <StaffCheckPicker
              roles={isGroundInstructorCheckEligible}
              description="Select a staff member to view or complete their Ground Instructor Competency Check."
              renderForm={(s) => <GroundInstructorCheckForm userId={s.id} userName={s.name} />}
            />
          )}
          {othersTab === 'pac' && (
            <StaffCheckPicker
              roles={PERSONNEL_AIR_COMPETENCY_ROLES}
              description="Select a staff member to view or complete their Flight Standards Personnel (Air) Competency Check."
              renderForm={(s) => <PersonnelCompetencyCheckForm userId={s.id} userName={s.name} />}
            />
          )}
        </div>
      )}
    </div>
  );
}
