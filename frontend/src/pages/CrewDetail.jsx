import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { EpChecks } from './EpChecks';
import { CaChecks } from './CaChecks';
import { ProficiencyChecks } from './ProficiencyChecks';
import { PilotLineCheck } from './PilotLineCheck';
import { DueBadge } from '../components/DueBadge';
import { ArchiveButton } from '../components/ArchiveButton';

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

export function CrewDetail() {
  const { id } = useParams();
  const [member, setMember] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/crew/${id}`).then(setMember).catch((e) => setError(e.message));
  }
  useEffect(load, [id]);

  const isPilot = member?.type === 'PILOT';
  const tabs = isPilot
    ? [{ key: 'ep', label: 'Emergency Procedures' }, { key: 'ipc', label: 'IPC' }, { key: 'pc', label: 'Proficiency Check' }, { key: 'linecheck', label: 'Line Check' }]
    : [{ key: 'ep', label: 'Emergency Procedures' }, { key: 'linecheck', label: 'Line Check' }];
  const [tab, setTab] = useState('ep');

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

  const name = `${member.firstName} ${member.lastName}`;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>{name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{member.fleet} · {member.role}</div>
        </div>
        <ArchiveButton archived={member.archived} canArchive onArchive={archiveMember} onUnarchive={unarchiveMember} />
      </div>

      <div className="card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <DueBadge label="Emergency Procedures" info={member.currency.emergencyProcedures} />
        {isPilot && <DueBadge label="IPC" info={member.currency.ipc} />}
        {isPilot && <DueBadge label="Proficiency Check" info={member.currency.proficiencyCheck} />}
        <DueBadge label="Line Check" info={member.currency.lineCheck} />
      </div>

      <TabBar tabs={tabs} active={tab} onSelect={setTab} />

      {tab === 'ep' && <EpChecks appliesTo={member.type} crewMemberId={member.id} crewMemberName={name} />}
      {tab === 'ipc' && isPilot && <ProficiencyChecks variant="IPC_PC" label="IPC" crewMemberId={member.id} crewMemberName={name} />}
      {tab === 'pc' && isPilot && <ProficiencyChecks variant="PC" label="Proficiency Check" crewMemberId={member.id} crewMemberName={name} />}
      {tab === 'linecheck' && isPilot && <PilotLineCheck crewMemberId={member.id} crewMemberName={name} />}
      {tab === 'linecheck' && !isPilot && <CaChecks crewMemberId={member.id} crewMemberName={name} />}
    </div>
  );
}
