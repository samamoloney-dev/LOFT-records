import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatDate, formatUserRole } from '../lib/format';
import { ArchiveButton } from '../components/ArchiveButton';
import { PrintButton } from '../components/PrintButton';
import { openPrintWindow, section, signatureBlock } from '../lib/print';

// Browses archived LOFT flight records across all trainees of one type
// (pilot or cabin attendant). Flights archive as one package per trainee
// (see FlightsTab on the trainee page), so this groups by trainee rather
// than listing flights individually.
export function ArchivedFlights({ traineeType }) {
  const [flights, setFlights] = useState([]);
  const [error, setError] = useState(null);

  function load() {
    api.get('/api/flights?archived=true')
      .then((all) => setFlights(all.filter((f) => f.traineeType === traineeType)))
      .catch((e) => setError(e.message));
  }
  useEffect(load, [traineeType]);

  async function unarchivePackage(traineeId) {
    setError(null);
    try { await api.post(`/api/flights/trainee/${traineeId}/unarchive-package`); load(); }
    catch (err) { setError(err.message); }
  }

  function printFlight(f) {
    const isCa = f.traineeType === 'CABIN_ATTENDANT';
    const sector = f.sectorDetails || {};
    const html = `
      <h1>LOFT Flight Record</h1>
      <div class="meta">${f.firstName} ${f.lastName} · ${formatDate(f.date)}${!isCa ? ` · ${Number(f.hours)}h` : ''}</div>
      ${section('Flight details', isCa
        ? [['Position', sector.position], ['Aircraft', sector.aircraft], ['Destination', sector.destination]]
        : [['Route', sector.route], ['Approaches flown', (sector.approaches || []).map((a) => a.type).filter(Boolean).join(', ') || '—']])}
      ${section('Debrief', isCa
        ? [['Other completed tasks', f.otherCompletedTasks], ['Development required', f.debriefComments], ['Homework', f.nextSortieNotes]]
        : [['Flight comments', f.debriefComments], ['LOFT performance rating', f.loftPerformanceRating], ['Next sortie', f.nextSortieNotes]])}
      ${section('Sign-off', [
        [f.trainingCaptainRole ? formatUserRole(f.trainingCaptainRole) : 'Trainer', f.trainingCaptainName],
        ['Acknowledged by trainee', f.acknowledgedByTrainee ? `Yes${f.acknowledgedAt ? ` (${formatDate(f.acknowledgedAt)})` : ''}` : 'No'],
      ])}
      <div class="disclaimer">We, the undersigned, do hereby mutually agree upon and accept the comment written in this document as being a correct and honest account of the performance of the Applicant in each and every procedure carried out.</div>
      ${signatureBlock([['Assessor signature', f.assessorSignature], ['Candidate signature', f.candidateSignature]])}
    `;
    openPrintWindow(`LOFT Flight - ${f.firstName} ${f.lastName} - ${f.date}`, html);
  }

  const byTrainee = new Map();
  for (const f of flights) {
    if (!byTrainee.has(f.traineeId)) byTrainee.set(f.traineeId, []);
    byTrainee.get(f.traineeId).push(f);
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>Archived LOFT packages</div>
      {error && <div className="error-text">{error}</div>}
      {byTrainee.size === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No archived LOFT records.</div>}
      {[...byTrainee.entries()].map(([traineeId, traineeFlights]) => (
        <div key={traineeId} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 500 }}>{traineeFlights[0].firstName} {traineeFlights[0].lastName}</div>
            <ArchiveButton archived onUnarchive={() => unarchivePackage(traineeId)} />
          </div>
          {traineeFlights.map((f) => (
            <div key={f.id} className="row" style={{ cursor: 'default' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>
                  {formatDate(f.date)}{f.traineeType !== 'CABIN_ATTENDANT' && ` · ${Number(f.hours)}h`}
                  {f.trainingCaptainName ? ` · ${f.trainingCaptainRole ? formatUserRole(f.trainingCaptainRole) : 'Trainer'}: ${f.trainingCaptainName}` : ''}
                </div>
                {f.loftPerformanceRating && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Rating: {f.loftPerformanceRating}</div>}
                {f.debriefComments && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{f.debriefComments}</div>}
              </div>
              <PrintButton onPrint={() => printFlight(f)} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
