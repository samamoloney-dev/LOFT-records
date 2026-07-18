import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { TabBar } from '../components/TabBar';
import { UpgradePicker } from './UpgradePicker';
import { UPGRADE_CHECKER_ROLES, UPGRADE_VARIANTS } from '../lib/roles';

const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];

// Real per-aircraft FSTD facts (which simulator, its number/type) - set
// once here by an admin, reused by the "Autofill FSTD" button on the
// IPC/PC check form instead of being hardcoded or retyped every time.
const FSTD_AIRCRAFT_TYPES = ['Fokker 100', 'Dash 8', 'Metro'];

function FstdPresetsPanel() {
  const [presets, setPresets] = useState([]);
  const [error, setError] = useState(null);

  function load() {
    api.get('/api/fstd-presets').then(setPresets).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  const presetFor = (aircraftType) => presets.find((p) => p.aircraftType === aircraftType) || {};

  async function save(aircraftType, patch) {
    setError(null);
    try {
      const current = presetFor(aircraftType);
      await api.put(`/api/fstd-presets/${encodeURIComponent(aircraftType)}`, {
        fstdNumber: current.fstdNumber || '',
        fstdType: current.fstdType || '',
        ...patch,
      });
      load();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 500, marginBottom: 6 }}>FSTD presets</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
        Used by the "Autofill FSTD" button on IPC/PC check forms.
      </div>
      {FSTD_AIRCRAFT_TYPES.map((aircraftType) => {
        const preset = presetFor(aircraftType);
        return (
          <div key={aircraftType} className="grid2" style={{ marginBottom: 8 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>{aircraftType} — FSTD number</label>
              <input defaultValue={preset.fstdNumber || ''} onBlur={(e) => save(aircraftType, { fstdNumber: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>{aircraftType} — FSTD type</label>
              <input defaultValue={preset.fstdType || ''} onBlur={(e) => save(aircraftType, { fstdType: e.target.value })} />
            </div>
          </div>
        );
      })}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

const STAFF_TABS = [
  { key: 'fstd', label: 'FSTD' },
];

const UPGRADE_TABS = Object.entries(UPGRADE_VARIANTS).map(([key, cfg]) => ({ key, label: cfg.label.replace(' Upgrade', '') }));

// All checkers and examiners have access to this, for their relevant fleet
// (see UpgradePicker's own fleet-scoping) - per the operator's explicit
// request, not just admins.
function UpgradesPanel() {
  const [variant, setVariant] = useState(UPGRADE_TABS[0].key);
  return (
    <div>
      <TabBar tabs={UPGRADE_TABS} active={variant} onSelect={setVariant} />
      <UpgradePicker variant={variant} />
    </div>
  );
}

// Staff account management now lives on its own top-level "FS Staff" nav
// tab (see FsStaff.jsx) - this page keeps the other Resources-y admin
// tools (FSTD presets, running Upgrade Records) that don't need their own
// dedicated nav slot.
export function Staff() {
  const { user } = useAuth();
  const canSeeUpgrades = ADMIN_ROLES.includes(user.role) || UPGRADE_CHECKER_ROLES.includes(user.role);
  const tabs = canSeeUpgrades ? [...STAFF_TABS, { key: 'upgrades', label: 'Upgrades' }] : STAFF_TABS;
  const [tab, setTab] = useState('fstd');
  return (
    <div>
      <TabBar tabs={tabs} active={tab} onSelect={setTab} />
      {tab === 'fstd' && <FstdPresetsPanel />}
      {tab === 'upgrades' && canSeeUpgrades && <UpgradesPanel />}
    </div>
  );
}
