// const BASE = import.meta?.env?.VITE_API_BASE || ''; // in StackBlitz you can hardcode your API base if needed
const BASE = import.meta.env.VITE_API_BASE || "https://smartsheet-intake-sla-demo.onrender.com";
async function http(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...(init || {})
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const getMeta   = () => http('/api/meta');
export const getTasks  = () => http('/api/tasks');
export const createTask = (body) => http('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
export const updateTask = (rowId, cells) => http(`/api/tasks/${rowId}`, { method: 'PATCH', body: JSON.stringify({ cells }) });
export const deleteTask = (rowId) => http(`/api/tasks/${rowId}`, { method: 'DELETE' });