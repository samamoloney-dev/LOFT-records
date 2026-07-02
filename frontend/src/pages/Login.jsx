import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Login() {
  const { user, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="card">
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>LOFT Records</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>Sign in to continue</div>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="primary" style={{ width: '100%' }} disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
          {error && <div className="error-text">{error}</div>}
        </form>
      </div>
    </div>
  );
}
