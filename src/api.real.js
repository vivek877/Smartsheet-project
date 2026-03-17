// src/api.real.js (CRA)
const BASE =
  process.env.REACT_APP_API_BASE || "https://smartsheet-intake-sla-demo.onrender.com";

async function http(path, init = {}) {
  // Only add Content-Type when we send a body
  const headers = { ...(init.headers || {}) };
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (!res.ok) {
    // try to surface JSON error message if present
    let text;
    try { text = await res.text(); } catch {}
    try { const j = JSON.parse(text); throw new Error(j.message || text || `HTTP ${res.status}`); }
    catch { throw new Error(text || `HTTP ${res.status}`); }
  }
  // handle empty body (204) gracefully
  const contentType = res.headers.get('content-type') || '';
  return contentType.includes('application/json') ? res.json() : null;
}

export const getMeta     = () => http('/api/meta'); // no Content-Type (no body)
export const getTasks    = () => http('/api/tasks');
export const createTask  = (body)    => http('/api/tasks', { method: 'POST',  body: JSON.stringify(body) });
export const updateTask  = (rowId, cells) => http(`/api/tasks/${rowId}`, { method: 'PATCH', body: JSON.stringify({ cells }) });
export const deleteTask  = (rowId)   => http(`/api/tasks/${rowId}`, { method: 'DELETE' });