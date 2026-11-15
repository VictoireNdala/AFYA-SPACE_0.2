// Same-origin API client (Vite proxies /api and /stream to the onboard server).
const TOKEN = import.meta.env.VITE_SG_TOKEN;

export async function api(path, opts = {}) {
  const res = await fetch(`/api/v1${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}), ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export const post = (path, body = {}) => api(path, { method: 'POST', body: JSON.stringify(body) });

export const streamUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/stream`;
