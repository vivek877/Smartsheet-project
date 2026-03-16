import React, { useEffect, useMemo, useRef, useState } from 'react';

// 👉 mock API for the demo UI; later switch to ./api.real

import { getMeta, getTasks, createTask, updateTask, deleteTask } from "./api.real";
import { getContacts } from "./api.mock"; // keep only for contact labels if you haven't added /api/contacts


import ContactMultiSelect from './components/ContactMultiSelect';

/* ======================= Theming (optional toggle) ======================= */
function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const resolved =
    theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.dataset.theme = resolved;
  }, [theme, resolved]);

  return { theme, setTheme, resolved, toggle: () => setTheme(resolved === 'dark' ? 'light' : 'dark') };
}

/* ======================= Render helpers ======================= */
const statusClass = (s) => {
  const v = (String(s || '').toLowerCase());
  if (v.includes('progress')) return 'status-progress';
  if (v.includes('complete')) return 'status-complete';
  if (v.includes('hold')) return 'status-hold';
  return 'status-queue';
};

const healthClass = (h) => {
  const v = (String(h || '').toLowerCase());
  if (v.includes('green')) return 'health-green';
  if (v.includes('yellow')) return 'health-yellow';
  if (v.includes('red')) return 'health-red';
  return 'health-blue';
};

// Business days (Mon–Fri) from today to end (yyyy-mm-dd or ISO) if cell missing
function bizDaysFromToday(endValue) {
  if (!endValue) return '';
  const d = new Date(endValue);
  if (isNaN(d.getTime())) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const dir = d >= today ? 1 : -1;
  let count = 0; let cur = new Date(today);
  while ((dir > 0 && cur <= d) || (dir < 0 && cur >= d)) {
    const day = cur.getDay(); // 0 Sun ... 6 Sat
    if (day !== 0 && day !== 6) count += dir;
    cur.setDate(cur.getDate() + dir);
  }
  return dir > 0 ? count : -count;
}

const cellVal = (row, title) => (row?.cells?.[title]?.value ?? '');

