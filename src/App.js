import React, { useEffect, useMemo, useRef, useState } from 'react';

// --- Real API for live integration ---
import { getMeta, getTasks, createTask, updateTask, deleteTask } from './api.real';
// Keep contacts only for labels/avatars (until you expose /api/contacts)
import { getContacts } from './api.mock';

// ======================= Theming (optional toggle) =======================
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

// ======================= Render helpers =======================
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

// ======================= Edit Policy (UI layer) =======================
// Titles we never allow editing for (formula/system/locked known by name)
// ONLY keep system counters as read-only; allow everything else in UI
const READONLY_TITLES = new Set([
  'Children','Ancestors','Modified','Modified By'
]);

const EDITABLE_TITLES = new Set([
  // empty => allow everything except read-only
]);

function canEdit(col, cell) {
  if (!col || READONLY_TITLES.has(col.title)) return false;
  if (col.systemColumnType) return false; // system
  // allow all other types; even if backend rejects, we'll revert
  return true;
}

// ======================= Contact Multi-select =======================
function ContactMultiSelect({ contacts = [], value = [], onChange, placeholder = 'Select assignees…' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [sel, setSel] = useState(Array.isArray(value) ? value : (value ? [value] : []));

  const boxRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setSel(Array.isArray(value) ? value : (value ? [value] : []));
  }, [value]);

  useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter(c =>
      c.name.toLowerCase().includes(term) ||
      (c.email || '').toLowerCase().includes(term)
    );
  }, [q, contacts]);

  useEffect(() => {
    if (!open) return;
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  function toggle() {
    setOpen(v => !v);
  }

  function toggleOne(email) {
    setSel(prev => {
      const next = prev.includes(email) ? prev.filter(v => v !== email) : [...prev, email];
      onChange?.(next);
      return next;
    });
  }

  function onKeyDown(e) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(i => Math.min(i + 1, filtered.length - 1));
      scrollIntoView(active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => Math.max(i - 1, 0));
      scrollIntoView(active - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = filtered[active];
      if (pick) toggleOne(pick.email);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  function scrollIntoView(idx) {
    const container = listRef.current;
    if (!container) return;
    const item = container.querySelector(`[data-index="${idx}"]`);
    if (item) {
      const cTop = container.scrollTop;
      const cBottom = cTop + container.clientHeight;
      const iTop = item.offsetTop;
      const iBottom = iTop + item.offsetHeight;
      if (iBottom > cBottom) container.scrollTop = iBottom - container.clientHeight;
      else if (iTop < cTop) container.scrollTop = iTop;
    }
  }

  return (
    <div className="cmulti" ref={boxRef} style={{ position: 'relative' }}>
      {/* chips summary */}
      <div className="cmulti__chips" onClick={toggle}>
        {sel.length === 0 && <span style={{ color: 'var(--muted)' }}>{placeholder}</span>}
        {sel.map(email => {
          const c = contacts.find(x => x.email === email);
          const initials = c
            ? c.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
            : (email?.slice(0, 2) || '•').toUpperCase();
          return (
            <span key={email} className="cmulti__chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 18, height: 18, borderRadius: '50%',
                background: c?.color || '#888', color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10
              }}>{initials}</span>
              <span style={{ fontSize: 12 }}>{c ? c.name : email}</span>
              <span
                style={{ marginLeft: 4, cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); toggleOne(email); }}
              >✕</span>
            </span>
          );
        })}
        <span className="cmulti__caret" style={{ marginLeft: 'auto', opacity: .6 }}>▾</span>
      </div>

      {/* dropdown */}
      {open && (
        <div
          className="cmulti__dropdown"
          style={{
            position: 'absolute',
            marginTop: 6,
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: 8,
            boxShadow: 'var(--shadow)'
          }}
          onKeyDown={onKeyDown}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ opacity: .6 }}>🔎</span>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people…"
              style={{
                width: '100%', border: '1px solid var(--border)', borderRadius: 8,
                padding: '6px 8px', background: 'var(--chip)'
              }}
            />
          </div>

          <div ref={listRef} style={{ maxHeight: 300, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: 8, color: 'var(--muted)' }}>No matches</div>
            )}
            {filtered.map((c, idx) => {
              const checked = sel.includes(c.email);
              const initials = c.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
              return (
                <div
                  key={c.email}
                  data-index={idx}
                  onClick={() => toggleOne(c.email)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
                    background: idx === active ? 'rgba(66,104,247,0.08)' : 'transparent'
                  }}
                  className="cmulti__option"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => { e.stopPropagation(); toggleOne(c.email); }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: c.color, color: '#fff',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11
                  }}>{initials}</div>
                  <div>
                    <div>{c.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.email}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ======================= Small Field wrapper =======================
function Field({ label, children, style }) {
  return (
    <div style={{ margin: '10px 0', ...style }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

// ======================= Add Task Modal =======================
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
              value={(form.start || '').slice(0,10)}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            />
          </Field>
          <Field label="End Date" style={{ flex: 1 }}>
            <input
              type="date"
              value={(form.end || '').slice(0,10)}
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

// ======================= Delete Confirmation =======================
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

// ======================= App =======================
export default function App() {
  const { toggle } = useTheme();

  const [meta, setMeta] = useState(null);            // { sheetId, columns[], phases[] }
  const [rows, setRows] = useState([]);              // flattened rows (backend provides)
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
    // If backend does not attach depth, we fallback to indent (0/1)
    setRows((t.rows || []).map(r => ({ ...r, depth: (typeof r.depth === 'number' ? r.depth : (r.indent || 0)) })));
    const ppl = await getContacts();
    setContacts(ppl || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // --- Build hierarchy maps from rows ---
// Map by id for quick parent walking
const byId = useMemo(() => {
  const m = new Map();
  for (const r of rows) m.set(String(r.id), r);
  return m;
}, [rows]);

// Children map: parentId -> array of child ids (direct children)
const childrenMap = useMemo(() => {
  const m = new Map();
  for (const r of rows) {
    if (r.parentId == null) continue;
    const pid = String(r.parentId);
    if (!m.has(pid)) m.set(pid, []);
    m.get(pid).push(String(r.id));
  }
  return m;
}, [rows]);

// Ancestors chain for any row (ids only)
const ancestorsMap = useMemo(() => {
  const m = new Map();
  for (const r of rows) {
    const chain = [];
    let cur = r;
    while (cur && cur.parentId != null) {
      chain.push(String(cur.parentId));
      cur = byId.get(String(cur.parentId));
    }
    m.set(String(r.id), chain);
  }
  return m;
}, [rows, byId]);

// Depth (recompute if backend doesn't send it)
const rowsWithDepth = useMemo(() => {
  return rows.map(r => {
    if (typeof r.depth === 'number') return r;
    const d = (ancestorsMap.get(String(r.id)) || []).length;
    return { ...r, depth: d, indent: d };
  });
}, [rows, ancestorsMap]);

  // Expanded set: which nodes are expanded. Start expanded for roots + all by default.

// On first load, expand all nodes that have children
const [expanded, setExpanded] = useState(() => new Set());
useEffect(() => {
  const s = new Set();
  for (const r of rowsWithDepth) {
    const hasKids = (childrenMap.get(String(r.id)) || []).length > 0;
    if (hasKids) s.add(String(r.id));
  }
  setExpanded(s);
}, [rowsWithDepth, childrenMap]);

function toggleExpand(rowId) {
  setExpanded(prev => {
    const s = new Set(prev);
    if (s.has(String(rowId))) s.delete(String(rowId));
    else s.add(String(rowId));
    return s;
  });
}

// A row is visible only if ALL its ancestors are expanded (roots always visible)
function isVisible(rowId) {
  const chain = ancestorsMap.get(String(rowId)) || [];
  for (const ancId of chain) {
    if (!expanded.has(String(ancId))) return false;
  }
  return true;
}

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
      start: (cellValue(row, 'Start Date') || '').slice(0,10),
      end:   (cellValue(row, 'End Date')   || '').slice(0,10),
      percent: Number(cellValue(row, '% Complete') || 0)
    });
  }

  // Children count: direct children length from childrenMap
const childrenCount = useMemo(() => {
  const m = new Map();
  for (const r of rowsWithDepth) {
    const id = String(r.id);
    m.set(id, (childrenMap.get(id) || []).length);
  }
  return m;
}, [rowsWithDepth, childrenMap]);

  // search filter -> then visibility filter (respect expand/collapse)
const displayRows = useMemo(() => {
  let base = rowsWithDepth;
  if (q.trim()) {
    const term = q.trim().toLowerCase();
    const contains = (x) => String(x || '').toLowerCase().includes(term);
    base = rowsWithDepth.filter(r => {
      const name = cellValue(r, 'Primary');
      const status = cellValue(r, 'Status');
      const health = cellValue(r, 'Health');
      const preds = cellValue(r, 'Predecessors');
      const assigned = cellValue(r, 'Assigned To');
      const assignedStr = Array.isArray(assigned) ? assigned.join(',') : assigned;
      return contains(name) || contains(status) || contains(health) || contains(preds) || contains(assignedStr);
    });

    // when searching, also force visibility of matched rows + their ancestors
    const keepIds = new Set(base.map(r => String(r.id)));
    // add ancestors of matched to keep set
    for (const r of base) {
      const chain = ancestorsMap.get(String(r.id)) || [];
      for (const aid of chain) keepIds.add(aid);
    }
    base = rowsWithDepth.filter(r => keepIds.has(String(r.id)));
  }

  // If not searching, filter by expanded visibility
  if (!q.trim()) {
    base = base.filter(r => isVisible(String(r.id)));
  }
  return base;
}, [rowsWithDepth, q, ancestorsMap, isVisible]);

  // ======================= CRUD =======================
  async function onCreate(form) {
    await createTask({
      parentId: String(form.phaseRowId),
      cells: {
        'Primary': form.taskName || form.primary || 'New Task',
        'Assigned To': form.assignedTo || [],
        'Start Date': form.start || '',
        'End Date': form.end || '',
        '% Complete': Number(form.percent || 0)
      }
    });
    setShowAdd(false);
    await load();
  }

  // optimistic quick update
  async function onQuickUpdate(rowId, title, value) {
    // snapshot for revert
    const snapshot = rows;
  
    // 1) Optimistic UI
    setRows(prev => prev.map(r => {
      if (String(r.id) !== String(rowId)) return r;
      const next = { ...r, cells: { ...r.cells } };
      const v = (title === 'Assigned To')
        ? (Array.isArray(value) ? value : (value ? [value] : []))
        : value;
      next.cells[title] = {
        ...(r.cells[title] || { editable: true }),
        value: v,
        raw: v
      };
      return next;
    }));
  
    // 2) Persist; on error -> revert, show alert
    try {
      await updateTask(String(rowId), { [title]: value });
      const t = await getTasks();
      setRows((t.rows || []).map(r => ({ ...r, depth: (typeof r.depth === 'number' ? r.depth : (r.indent || 0)) })));
    } catch (e) {
      console.error('Update failed:', e);
      alert(
        typeof e?.message === 'string'
          ? `Update failed: ${e.message}`
          : 'Update failed: This column might be read-only (formula/locked).'
      );
      setRows(snapshot); // revert immediately
    }
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
          {(meta?.sheetId ? `Sheet: ${meta.sheetId}` : 'Project Plan')}
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
                className={`row-depth-${Math.min(row.depth ?? row.indent ?? 0, 4)}`}
                onClick={() => setSelected(String(row.id))}
                style={{ cursor: 'pointer' }}
              >
                {/* hierarchy indicator */}
                <td className="cell-indent">{row.indent ? '↳' : ''}</td>

                {columns.map((col) => {
                  const cell = (row.cells?.[col.title]) || { value: '', editable: false };

                  // Health → circular dot + label (read-only)
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

                  // Status → colored chip (read-only)
                  if (col.title === 'Status') {
                    const v = cell.value || 'In Queue';
                    return (
                      <td key={String(col.id)}>
                        <span className={`status-chip ${statusClass(v)}`}>{v}</span>
                      </td>
                    );
                  }

                  // Children (compute for phases)
                  if (col.title === 'Children') {
                    const c = childrenCount.get(String(row.id)) || 0;
                    return <td key={String(col.id)} className="cell-muted">{c}</td>;
                  }

                  // Working Days Remaining → compute if empty
                  if (col.title === 'Working Days Remaining') {
                    const raw = cell.value;
                    const fallback = bizDaysFromToday(cellVal(row, 'End Date'));
                    const shown = (raw !== '' && raw !== null && raw !== undefined) ? raw : (fallback || '—');
                    return <td key={String(col.id)} className={!shown || shown === '—' ? 'cell-muted' : ''}>{shown}</td>;
                  }

                  // Modified / Modified By (system read-only)
                  if (col.title === 'Modified' || col.title === 'Modified By') {
                    const v = cell.value || '—';
                    return <td key={String(col.id)} className={!cell.value ? 'cell-muted' : ''}>{v}</td>;
                  }

                  // CHECKBOX (MR/ATT read-only; others only if canEdit)
                  if (col.type === 'CHECKBOX') {
                    const checked = !!cell.value;
                    const lockedByName = (col.title === 'MR' || col.title === 'ATT');
                    const editable = canEdit(col, cell) && !lockedByName;
                    return (
                      <td key={String(col.id)}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!editable}
                          onChange={(e) => {
                            if (!editable) return;
                            onQuickUpdate(row.id, col.title, e.target.checked);
                          }}
                        />
                      </td>
                    );
                  }

                  // PICKLIST (read-only for formula picklists like Status handled above)
                  if (col.type === 'PICKLIST' && Array.isArray(col.options)) {
                    const editable = canEdit(col, cell);
                    if (!editable) {
                      const v = cell.value || '—';
                      return (
                        <td key={String(col.id)}>
                          <span className="cell-muted">{v}</span>
                        </td>
                      );
                    }
                    // For future editable picklists (not Status/Health)
                    const v = String(cell.value ?? '');
                    return (
                      <td key={String(col.id)}>
                        <select value={v} onChange={e => onQuickUpdate(row.id, col.title, e.target.value)}>
                          <option value="">Select…</option>
                          {col.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </td>
                    );
                  }

                  // % Complete (0..100)
                  if (!row.isPhase && col.title === '% Complete') {
                    const val = Number(cell.value || 0);
                    const editable = canEdit(col, cell);
                    return (
                      <td key={String(col.id)}>
                        {editable
                          ? <input
                              type="number"
                              min={0}
                              max={100}
                              value={val}
                              onChange={(e) => onQuickUpdate(row.id, '% Complete', Number(e.target.value))}
                            />
                          : <span className="cell-muted">{val}</span>
                        }
                      </td>
                    );
                  }

                  // Dates (Start Date / End Date)
                  if (!row.isPhase && (col.title === 'Start Date' || col.title === 'End Date')) {
                    const iso = String(cell.value || '');
                    const editable = canEdit(col, cell);
                    return (
                      <td key={String(col.id)}>
                        {editable
                          ? <input
                              type="date"
                              value={iso ? iso.slice(0,10) : ''}
                              onChange={(e) => onQuickUpdate(row.id, col.title, e.target.value)}
                            />
                          : <span className={!cell.value ? 'cell-muted' : ''}>{iso ? iso.slice(0,10) : '—'}</span>
                        }
                      </td>
                    );
                  }

                  // Assigned To
                  if (col.title === 'Assigned To') {
                    const raw = cell.value;

                    const toEmails = (val) => {
                      if (!val) return [];
                      if (Array.isArray(val)) {
                        return val.map(v => {
                          const c = contacts.find(x => x.email === v || x.name === v);
                          return c?.email || v;
                        });
                      }
                      return String(val)
                        .split(',')
                        .map(s => s.trim())
                        .filter(Boolean)
                        .map(v => {
                          const c = contacts.find(x => x.email === v || x.name === v);
                          return c?.email || v;
                        });
                    };

                    const selectedEmails = toEmails(raw);
                    const editable = canEdit(col, cell);

                    return (
                      <td key={String(col.id)} style={{ minWidth: 260 }}>
                        {editable
                          ? <ContactMultiSelect
                              contacts={contacts}
                              value={selectedEmails}
                              onChange={(updated) => onQuickUpdate(row.id, 'Assigned To', updated)}
                            />
                          : <span className={!selectedEmails.length ? 'cell-muted' : ''}>
                              {selectedEmails.join(', ') || '—'}
                            </span>
                        }
                      </td>
                    );
                  }

// Primary (task name) with indent and caret for expand/collapse
if (col.title === 'Primary') {
  const val = String(cell.value ?? '');
  const idStr = String(row.id);
  const hasKids = (childrenMap.get(idStr) || []).length > 0;
  const isOpen = expanded.has(idStr);

  return (
    <td key={String(col.id)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* indent spacer (16px per level) */}
        <div style={{ width: (row.depth || 0) * 16 }} />
        {hasKids ? (
          <button
            className="btn"
            style={{ padding: '2px 6px', fontWeight: 700 }}
            onClick={(e) => { e.stopPropagation(); toggleExpand(row.id); }}
            title={isOpen ? 'Collapse' : 'Expand'}
          >
            {isOpen ? '−' : '+'}
          </button>
        ) : (
          <span style={{ width: 18, display: 'inline-block' }} />
        )}

        {/* Allow editing here; if backend rejects, onQuickUpdate will revert */}
        <input value={val} onChange={(e) => onQuickUpdate(row.id, 'Primary', e.target.value)} />
      </div>
    </td>
  );
}

// if (col.title === 'Milestone') {
//   let v = cell.value;
//   if (!v) {
//     // fallback: nearest ancestor's Primary
//     const chain = ancestorsMap.get(String(row.id)) || [];
//     if (chain.length > 0) {
//       const parentRow = byId.get(chain[0]); // immediate parent
//       v = cellVal(parentRow, 'Primary') || v;
//     }
//     if (!v && row.parentId == null) v = '—';
//   }
//   const editable = canEdit(col, cell); // if you now want Milestone editable in UI
//   if (!editable) {
//     return <td key={String(col.id)}><span>{v || '—'}</span></td>;
//   }
//   // editable: allow text edit (or select if you later provide options)
//   return (
//     <td key={String(col.id)}>
//       <input value={v || ''} onChange={(e)=>onQuickUpdate(row.id, 'Milestone', e.target.value)} />
//     </td>
//     )
//   }
                  // Default (respect editable)
                  const editable = canEdit(col, cell);
                  return (
                    <td key={String(col.id)}>
                      {editable
                        ? <input
                            value={String(cell.value ?? '')}
                            onChange={(e) => onQuickUpdate(row.id, col.title, e.target.value)}
                          />
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
                value={(editForm.start || '').slice(0,10)}
                onChange={(e) => setEditForm({ ...editForm, start: e.target.value })}
              />
            </Field>
            <Field label="End Date" style={{ flex: 1 }}>
              <input
                type="date"
                value={(editForm.end || '').slice(0,10)}
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