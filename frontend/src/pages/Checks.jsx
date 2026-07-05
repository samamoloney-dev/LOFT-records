import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { EpChecks } from './EpChecks';
import { CaChecks } from './CaChecks';
import { ProficiencyChecks } from './ProficiencyChecks';
import { CheckToLinePicker } from './CheckToLinePicker';

const CHECK_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER']; // IPC, PC, Emergency Procedures
const CA_CHECK_ROLES = ['HOTC', 'CA_CHECKER']; // Check to Line, Line Check
const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN'];

function TabBar({ tabs, active, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: '1.25rem', borderBottom: '0.5px solid var(--border)' }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onSelect(t.key)}
          style={{ border: 'none', background: 'none', padding: '7px 14px', borderBottom: active === t.key ? '2px solid var(--text-primary)' : '2px solid transparent', fontWeight: active === t.key ? 500 : 400 }}
        >{t.label}</button>
      ))}
    </div>
  );
}

export function Checks() {
  const { user } = useAuth();
  // Simulator-only staff can reach the Pilots tab, but only its IPC/PC
  // sub-tabs - not Emergency Procedures.
  const isSimulatorOnly = user.role === 'SIMULATOR_ONLY';
  const canAccessPilots = CHECK_ROLES.includes(user.role) || isSimulatorOnly;
  const canAccessEpForCa = CHECK_ROLES.includes(user.role);
  const canAccessCaOnly = CA_CHECK_ROLES.includes(user.role);
  const canAccessCabinAttendants = canAccessEpForCa || canAccessCaOnly;
  const canAccessOthers = ADMIN_ROLES.includes(user.role);

  const topTabs = [
    canAccessPilots && { key: 'pilots', label: 'Pilots' },
    canAccessCabinAttendants && { key: 'cabin-attendants', label: 'Cabin Attendants' },
    canAccessOthers && { key: 'others', label: 'Others' },
  ].filter(Boolean);

  const [topTab, setTopTab] = useState(topTabs[0]?.key);

  const pilotTabs = [
    { key: 'ipc', label: 'IPC' },
    { key: 'pc', label: 'PC' },
    !isSimulatorOnly && { key: 'ep', label: 'Emergency Procedures' },
  ].filter(Boolean);
  const [pilotTab, setPilotTab] = useState('ipc');

  const caTabs = [
    canAccessEpForCa && { key: 'ep', label: 'Emergency Procedures' },
    canAccessCaOnly && { key: 'ctl', label: 'Check to Line' },
    canAccessCaOnly && { key: 'linecheck', label: 'Line Check' },
  ].filter(Boolean);
  const [caTab, setCaTab] = useState(caTabs[0]?.key);

  return (
    <div>
      <TabBar tabs={topTabs} active={topTab} onSelect={setTopTab} />

      {topTab === 'pilots' && canAccessPilots && (
        <div>
          <TabBar tabs={pilotTabs} active={pilotTab} onSelect={setPilotTab} />
          {pilotTab === 'ipc' && <ProficiencyChecks variant="IPC_PC" label="IPC" />}
          {pilotTab === 'pc' && <ProficiencyChecks variant="PC" label="Proficiency Check" />}
          {pilotTab === 'ep' && <EpChecks appliesTo="PILOT" />}
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
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          Nothing here yet.
        </div>
      )}
    </div>
  );
}
