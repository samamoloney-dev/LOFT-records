const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Bearer token in localStorage, not a cookie - see backend/src/middleware/
// auth.js for why (Safari's Intelligent Tracking Prevention blocks
// cross-site cookies for a host that's only ever fetched in the
// background, which broke login for real iPad users even though the
// cookie was already correctly configured for cross-site use).
const TOKEN_KEY = 'loft_token';
let token = localStorage.getItem(TOKEN_KEY);

function setToken(t) {
  token = t;
  localStorage.setItem(TOKEN_KEY, t);
}

function clearToken() {
  token = null;
  localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = body ? { 'Content-Type': 'application/json' } : {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.error ? (typeof data.error === 'string' ? data.error : JSON.stringify(data.error)) : res.statusText;
    throw new Error(message);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body || {} }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
  hasToken: () => !!token,
  setToken,
  clearToken,
};