/* ======================= Small Field wrapper ======================= */
function Field({ label, children, style }) {
  return (
    <div style={{ margin: '10px 0', ...style }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

/* ======================= Add Task Modal ======================= */
function AddModal({ phases, contacts, onClose, onCreate }) {
  const [form, setForm] = useState({
    taskName: '',
    phaseRowId: '',
    assignedTo: [],
    start: '',
    end: '',
    percent: 0
  });

  return (
    <div className="modal-backdrop" onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999
    }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{
        width: 520, maxWidth: '92vw',
        background: 'var(--panel)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)'
      }}>
        <h3 style={{ marginTop: 0 }}>Add New Task</h3>

        <Field label="Primary">
          <input
            value={form.taskName}
            onChange={(e) => setForm({ ...form, taskName: e.target.value })}
          />
        </Field>

        <Field label="Phase">
          <select
            value={form.phaseRowId}
            onChange={(e) => setForm({ ...form, phaseRowId: e.target.value })}
          >
            <option value="">Select phase…</option>
            {phases.map((p) => (
              <option key={String(p.id)} value={String(p.id)}>{p.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Assigned To">
          <ContactMultiSelect
            contacts={contacts}
            value={form.assignedTo}
            onChange={(updated) => setForm({ ...form, assignedTo: updated })}
          />
        </Field>

        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Start Date" style={{ flex: 1 }}>
            <input
              type="date"
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            />
          </Field>
          <Field label="End Date" style={{ flex: 1 }}>
            <input
              type="date"
              value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
            />
          </Field>
        </div>

        <Field label="% Complete">
          <input
            type="number"
            min={0}
            max={100}
            value={form.percent}
            onChange={(e) => setForm({ ...form, percent: Number(e.target.value) })}
          />
        </Field>

        <div style={{ marginTop: 12, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (!form.phaseRowId) { alert('Select Phase'); return; }
              if (!form.taskName.trim()) { alert('Primary name required'); return; }
              onCreate(form);
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================= Delete Confirmation Dialog ======================= */
function ConfirmDialog({ open, title, message, confirmText = 'Delete', onCancel, onConfirm }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{
        width: 440, maxWidth: '92vw',
        background: 'var(--panel)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)'
      }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <div style={{ color: 'var(--text)' }}>{message}</div>
        <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

/* ======================= App ======================= */
export default function App() {
  const { toggle } = useTheme();

  const [meta, setMeta] = useState(null);            // { sheetId, columns[], phases[] }
  const [rows, setRows] = useState([]);              // flattened rows
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);     // Add modal
  const [editRow, setEditRow] = useState(null);      // Edit drawer target row
  const [editForm, setEditForm] = useState({});      // Edit drawer state
  const [selected, setSelected] = useState(null);    // selected rowId (string)
  const [q, setQ] = useState('');                    // search

  const [confirmState, setConfirmState] = useState({ open: false, row: null }); // delete confirm

  const searchRef = useRef(null);

  // keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      const inField = tag === 'INPUT' || tag === 'TEXTAREA';

      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (searchRef.current) searchRef.current.focus();
        return;
      }
      if (inField) return;

      if (e.key === 'd') toggle();
      if (e.key === 'n') setShowAdd(true);

      if (e.key === 'e' && selected) {
        const r = rows.find((r) => String(r.id) === String(selected));
        if (r && !r.isPhase) {
          setEditRow(r);
          seedEditForm(r);
        }
      }
      if (e.key === 'Delete' && selected) requestDelete(selected);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        if (editRow) onSaveEdit();
        e.preventDefault();
      }
      if (e.key === 'Escape') {
        setShowAdd(false);
        setEditRow(null);
        setConfirmState({ open: false, row: null });
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, editRow, rows, toggle]);

  // load
  async function load() {
    setLoading(true);
    const m = await getMeta();
    setMeta(m);
    const t = await getTasks();
    setRows(t.rows || []);
    const ppl = await getContacts();
    setContacts(ppl || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // helpers
  const columns = (meta && meta.columns) || [];
  const phases = (meta && meta.phases) || [];

  function cellValue(row, title) {
    return (row?.cells?.[title]?.value ?? '');
  }

  function seedEditForm(row) {
    setEditForm({
      primary: cellValue(row, 'Primary'),
      status: cellValue(row, 'Status'),
      assignedTo: Array.isArray(cellValue(row, 'Assigned To')) ? cellValue(row, 'Assigned To') : (
        cellValue(row, 'Assigned To') ? [cellValue(row, 'Assigned To')] : []
      ),
      start: (cellValue(row, 'Start Date') || ''),
      end: (cellValue(row, 'End Date') || ''),
      percent: Number(cellValue(row, '% Complete') || 0)
    });
  }

  // children count map (for the "Children" column)
  const childrenCount = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      if (r.parentId) {
        const key = String(r.parentId);
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
    return map;
  }, [rows]);

  // search filter
  const displayRows = useMemo(() => {
    if (!q.trim()) return rows;
    const term = q.trim().toLowerCase();
    const contains = (x) => String(x || '').toLowerCase().includes(term);
    return rows.filter(r => {
      const name = cellValue(r, 'Primary');
      const status = cellValue(r, 'Status');
      const health = cellValue(r, 'Health');
      const preds = cellValue(r, 'Predecessors');
      const assigned = cellValue(r, 'Assigned To');
      const assignedStr = Array.isArray(assigned) ? assigned.join(',') : assigned;
      return contains(name) || contains(status) || contains(health) || contains(preds) || contains(assignedStr);
    });
  }, [rows, q]);

  /* ======================= CRUD ======================= */
  async function onCreate(form) {
    await createTask({
      parentId: String(form.phaseRowId),
      cells: {
        'Primary': form.taskName || form.primary || 'New Task',
        'Assigned To': form.assignedTo || [],
        'Start Date': form.start || '',
        'End Date': form.end || '',
        '% Complete': Number(form.percent || 0),
        'Status': 'In Queue'
      }
    });
    setShowAdd(false);
    await load();
  }

  async function onQuickUpdate(rowId, title, value) {
    await updateTask(String(rowId), { [title]: value });
    const t = await getTasks();
    setRows(t.rows || []);
  }

  function requestDelete(rowId) {
    const row = rows.find((x) => String(x.id) === String(rowId));
    if (!row) return;
    if (row.isPhase) {
      alert('Cannot delete a phase');
      return;
    }
    setConfirmState({
      open: true,
      row: {
        id: rowId,
        name: cellValue(row, 'Primary') || 'this task'
      }
    });
  }

  async function confirmDelete() {
    if (!confirmState.row) return;
    await deleteTask(String(confirmState.row.id));
    setConfirmState({ open: false, row: null });
    await load();
  }

  async function onDelete(rowId) {
    // not used directly anymore; keyboard Delete calls requestDelete
    requestDelete(rowId);
  }

  async function onSaveEdit() {
    if (!editRow) return;
    await updateTask(String(editRow.id), {
      'Primary': editForm.taskName || editForm.primary || cellValue(editRow, 'Primary'),
      'Assigned To': editForm.assignedTo || [],
      'Start Date': editForm.start || '',
      'End Date': editForm.end || '',
      '% Complete': Number(editForm.percent || 0)
    });
    setEditRow(null);
    await load();
  }

  if (loading) return <div className="container">Loading…</div>;

  return (
    <div className="container">

      {/* Header */}
      <div className="app-header" style={{ display: 'flex', justifyContent: 'space-between', padding: 14 }}>
        <div style={{ fontWeight: 700 }}>
          {`PR‑123456 — Example Project Plan`}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" title="Toggle dark (d)" onClick={toggle}>☾/☀︎</button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Task</button>
        </div>
      </div>

      {/* Toolbar / Search */}
      <div className="toolbar">
        <div className="searchbar">
          <span style={{ opacity: .6 }}>🔎</span>
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tasks, status, assignees… (/)"
          />
          {q && <span className="search-count">{displayRows.length} result{displayRows.length === 1 ? '' : 's'}</span>}
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="gantt-table">
          <thead>
            <tr>
              <th style={{ width: 24 }}></th>
              {columns.map((c) => (
                <th key={String(c.id)}>{c.title}</th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => (
              <tr
                key={String(row.id)}
                className={row.isPhase ? 'phase-row' : ''}
                onClick={() => setSelected(String(row.id))}
                style={{ cursor: 'pointer' }}
              >
                {/* hierarchy indicator */}
                <td className="cell-indent">{row.indent ? '↳' : ''}</td>

                {columns.map((col) => {
                  const cell = (row.cells?.[col.title]) || { value: '', editable: false };

                  // Health → circular dot
                  if (col.title === 'Health') {
                    const h = cell.value || '';
                    return (
                      <td key={String(col.id)}>
                        <span className="health">
                          <span className={`health-dot ${healthClass(h)}`}></span>
                        </span>
                      </td>
                    );
                  }

                  // Status → colored chip
if (col.title === 'Status') {
  const v = cell.value || 'In Queue';
  return (
    <td key={String(col.id)}>
      <span className={`status-chip ${statusClass(v)}`}>{v}</span>
    </td>
  );
}

// Children → compute for phases
if (col.title === 'Children') {
  const c = row.parentId ? 0 : (childrenCount.get(String(row.id)) || 0);
  return <td key={String(col.id)} className="cell-muted">{c}</td>;
}

// Working Days Remaining → compute if empty
if (col.title === 'Working Days Remaining') {
  const raw = cell.value;
  const fallback = bizDaysFromToday(cellVal(row, 'End Date'));
  const shown = (raw !== '' && raw !== null && raw !== undefined) ? raw : (fallback || '—');
  return <td key={String(col.id)} className={!shown || shown === '—' ? 'cell-muted' : ''}>{shown}</td>;
}

// Modified / Modified By
if (col.title === 'Modified' || col.title === 'Modified By') {
  const v = cell.value || '—';
  return <td key={String(col.id)} className={!cell.value ? 'cell-muted' : ''}>{v}</td>;
}

// Inline editors (tasks only)
if (!row.isPhase && col.title === '% Complete') {
  const val = Number(cell.value || 0);
  return (
    <td key={String(col.id)}>
      <input
        type="number"
        min={0}
        max={100}
        value={val}
        onChange={(e) => onQuickUpdate(row.id, '% Complete', Number(e.target.value))}
      />
    </td>
  );
}

if (!row.isPhase && (col.title === 'Start Date' || col.title === 'End Date')) {
  const iso = String(cell.value || '');
  return (
    <td key={String(col.id)}>
      <input
        type="date"
        value={iso ? iso.split('T')[0] : ''}
        onChange={(e) => onQuickUpdate(row.id, col.title, e.target.value)}
      />
    </td>
  );
}

if (col.title === 'Assigned To') {
  const selected = Array.isArray(cell.value) ? cell.value : (cell.value ? [cell.value] : []);
  return (
    <td key={String(col.id)} style={{ minWidth: 240 }}>
      <ContactMultiSelect
        contacts={contacts}
        value={selected}
        onChange={(updated) => onQuickUpdate(row.id, 'Assigned To', updated)}
      />
    </td>
  );
}

if (col.title === 'Primary') {
  const val = String(cell.value ?? '');
  return (
    <td key={String(col.id)}>
      {row.isPhase
        ? <strong>{val}</strong>
        : <input value={val} onChange={(e) => onQuickUpdate(row.id, 'Primary', e.target.value)} />
      }
    </td>
  );
}

// Default render (respect editable flag)
return (
  <td key={String(col.id)}>
    {cell.editable
      ? <input value={String(cell.value ?? '')} onChange={(e) => onQuickUpdate(row.id, col.title, e.target.value)} />
      : <span className={!cell.value ? 'cell-muted' : ''}>{String(cell.value ?? '—') || '—'}</span>
    }
  </td>
);
})}

<td style={{ whiteSpace: 'nowrap' }}>
  {!row.isPhase && (
    <>
      <button className="btn" onClick={() => { setEditRow(row); seedEditForm(row); }}>Edit</button>
      <button className="btn" style={{ marginLeft: 6 }} onClick={() => requestDelete(row.id)}>Delete</button>
    </>
  )}
  {row.isPhase && <span className="cell-muted">—</span>}
</td>
</tr>
))}
</tbody>
</table>
</div>

{/* Add Task Modal */}
{showAdd && (
  <AddModal
    phases={phases}
    contacts={contacts}
    onClose={() => setShowAdd(false)}
    onCreate={onCreate}
  />
)}

{/* Edit Drawer */}
{editRow && (
  <div className="drawer" style={{
    position: 'fixed', right: 16, top: 16, bottom: 16, width: 380,
    background: 'var(--panel)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)', zIndex: 999
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h3 style={{ margin: 0 }}>Edit Task</h3>
      <button className="btn" onClick={() => setEditRow(null)}>×</button>
    </div>

    <Field label="Primary">
      <input
        value={editForm.primary || ''}
        onChange={(e) => setEditForm({ ...editForm, primary: e.target.value })}
      />
    </Field>

    <Field label="Assigned To">
      <ContactMultiSelect
        contacts={contacts}
        value={editForm.assignedTo || []}
        onChange={(updated) => setEditForm({ ...editForm, assignedTo: updated })}
      />
    </Field>

    <Field label="% Complete">
      <input
        type="number"
        min={0}
        max={100}
        value={editForm.percent || 0}
        onChange={(e) => setEditForm({ ...editForm, percent: Number(e.target.value) })}
      />
    </Field>

    <div style={{ display: 'flex', gap: 10 }}>
      <Field label="Start Date" style={{ flex: 1 }}>
        <input
          type="date"
          value={(editForm.start || '').split('T')[0] || ''}
          onChange={(e) => setEditForm({ ...editForm, start: e.target.value })}
        />
      </Field>
      <Field label="End Date" style={{ flex: 1 }}>
        <input
          type="date"
          value={(editForm.end || '').split('T')[0] || ''}
          onChange={(e) => setEditForm({ ...editForm, end: e.target.value })}
        />
      </Field>
    </div>

    <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
      <button className="btn" onClick={() => setEditRow(null)}>Cancel</button>
      <button className="btn btn-primary" onClick={onSaveEdit}>Save</button>
    </div>
  </div>
)}

{/* Delete Confirmation */}
<ConfirmDialog
  open={confirmState.open}
  title="Delete Task"
  message={
    confirmState.row
      ? `Are you sure you want to delete "${confirmState.row.name}"? This cannot be undone.`
      : ''
  }
  confirmText="Delete"
  onCancel={() => setConfirmState({ open: false, row: null })}
  onConfirm={confirmDelete}
/>
</div>
);
}
