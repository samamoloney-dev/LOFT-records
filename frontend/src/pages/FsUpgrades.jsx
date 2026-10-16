import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { TabBar } from '../components/TabBar';
import { UpgradePicker } from './UpgradePicker';
import { UPGRADE_VARIANTS } from '../lib/roles';

const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];
const CABIN_CHECKER_ROLES = ['CA_CHECKER', 'CA_MANAGER'];

// Admins see all four upgrade types; a checker only sees the ones for their
// own side - cabin checkers the two cabin attendant upgrades, pilot checkers
// the two Captain upgrades.
function variantTabsFor(user) {
  const crewType = ADMIN_ROLES.includes(user.role) ? null : CABIN_CHECKER_ROLES.includes(user.role) ? 'CABIN_ATTENDANT' : 'PILOT';
  return Object.entries(UPGRADE_VARIANTS)
    .filter(([, cfg]) => !crewType || cfg.crewType === crewType)
    .map(([key, cfg]) => ({ key, label: cfg.label.replace(' Upgrade', '') }));
}

// Shared by Resources > Upgrades (admins) and the FS Upgrades page (upgrade
// checkers, who have no Resources tab).
export function UpgradesPanel() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const tabs = variantTabsFor(user);
  // Lets the Home Dashboard's "passed, ready to archive" alert (?variant=)
  // land directly on the right variant tab instead of always the first one.
  const requestedVariant = searchParams.get('variant');
  const [variant, setVariant] = useState(tabs.some((t) => t.key === requestedVariant) ? requestedVariant : tabs[0].key);
  return (
    <div>
      <TabBar tabs={tabs} active={variant} onSelect={setVariant} />
      <UpgradePicker variant={variant} />
    </div>
  );
}

export function FsUpgrades() {
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Upgrade Records for candidates on your fleet(s).
      </div>
      <UpgradesPanel />
    </div>
  );
}
