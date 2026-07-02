import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { EpChecks } from './EpChecks';
import { CaChecks } from './CaChecks';

const CHECK_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER'];
const CA_CHECK_ROLES = ['HOTC', 'CA_CHECKER'];

export function Checks() {
  const { user } = useAuth();
  const canAccessChecks = CHECK_ROLES.includes(user.role);
  const canAccessCaChecks = CA_CHECK_ROLES.includes(user.role);
  const [topTab, setTopTab] = useState(canAccessChecks ? 'checks' : 'ca-checks');
  const [checkTab, setCheckTab] = useState('ep');

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, marginBottom: '1.25rem', borderBottom: '0.5px solid var(--border)' }}>
        {canAccessChecks && (
          <button
            onClick={() => setTopTab('checks')}
            style={{ border: 'none', background: 'none', padding: '6px 14px', borderBottom: topTab === 'checks' ? '2px solid var(--text-primary)' : '2px solid transparent', fontWeight: topTab === 'checks' ? 500 : 400 }}
          >Checks</button>
        )}
        {canAccessCaChecks && (
          <button
            onClick={() => setTopTab('ca-checks')}
            style={{ border: 'none', background: 'none', padding: '6px 14px', borderBottom: topTab === 'ca-checks' ? '2px solid var(--text-primary)' : '2px solid transparent', fontWeight: topTab === 'ca-checks' ? 500 : 400 }}
          >Cabin attendant recurrent checks</button>
        )}
      </div>

      {topTab === 'checks' && canAccessChecks && (
        <div>
          <div style={{ display: 'flex', gap: 0, marginBottom: '1.25rem', borderBottom: '0.5px solid var(--border)' }}>
            <button
              onClick={() => setCheckTab('ipcpc')}
              style={{ border: 'none', background: 'none', padding: '7px 14px', borderBottom: checkTab === 'ipcpc' ? '2px solid var(--text-primary)' : '2px solid transparent', fontWeight: checkTab === 'ipcpc' ? 500 : 400 }}
            >IPC and proficiency check</button>
            <button
              onClick={() => setCheckTab('ep')}
              style={{ border: 'none', background: 'none', padding: '7px 14px', borderBottom: checkTab === 'ep' ? '2px solid var(--text-primary)' : '2px solid transparent', fontWeight: checkTab === 'ep' ? 500 : 400 }}
            >Emergency procedures</button>
          </div>
          {checkTab === 'ipcpc' && (
            <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
              IPC and Proficiency Check records — recorded via the Recurrent Simulator check type (not yet built out in this UI).
            </div>
          )}
          {checkTab === 'ep' && <EpChecks />}
        </div>
      )}

      {topTab === 'ca-checks' && canAccessCaChecks && <CaChecks />}
    </div>
  );
}
