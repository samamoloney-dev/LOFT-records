import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatUserRole, formatFleet } from '../lib/format';

const CARD_STYLES = {
  red: { background: '#fbe1e1', color: '#8f1d1d' },
  amber: { background: '#fdf2d0', color: '#8a6100' },
  gray: { background: '#e5e7eb', color: '#4b5563' },
  blue: { background: '#e0e7ff', color: '#3730a3' },
  green: { background: '#dff5e1', color: '#14632f' },
};

// A count of 0 is good news, not an alarm - a red/amber "0 Overdue" card
// would read as if something's wrong, so zero always falls back to the
// neutral gray palette regardless of the card's usual color.
function SummaryCard({ label, value, color, onClick }) {
  const style = value === 0 ? CARD_STYLES.gray : CARD_STYLES[color];
  return (
    <div
      className="card"
      onClick={onClick}
      style={{ ...style, flex: '1 1 140px', textAlign: 'center', cursor: 'pointer' }}
    >
      <div style={{ fontSize: 26, fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 12, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function NeedsAttentionPanel({ data, total, navigate }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0 }}>Needs Attention</h3>
        {total > data.length && (
          <span
            style={{ fontSize: 12, color: 'var(--text-accent)', cursor: 'pointer' }}
            onClick={() => navigate('/currency?filter=overdue')}
          >View all ({total})</span>
        )}
      </div>
      {data.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Nothing needs attention right now.</div>
      )}
      {data.map((row) => (
        <div key={row.key} className="card row" onClick={() => navigate(row.linkTo)}>
          <div style={{ fontSize: 13 }}>{row.text}</div>
        </div>
      ))}
    </div>
  );
}

function ComingUpPanel({ data, navigate }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0 }}>Coming Up</h3>
        <span
          style={{ fontSize: 12, color: 'var(--text-accent)', cursor: 'pointer' }}
          onClick={() => navigate('/planning')}
        >View full planning calendar</span>
      </div>
      {data.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Nothing planned in the next 30 days.</div>
      )}
      {data.map((row) => (
        <div key={row.key} className="card row" onClick={() => navigate(row.linkTo)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{formatDate(row.date)} · {row.crewMemberName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {row.fleets.map(formatFleet).join(', ')} · {row.label}
            </div>
          </div>
          {row.isCheck && (
            row.assignedToName
              ? <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{row.assignedToName}</div>
              : <span className="badge warn" style={{ fontSize: 11 }}>Unassigned</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/api/dashboard/summary').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-text">{error}</div>;
  if (!data) return <div className="page-loading">Loading…</div>;

  const { summary } = data;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Welcome back, {user.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{formatUserRole(user.role)} · {formatDate(new Date().toISOString())}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate('/trainees?new=1')}>Add Trainee</button>
          <button onClick={() => navigate('/checks')}>Add Check</button>
          <button onClick={() => navigate('/crew?quickAdd=1')}>Quick Add Crew Member</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: '1.5rem' }}>
        <SummaryCard label="Overdue" value={summary.overdue} color="red" onClick={() => navigate('/currency?filter=overdue')} />
        <SummaryCard label="Due Soon" value={summary.dueSoon} color="amber" onClick={() => navigate('/currency?filter=due_soon')} />
        <SummaryCard label="Not Yet Completed" value={summary.notCompleted} color="gray" onClick={() => navigate('/currency?filter=not_completed')} />
        <SummaryCard label="Active Trainees" value={summary.activeTrainees} color="blue" onClick={() => navigate('/trainees')} />
        <SummaryCard label="In Training (checks)" value={summary.inTrainingChecks} color="blue" onClick={() => navigate('/checks')} />
        <SummaryCard label="Crew Current" value={`${summary.crewCurrentPercent}%`} color="green" onClick={() => navigate('/currency?filter=ok')} />
      </div>

      <NeedsAttentionPanel data={data.needsAttention} total={data.needsAttentionTotal} navigate={navigate} />
      <div style={{ marginTop: '1.5rem' }}>
        <ComingUpPanel data={data.comingUp} navigate={navigate} />
      </div>
    </div>
  );
}
