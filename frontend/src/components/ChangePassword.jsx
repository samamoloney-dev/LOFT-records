import { useState } from 'react';
import { api } from '../api/client';

// Self-service password change, available to every logged-in staff member
// regardless of role - only HOTC/HOFO/Flight Ops Admin can even see the
// Staff tab where an account's password is first set, so this is the only
// way anyone else could ever change theirs.
export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  function toggle() {
    setOpen((v) => !v);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setNotice(null);
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (newPassword !== confirmPassword) { setError('New passwords do not match'); return; }
    if (newPassword.length < 8) { setError('New password must be at least 8 characters'); return; }
    try {
      await api.post('/api/auth/change-password', { currentPassword, newPassword });
      setNotice('Password changed.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) { setError(err.message); }
  }

  if (!open) {
    return <button onClick={toggle}>Change password</button>;
  }

  return (
    <form onSubmit={submit} className="card" style={{ maxWidth: 320, textAlign: 'left' }}>
      <div className="field">
        <label>Current password</label>
        <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
      </div>
      <div className="field">
        <label>New password</label>
        <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
      </div>
      <div className="field">
        <label>Confirm new password</label>
        <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
      </div>
      {error && <div className="error-text">{error}</div>}
      {notice && <div style={{ fontSize: 12, color: 'var(--text-success)' }}>{notice}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="primary">Save</button>
        <button type="button" onClick={toggle}>Cancel</button>
      </div>
    </form>
  );
}
