import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { EpChecks } from './EpChecks';
import { CaChecks } from './CaChecks';
import { ProficiencyChecks } from './ProficiencyChecks';
import { PilotLineCheck } from './PilotLineCheck';
import { DueBadge } from '../components/DueBadge';
import { ArchiveButton } from '../components/ArchiveButton';
import { TabBar } from '../components/TabBar';
import { formatFleet, formatTraineeRole, formatUserRole } from '../lib/format';
import { competencyStatus } from '../lib/dueStatus';

// HOTC/HOFO/Flight Ops Admin only (page already admin-gated) - links this
// crew profile to an existing staff account (e.g. a Training Captain who
// is also tracked for their own recurrency), so their name/fleets read
// live from the Staff page instead of needing to be kept in sync by hand.
function LinkedStaffPicker({ member, onSaved }) {
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/users').then(setStaff).catch(() => {});
  }, []);

  async function link(userId) {
    setError(null);
    try {
      const updated = await api.patch(`/api/crew/${member.id}`, { userId: userId || null });
      onSaved(updated);
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 500, marginBottom: 6 }}>Linked staff account</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
        {member.isLinked
          ? "This crew profile's name and fleets are read live from the linked staff account below - edit them on the Staff page instead."
          : 'Link this crew profile to a staff account so name/fleet amendments on the Staff page carry over here automatically.'}
      </div>
      <select value={member.userId || ''} onChange={(e) => link(e.target.value)}>
        <option value="">— Not linked —</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({formatUserRole(s.role)})</option>)}
      </select>
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

// HOTC/HOFO/Flight Ops Admin only (this whole page is admin-gated already) -
// notes a planned date for an upcoming recurrent check, purely informational
// and distinct from the computed due date. Surfaced via DueBadge and
// Currency Overview as "Planned for X".
function PlannedDateEditor({ crewMemberId, checkKey, plannedDate, onSaved }) {
  const [value, setValue] = useState(plannedDate ? plannedDate.slice(0, 10) : '');

  async function save(next) {
    setValue(next);
    const updated = await api.put(`/api/crew/${crewMemberId}/planned-checks/${checkKey}`, { plannedDate: next || null });
    onSaved(updated);
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Plan a date</label>
      <input type="date" value={value} onChange={(e) => save(e.target.value)} style={{ fontSize: 11, padding: '4px 6px' }} />
    </div>
  );
}

// Recurrent checks archived from here (once redone/superseded) still need to
// be visible from this person's own profile, not just the general Archive
// tab - this toggle flips the archived prop the check list already supports.
function CurrencyFolder({ member }) {
  const isPilot = member.type === 'PILOT';
  const subTabs = isPilot
    ? [{ key: 'ep', label: 'Emergency Procedures' }, { key: 'ipc', label: 'IPC' }, { key: 'pc', label: 'Proficiency Check' }, { key: 'linecheck', label: 'Line Check' }]
    : [{ key: 'ep', label: 'Emergency Procedures' }, { key: 'linecheck', label: 'Line Check' }];
  const [subTab, setSubTab] = useState('ep');
  const [showArchived, setShowArchived] = useState(false);

  const name = member.name;
  // Only enforce fleet-matching in the assessor picker when it's
  // unambiguous - a crew member qualified on more than one fleet doesn't
  // have a single "the" fleet to filter by for a given check instance.
  const fleet = member.fleets.length === 1 ? member.fleets[0] : undefined;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <TabBar tabs={subTabs} active={subTab} onSelect={setSubTab} />
        <button onClick={() => setShowArchived((v) => !v)} style={{ marginBottom: '1.25rem' }}>
          {showArchived ? 'Show active' : 'Show archived'}
        </button>
      </div>

      {subTab === 'ep' && <EpChecks appliesTo={member.type} crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} />}
      {subTab === 'ipc' && isPilot && <ProficiencyChecks variant="IPC_PC" label="IPC" crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} />}
      {subTab === 'pc' && isPilot && <ProficiencyChecks variant="PC" label="Proficiency Check" crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} />}
      {subTab === 'linecheck' && isPilot && <PilotLineCheck crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} />}
      {subTab === 'linecheck' && !isPilot && <CaChecks crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} />}
    </div>
  );
}

