import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { DueBadge } from '../components/DueBadge';
import { formatFleet, formatTraineeRole } from '../lib/format';

const FLEETS = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];

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

const emptyForm = (type) => ({
  firstName: '', lastName: '', type, role: type === 'PILOT' ? 'FIRST_OFFICER' : 'CABIN_ATTENDANT', fleet: type === 'PILOT' ? 'DASH_8' : 'CA_DASH_8',
  lastEpDate: '', lastIpcDate: '', lastPcDate: '', lineCheckAnchorDate: '', lastLineCheckDate: '',
});

function CrewRoster({ type }) {
  const [members, setMembers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm(type));
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  function load() {
    api.get(`/api/crew?type=${type}`).then(setMembers).catch((e) => setError(e.message));
  }
  useEffect(load, [type]);

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/api/crew', form);
      setShowForm(false);
      setForm(emptyForm(type));
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const roles = type === 'PILOT' ? ['CAPTAIN', 'FIRST_OFFICER'] : ['CABIN_ATTENDANT'];
  const fleets = FLEETS.filter((f) => (type === 'PILOT' ? !f.startsWith('CA_') : f.startsWith('CA_')));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Active line crew</div>
        <button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : 'Quick add crew member'}</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleCreate}>
          <div className="grid2">
            <div className="field"><label>First name</label><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></div>
            <div className="field"><label>Last name</label><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></div>
          </div>
          <div className="grid2">
            <div className="field">
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {roles.map((r) => <option key={r} value={r}>{formatTraineeRole(r)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Fleet</label>
              <select value={form.fleet} onChange={(e) => setForm({ ...form, fleet: e.target.value })}>
                {fleets.map((f) => <option key={f} value={f}>{formatFleet(f)}</option>)}
              </select>
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0.75rem 0 0.25rem' }}>
            Seed dates - leave blank if not yet current on an item. These start the anniversary clock.
          </div>
          <div className="field"><label>Last Emergency Procedures check date</label><input type="date" value={form.lastEpDate} onChange={(e) => setForm({ ...form, lastEpDate: e.target.value })} /></div>
          {type === 'PILOT' ? (
            <>
              <div className="grid2">
                <div className="field"><label>Last IPC date</label><input type="date" value={form.lastIpcDate} onChange={(e) => setForm({ ...form, lastIpcDate: e.target.value })} /></div>
                <div className="field"><label>Last Proficiency Check date</label><input type="date" value={form.lastPcDate} onChange={(e) => setForm({ ...form, lastPcDate: e.target.value })} /></div>
              </div>
              <div className="field">
                <label>Initial Check to Line date</label>
                <input type="date" value={form.lineCheckAnchorDate} onChange={(e) => setForm({ ...form, lineCheckAnchorDate: e.target.value })} />
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Their Line Check will always be due 365 days on from this date, then every 365 days after.</div>
              </div>
            </>
          ) : (
            <div className="field"><label>Last Line Check date</label><input type="date" value={form.lastLineCheckDate} onChange={(e) => setForm({ ...form, lastLineCheckDate: e.target.value })} /></div>
          )}
          <button type="submit" className="primary">Add to Crew roster</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {members.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No crew members yet.</div>}
      {members.map((m) => (
        <div key={m.id} className="card row" onClick={() => navigate(`/crew/${m.id}`)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{m.firstName} {m.lastName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatFleet(m.fleet)} · {formatTraineeRole(m.role)}</div>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <DueBadge label="Emergency Procedures" info={m.currency.emergencyProcedures} />
            {type === 'PILOT' && <DueBadge label="IPC" info={m.currency.ipc} />}
            {type === 'PILOT' && <DueBadge label="Proficiency Check" info={m.currency.proficiencyCheck} />}
            <DueBadge label="Line Check" info={m.currency.lineCheck} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Crew() {
  const tabs = [{ key: 'pilots', label: 'Pilots' }, { key: 'cabin-attendants', label: 'Cabin Attendants' }];
  const [tab, setTab] = useState('pilots');

  return (
    <div>
      <TabBar tabs={tabs} active={tab} onSelect={setTab} />
      {tab === 'pilots' && <CrewRoster type="PILOT" />}
      {tab === 'cabin-attendants' && <CrewRoster type="CABIN_ATTENDANT" />}
    </div>
  );
}
