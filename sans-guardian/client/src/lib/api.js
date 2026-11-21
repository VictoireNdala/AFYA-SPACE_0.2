// Same-origin API client (Vite proxies /api and /stream to the onboard server).
const TOKEN = import.meta.env.VITE_SG_TOKEN;

// Static demo (GitHub Pages): no server. GET requests are answered from JSON snapshots recorded
// from the real onboard server (server/scripts/export-static-demo.js), the live stream is replayed
// from a recording, and every write is refused with an explicit message.
export const STATIC = import.meta.env.VITE_STATIC === '1';
export const STATIC_NOTICE = 'Static demo: this action needs the onboard server. Run it locally (see the README) to use it.';

/** URL of a file in /public that also works when the app is served under a sub-path. */
export const asset = (p) => `${import.meta.env.BASE_URL}${String(p).replace(/^\//, '')}`;

export async function api(path, opts = {}) {
  if (STATIC) {
    if ((opts.method || 'GET') !== 'GET') throw new Error(STATIC_NOTICE);
    const res = await fetch(asset(`demo-data${path.split('?')[0]}.json`));
    if (!res.ok) throw new Error(`No snapshot for ${path}`);
    return res.json();
  }
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
