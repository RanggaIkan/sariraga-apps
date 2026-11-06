// client/src/lib/api.js: Core API client (Vercel Functions in prod, Express via Vite proxy in dev)
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function request(path, options) {
  const res = await fetch(`${API}${path}`, options);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status !== 'success') throw new Error(json.message || `HTTP ${res.status}`);
  return json.data;
}

export const fetchStats = () => request('/api/stats');
export const fetchLogs = (limit = 20) => request(`/api/detections?limit=${limit}`);
export const postLog = (payload) =>
  request('/api/detections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const formatIdr = (n) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`;
