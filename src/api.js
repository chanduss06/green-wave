// Thin client for the FastAPI + SQLite backend. Every call can fail: the app keeps working offline.
async function j(path, opt) {
  const r = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json' }, ...opt });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
const post = (p, b, m = 'POST') => j(p, { method: m, body: JSON.stringify(b) });

export const api = {
  health: () => j('/health'),
  layouts: () => j('/layouts'),
  saveLayout: (name, data) => post('/layouts', { name, data }),
  getBrain: () => j('/brain'),
  putBrain: q => post('/brain', { q }, 'PUT'),
  addRun: r => post('/runs', r),
  runs: () => j('/runs'),
  addEvent: e => post('/events', e),
};
