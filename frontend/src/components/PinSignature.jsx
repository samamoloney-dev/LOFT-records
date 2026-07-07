import { useState } from 'react';
import { api } from '../api/client';
import { formatDate } from '../lib/format';

// Replaces a plain typed-name signature field with a personal 4-digit PIN -
// first sign sets the PIN (entered twice), every sign after that just
// verifies it. Renders nothing if personId is missing (an ad-hoc/free-text
// candidate with no linked crew/trainee record) - the parent form falls
// back to its old plain text input in that case.
export function PinSignature({ label, personType, personId, signedName, signedAt, disabled, onSigned }) {
  const [mode, setMode] = useState('idle'); // idle | checking | set | verify
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState(null);

  if (!personId) return null;

  function reset() {
    setMode('idle');
    setPin('');
    setConfirmPin('');
  }

  function finish(name) {
    onSigned(name, new Date().toISOString());
    reset();
  }

  async function startSign() {
    setError(null);
    setMode('checking');
    try {
      const { hasPin } = await api.post('/api/signatures/status', { personType, personId });
      setMode(hasPin ? 'verify' : 'set');
    } catch (err) {
      setError(err.message);
      setMode('idle');
    }
  }

  async function submitSet(e) {
    e.preventDefault();
    setError(null);
    try {
      const { name } = await api.post('/api/signatures/set', { personType, personId, pin, confirmPin });
      finish(name);
    } catch (err) { setError(err.message); }
  }

  async function submitVerify(e) {
    e.preventDefault();
    setError(null);
    try {
      const { name } = await api.post('/api/signatures/verify', { personType, personId, pin });
      finish(name);
    } catch (err) { setError(err.message); }
  }

  const digits = (v) => v.replace(/\D/g, '').slice(0, 4);

  if (signedName) {
    return (
      <div className="field">
        <label>{label}</label>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
          <span>Signed by {signedName}{signedAt ? ` · ${formatDate(signedAt)}` : ''}</span>
          {!disabled && <button type="button" onClick={() => onSigned(null, null)}>Clear</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="field">
      <label>{label}</label>
      {mode === 'idle' && <button type="button" disabled={disabled} onClick={startSign}>Sign</button>}
      {mode === 'checking' && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Checking…</div>}
      {mode === 'set' && (
        <form onSubmit={submitSet} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input
            type="password" inputMode="numeric" maxLength={4} placeholder="New 4-digit PIN" style={{ width: 130 }}
            value={pin} onChange={(e) => setPin(digits(e.target.value))} required autoFocus
          />
          <input
            type="password" inputMode="numeric" maxLength={4} placeholder="Confirm PIN" style={{ width: 130 }}
            value={confirmPin} onChange={(e) => setConfirmPin(digits(e.target.value))} required
          />
          <button type="submit" className="primary">Set PIN &amp; sign</button>
          <button type="button" onClick={reset}>Cancel</button>
        </form>
      )}
      {mode === 'verify' && (
        <form onSubmit={submitVerify} style={{ display: 'flex', gap: 6 }}>
          <input
            type="password" inputMode="numeric" maxLength={4} placeholder="Enter PIN" style={{ width: 130 }}
            value={pin} onChange={(e) => setPin(digits(e.target.value))} required autoFocus
          />
          <button type="submit" className="primary">Sign</button>
          <button type="button" onClick={reset}>Cancel</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
