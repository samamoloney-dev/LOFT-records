import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

const RATINGS = ['Below standard', 'Standard', 'Above average', 'Outstanding'];

// Matches the approach tally table in the Dash 8 / Metro 23 / Fokker 100
// Line Training Records - no circling approaches are conducted.
export const APPROACH_TYPES = ['ILS', 'LLZ', 'RNP LNAV', 'NDB', 'VOR', 'DGA'];

export function FlightRow({ flight, trainee, onChange }) {
  const { user } = useAuth();
  const isCabinAttendant = trainee?.type === 'CABIN_ATTENDANT';
  const [editing, setEditing] = useState(false);
  const [subTab, setSubTab] = useState('details');
  const [comments, setComments] = useState(flight.debriefComments || '');
  const [rating, setRating] = useState(flight.loftPerformanceRating || '');
  const [route, setRoute] = useState(flight.sectorDetails?.route || '');
  const [approaches, setApproaches] = useState(
    flight.sectorDetails?.approaches?.length ? flight.sectorDetails.approaches : [{ type: '' }, { type: '' }],
  );
  const [position, setPosition] = useState(flight.sectorDetails?.position || '');
  const [aircraft, setAircraft] = useState(flight.sectorDetails?.aircraft || '');
  const [destination, setDestination] = useState(flight.sectorDetails?.destination || '');
  const [assessorSig, setAssessorSig] = useState(flight.assessorSignature || '');
  const [candidateSig, setCandidateSig] = useState(flight.candidateSignature || '');
  const [nextSortie, setNextSortie] = useState(flight.nextSortieNotes || '');
  const [error, setError] = useState(null);

  // Only whoever created the flight may edit it - no role check here, this
  // is an ownership lock (mirrors backend canEditFlight).
  const canEdit = user.id === flight.trainingCaptainId && !flight.locked;
  const canAcknowledge = user.role === 'TRAINEE' && user.traineeId === flight.traineeId && flight.locked && !flight.acknowledgedByTrainee;

  async function saveComments() {
    setError(null);
    try {
      const updated = await api.patch(`/api/flights/${flight.id}`, { debriefComments: comments });
      onChange(updated);
    } catch (err) { setError(err.message); }
  }

  async function saveNextSortie() {
    setError(null);
    try {
      const updated = await api.patch(`/api/flights/${flight.id}`, { nextSortieNotes: nextSortie });
      onChange(updated);
    } catch (err) { setError(err.message); }
  }

  async function saveRating(value) {
    setError(null);
    setRating(value);
    try {
      const updated = await api.patch(`/api/flights/${flight.id}`, { loftPerformanceRating: value });
      onChange(updated);
    } catch (err) { setError(err.message); }
  }

  async function saveSectorDetails(patch) {
    setError(null);
    try {
      const updated = await api.patch(`/api/flights/${flight.id}`, {
        sectorDetails: isCabinAttendant
          ? { ...flight.sectorDetails, position, aircraft, destination, ...patch }
          : { ...flight.sectorDetails, route, approaches, ...patch },
      });
      onChange(updated);
    } catch (err) { setError(err.message); }
  }

  function updateApproachType(index, value) {
    const next = approaches.map((a, i) => (i === index ? { type: value } : a));
    setApproaches(next);
    saveSectorDetails({ approaches: next });
  }

  async function saveSignature(field, value) {
    setError(null);
    try {
      const updated = await api.patch(`/api/flights/${flight.id}`, { [field]: value });
      onChange(updated);
    } catch (err) { setError(err.message); }
  }

  async function finalize() {
    setError(null);
    try { onChange(await api.post(`/api/flights/${flight.id}/finalize`)); }
    catch (err) { setError(err.message); }
  }

  async function acknowledge() {
    setError(null);
    try { onChange(await api.post(`/api/flights/${flight.id}/acknowledge`)); }
    catch (err) { setError(err.message); }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 500 }}>{new Date(flight.date).toLocaleDateString()}{!isCabinAttendant && ` · ${Number(flight.hours)}h`}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {flight.locked ? 'Finalized' : 'Draft'}
            {flight.acknowledgedByTrainee ? ' · Acknowledged by trainee' : ''}
          </div>
        </div>
        {(canEdit || canAcknowledge) && (
          <button onClick={() => setEditing((v) => !v)}>{editing ? 'Close' : 'Open'}</button>
        )}
      </div>

      {flight.debriefComments && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
          <strong>Flight Comments:</strong> {flight.debriefComments}
        </div>
      )}
      {flight.nextSortieNotes && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          <strong>Next sortie:</strong> {flight.nextSortieNotes}
        </div>
      )}

      {editing && (
        <div style={{ marginTop: '0.75rem' }}>
          <div style={{ display: 'flex', gap: 0, marginBottom: '0.875rem', borderBottom: '0.5px solid var(--border)' }}>
            <button
              onClick={() => setSubTab('details')}
              style={{ border: 'none', background: 'none', padding: '6px 12px', borderBottom: subTab === 'details' ? '2px solid var(--text-primary)' : '2px solid transparent', fontWeight: subTab === 'details' ? 500 : 400 }}
            >Flight Details</button>
            <button
              onClick={() => setSubTab('nextSortie')}
              style={{ border: 'none', background: 'none', padding: '6px 12px', borderBottom: subTab === 'nextSortie' ? '2px solid var(--text-primary)' : '2px solid transparent', fontWeight: subTab === 'nextSortie' ? 500 : 400 }}
            >Next Sortie</button>
          </div>

          {subTab === 'details' && (
            <>
              {isCabinAttendant ? (
                <div className="grid2" style={{ marginBottom: '0.875rem' }}>
                  <div className="field">
                    <label>Position</label>
                    <input
                      disabled={!canEdit}
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      onBlur={() => saveSectorDetails({ position })}
                      placeholder="e.g. CA1"
                    />
                  </div>
                  <div className="field">
                    <label>Aircraft</label>
                    <input
                      disabled={!canEdit}
                      value={aircraft}
                      onChange={(e) => setAircraft(e.target.value)}
                      onBlur={() => saveSectorDetails({ aircraft })}
                      placeholder="e.g. Dash 8-300"
                    />
                  </div>
                  <div className="field">
                    <label>Destination</label>
                    <input
                      disabled={!canEdit}
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      onBlur={() => saveSectorDetails({ destination })}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="field">
                    <label>Route</label>
                    <input
                      disabled={!canEdit}
                      value={route}
                      onChange={(e) => setRoute(e.target.value)}
                      onBlur={() => saveSectorDetails({ route })}
                      placeholder="e.g. YSSY - YMML"
                    />
                  </div>

                  <div className="field"><label>Approaches flown</label></div>
                  <div className="grid2" style={{ marginBottom: '0.875rem' }}>
                    {approaches.map((a, i) => (
                      <select key={i} disabled={!canEdit} value={a.type || ''} onChange={(e) => updateApproachType(i, e.target.value)}>
                        <option value="">Approach {i + 1} — none</option>
                        {APPROACH_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    ))}
                  </div>
                </>
              )}

              <div className="field">
                <label>Flight Comments</label>
                <textarea
                  disabled={!canEdit}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  onBlur={saveComments}
                  style={{ minHeight: 70 }}
                />
              </div>
              {!isCabinAttendant && (
                <div className="field">
                  <label>LOFT performance rating</label>
                  <select disabled={!canEdit} value={rating} onChange={(e) => saveRating(e.target.value)}>
                    <option value="">—</option>
                    {RATINGS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              )}

              <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-secondary)', margin: '0.75rem 0' }}>
                We, the undersigned, do hereby mutually agree upon and accept the comment written in
                this document as being a correct and honest account of the performance of the
                Applicant in each and every procedure carried out.
              </div>
              <div className="grid2">
                <div className="field">
                  <label>Assessor signature</label>
                  <input
                    disabled={!canEdit}
                    value={assessorSig}
                    onChange={(e) => setAssessorSig(e.target.value)}
                    onBlur={() => saveSignature('assessorSignature', assessorSig)}
                  />
                </div>
                <div className="field">
                  <label>Candidate signature</label>
                  <input
                    disabled={!canEdit}
                    value={candidateSig}
                    onChange={(e) => setCandidateSig(e.target.value)}
                    onBlur={() => saveSignature('candidateSignature', candidateSig)}
                  />
                </div>
              </div>

              {canEdit && <button className="primary" onClick={finalize}>Finalize flight</button>}
              {canAcknowledge && <button className="primary" onClick={acknowledge}>Acknowledge debrief</button>}
            </>
          )}

          {subTab === 'nextSortie' && (
            <div className="field">
              <label>Notes for the next sortie</label>
              <textarea
                disabled={!canEdit}
                value={nextSortie}
                onChange={(e) => setNextSortie(e.target.value)}
                onBlur={saveNextSortie}
                style={{ minHeight: 100 }}
                placeholder="What should the next Training Captain focus on?"
              />
            </div>
          )}

          {error && <div className="error-text">{error}</div>}
        </div>
      )}
    </div>
  );
}