// Ad-hoc competencies (e.g. Dangerous Goods, run by an external provider) -
// just a name, completion date and due date, distinct from the fixed
// recurrent-check types in the Currency folder above.
function CompetencyList({ crewMemberId }) {
  const [competencies, setCompetencies] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState({ name: '', completedDate: '', dueDate: '', plannedDate: '' });
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/crew/${crewMemberId}/competencies?archived=${showArchived}`).then(setCompetencies).catch((e) => setError(e.message));
  }
  useEffect(load, [crewMemberId, showArchived]);

  async function addCompetency(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/api/crew/${crewMemberId}/competencies`, form);
      setShowForm(false);
      setForm({ name: '', completedDate: '', dueDate: '', plannedDate: '' });
      load();
    } catch (err) { setError(err.message); }
  }

  async function updateCompetency(competencyId, patch) {
    setError(null);
    try { await api.patch(`/api/crew/${crewMemberId}/competencies/${competencyId}`, patch); load(); }
    catch (err) { setError(err.message); }
  }

  async function archiveCompetency(competencyId) {
    setError(null);
    try { await api.post(`/api/crew/${crewMemberId}/competencies/${competencyId}/archive`); load(); }
    catch (err) { setError(err.message); }
  }

  async function unarchiveCompetency(competencyId) {
    setError(null);
    try { await api.post(`/api/crew/${crewMemberId}/competencies/${competencyId}/unarchive`); load(); }
    catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Competencies</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowArchived((v) => !v)}>{showArchived ? 'Show active' : 'Show archived'}</button>
          {!showArchived && <button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : 'Add competency'}</button>}
        </div>
      </div>

      {!showArchived && showForm && (
        <form className="card" onSubmit={addCompetency}>
          <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Dangerous Goods" required /></div>
          <div className="grid2">
            <div className="field"><label>Completed date</label><input type="date" value={form.completedDate} onChange={(e) => setForm({ ...form, completedDate: e.target.value })} /></div>
            <div className="field"><label>Due date</label><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
          </div>
          <div className="field"><label>Planned date (optional - e.g. booked with the provider)</label><input type="date" value={form.plannedDate} onChange={(e) => setForm({ ...form, plannedDate: e.target.value })} /></div>
          <button type="submit" className="primary">Add</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {competencies.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No {showArchived ? 'archived ' : ''}competencies.</div>
      )}
      {competencies.map((c) => {
        const status = competencyStatus(c.dueDate);
        return (
          <div key={c.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 500 }}>{c.name}</div>
              {status && <DueBadge label="Status" info={{ dueDate: c.dueDate, status, plannedDate: c.plannedDate }} />}
            </div>
            <div className="grid2" style={{ marginTop: 8 }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Completed date</label>
                <input type="date" defaultValue={c.completedDate || ''} onBlur={(e) => updateCompetency(c.id, { completedDate: e.target.value || null })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Due date</label>
                <input type="date" defaultValue={c.dueDate || ''} onBlur={(e) => updateCompetency(c.id, { dueDate: e.target.value || null })} />
              </div>
            </div>
            <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
              <label>Planned date</label>
              <input type="date" defaultValue={c.plannedDate || ''} onBlur={(e) => updateCompetency(c.id, { plannedDate: e.target.value || null })} />
            </div>
            <button style={{ marginTop: 8 }} onClick={() => (showArchived ? unarchiveCompetency(c.id) : archiveCompetency(c.id))}>
              {showArchived ? 'Unarchive' : 'Archive'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function CrewDetail() {
  const { id } = useParams();
  const [member, setMember] = useState(null);
  const [error, setError] = useState(null);
  const [topTab, setTopTab] = useState('currency');

  function load() {
    api.get(`/api/crew/${id}`).then(setMember).catch((e) => setError(e.message));
  }
  useEffect(load, [id]);

  const isPilot = member?.type === 'PILOT';

  async function archiveMember() {
    setError(null);
    try { setMember(await api.post(`/api/crew/${id}/archive`)); }
    catch (err) { setError(err.message); }
  }
  async function unarchiveMember() {
    setError(null);
    try { setMember(await api.post(`/api/crew/${id}/unarchive`)); }
    catch (err) { setError(err.message); }
  }

  if (error) return <div className="error-text">{error}</div>;
  if (!member) return null;

  const name = member.name;
  const topTabs = [{ key: 'currency', label: 'Currency' }, { key: 'competencies', label: 'Competencies' }];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>{name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{member.fleets.map(formatFleet).join(', ')} · {formatTraineeRole(member.role)}</div>
        </div>
        <ArchiveButton archived={member.archived} canArchive onArchive={archiveMember} onUnarchive={unarchiveMember} />
      </div>

      <LinkedStaffPicker member={member} onSaved={setMember} />

      <div className="card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <DueBadge label="Emergency Procedures" info={member.currency.emergencyProcedures} />
          <PlannedDateEditor crewMemberId={member.id} checkKey="emergencyProcedures" plannedDate={member.currency.emergencyProcedures.plannedDate} onSaved={setMember} />
        </div>
        {isPilot && (
          <div>
            <DueBadge label="IPC" info={member.currency.ipc} />
            <PlannedDateEditor crewMemberId={member.id} checkKey="ipc" plannedDate={member.currency.ipc.plannedDate} onSaved={setMember} />
          </div>
        )}
        {isPilot && (
          <div>
            <DueBadge label="Proficiency Check" info={member.currency.proficiencyCheck} />
            <PlannedDateEditor crewMemberId={member.id} checkKey="proficiencyCheck" plannedDate={member.currency.proficiencyCheck.plannedDate} onSaved={setMember} />
          </div>
        )}
        <div>
          <DueBadge label="Line Check" info={member.currency.lineCheck} />
          <PlannedDateEditor crewMemberId={member.id} checkKey="lineCheck" plannedDate={member.currency.lineCheck.plannedDate} onSaved={setMember} />
        </div>
      </div>

      <TabBar tabs={topTabs} active={topTab} onSelect={setTopTab} />

      {topTab === 'currency' && <CurrencyFolder member={member} />}
      {topTab === 'competencies' && <CompetencyList crewMemberId={member.id} />}
    </div>
  );
}
