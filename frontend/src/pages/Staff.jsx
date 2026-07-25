import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  const [newLabel, setNewLabel] = useState('');

  function load() {
    api.get('/api/fstd-presets').then(setPresets).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  const presetFor = (aircraftType) => presets.find((p) => p.aircraftType === aircraftType) || {};
  // Anything beyond the three standard aircraft types - e.g. a second
  // simulator for the same type at a different training centre, or a type
  // not in the fixed list above. The "Autofill FSTD" button on the IPC/PC
  // check form only ever matches a preset whose label equals the check's
  // own aircraft type field, so a custom label here is for manual
  // reference unless something else on that check matches it exactly.
  const extraPresets = presets.filter((p) => !FSTD_AIRCRAFT_TYPES.includes(p.aircraftType));

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

  async function addPreset(e) {
    e.preventDefault();
    const label = newLabel.trim();
    if (!label) return;
    setError(null);
    try {
      await api.put(`/api/fstd-presets/${encodeURIComponent(label)}`, { fstdNumber: '', fstdType: '' });
      setNewLabel('');
      load();
    } catch (err) { setError(err.message); }
  }

  async function removePreset(aircraftType) {
    if (!window.confirm(`Remove the "${aircraftType}" FSTD preset?`)) return;
    setError(null);
    try { await api.delete(`/api/fstd-presets/${encodeURIComponent(aircraftType)}`); load(); }
    catch (err) { setError(err.message); }
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

      {extraPresets.map((preset) => (
        <div key={preset.aircraftType} className="grid2" style={{ marginBottom: 8 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>{preset.aircraftType} — FSTD number</label>
            <input defaultValue={preset.fstdNumber || ''} onBlur={(e) => save(preset.aircraftType, { fstdNumber: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div className="field" style={{ margin: 0, flex: 1 }}>
              <label>{preset.aircraftType} — FSTD type</label>
              <input defaultValue={preset.fstdType || ''} onBlur={(e) => save(preset.aircraftType, { fstdType: e.target.value })} />
            </div>
            <button type="button" className="danger" onClick={() => removePreset(preset.aircraftType)}>Remove</button>
          </div>
        </div>
      ))}

      <form onSubmit={addPreset} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 4 }}>
        <div className="field" style={{ margin: 0, flex: 1 }}>
          <label>Add another preset (e.g. a second simulator, or a type not listed above)</label>
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Dash 8 (Perth Sim)" />
        </div>
        <button type="submit">Add</button>
      </form>
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
  const [searchParams] = useSearchParams();
  // Lets the Home Dashboard's "passed, ready to archive" alert (?variant=)
  // land directly on the right variant tab instead of always Training Captain.
  const requestedVariant = searchParams.get('variant');
  const [variant, setVariant] = useState(
    UPGRADE_TABS.some((t) => t.key === requestedVariant) ? requestedVariant : UPGRADE_TABS[0].key,
  );
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
  const [searchParams] = useSearchParams();
  const canSeeUpgrades = ADMIN_ROLES.includes(user.role) || UPGRADE_CHECKER_ROLES.includes(user.role);
  const tabs = canSeeUpgrades ? [...STAFF_TABS, { key: 'upgrades', label: 'Upgrades' }] : STAFF_TABS;
  // Lets the Home Dashboard's "passed, ready to archive" alert (?tab=upgrades)
  // land directly on the Upgrades tab.
  const requestedTab = searchParams.get('tab');
  const [tab, setTab] = useState(tabs.some((t) => t.key === requestedTab) ? requestedTab : 'fstd');
  return (
    <div>
      <TabBar tabs={tabs} active={tab} onSelect={setTab} />
      {tab === 'fstd' && <FstdPresetsPanel />}
      {tab === 'upgrades' && canSeeUpgrades && <UpgradesPanel />}
    </div>
  );
}
