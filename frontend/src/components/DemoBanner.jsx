import { profile } from '../lib/profile';

// A thin bar across the top of every screen on the demonstration site
// (profile.banner is only ever set when the backend runs with DEMO_MODE=true,
// so this renders nothing on a real deployment).
export function DemoBanner() {
  if (!profile.banner) return null;
  return (
    <div
      role="note"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        background: '#b45309', color: '#fff', textAlign: 'center',
        fontSize: 13, fontWeight: 600, padding: '4px 8px',
      }}
    >
      {profile.banner}
    </div>
  );
}
