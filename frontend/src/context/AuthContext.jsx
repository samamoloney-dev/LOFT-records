import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // No point calling /me with no token at all - skip straight to
    // logged-out instead of a guaranteed 401 round trip on every fresh visit.
    if (!api.hasToken()) { setLoading(false); return; }
    api.get('/api/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => { api.clearToken(); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const data = await api.post('/api/auth/login', { email, password });
    api.setToken(data.token);
    setUser(data.user);
  }

  async function logout() {
    await api.post('/api/auth/logout').catch(() => {});
    api.clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
