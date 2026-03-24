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
function AddModal({ nodes = [], contacts, onClose, onCreate }) {
  const [form, setForm] = useState({
    taskName: "",
    parentRowId: "",
    assignedTo: [],
    start: "",
    end: "",
    percent: ""
  });

  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});

  // ✅ Task name: letters, spaces, punctuation allowed — NO NUMBERS
  const nameRegex = /^[A-Za-z][A-Za-z\s\-\&\(\)\.'\/,]*$/;

  const isISODate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

  // ✅ Master Validator
  const validate = (draft = form) => {
    const e = {};

    // Primary
    if (!draft.taskName.trim()) e.taskName = "Task name is required.";
    else if (!nameRegex.test(draft.taskName.trim()))
      e.taskName = "Only letters/spaces allowed (no numbers).";

    // Parent
    if (!draft.parentRowId) e.parentRowId = "Select a parent row.";

    // Assigned To
    if (!draft.assignedTo.length)
      e.assignedTo = "Select at least one assignee.";

    // Dates
    if (!isISODate(draft.start))
      e.start = "Start date required (YYYY-MM-DD).";

    if (!isISODate(draft.end))
      e.end = "End date required (YYYY-MM-DD).";

    if (isISODate(draft.start) && isISODate(draft.end)) {
      if (draft.end < draft.start)
        e.end = "End date cannot be earlier than Start date.";
    }

    // % Complete
    const pct = String(draft.percent).trim();
    if (pct === "") e.percent = "% Complete is required.";
    else {
      const n = Number(pct);
      if (!Number.isFinite(n) || n < 0 || n > 100)
        e.percent = "Enter a number from 0 to 100.";
    }

    return e;
  };

  // Revalidate on change
  useEffect(() => {
    setErrors(validate(form));
  }, [form]);

  const invalid = Object.keys(errors).length > 0;

  const update = (patch) => setForm((p) => ({ ...p, ...patch }));
  const markTouched = (key) =>
    setTouched((t) => ({ ...t, [key]: true }));

  // ✅ Parent dropdown options (with hierarchy indentation)
  const ParentOption = ({ opt }) => (
    <option value={opt.id}>
      {`${"  ".repeat(opt.depth)}${opt.depth ? "↳ " : ""}${opt.label}`}
    </option>
  );

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999
      }}
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxWidth: "92vw",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 16,
          boxShadow: "var(--shadow)"
        }}
      >
        <h3 style={{ marginTop: 0 }}>Add New Task</h3>

        {/* ================================================================= */}
        {/*                          PRIMARY                                 */}
        {/* ================================================================= */}
        <Field label="Primary">
          <input
            value={form.taskName}
            onChange={(e) => update({ taskName: e.target.value })}
            onBlur={() => markTouched("taskName")}
            placeholder="e.g., Implementation task 4"
          />
          {touched.taskName && errors.taskName && (
            <div className="error-text">{errors.taskName}</div>
          )}
        </Field>

        {/* ================================================================= */}
        {/*                          PARENT ROW                              */}
        {/* ================================================================= */}
        <Field label="Parent">
          <select
            value={form.parentRowId}
            onChange={(e) => update({ parentRowId: e.target.value })}
            onBlur={() => markTouched("parentRowId")}
          >
            <option value="">Select parent…</option>
            {nodes.map((opt) => (
              <ParentOption key={opt.id} opt={opt} />
            ))}
          </select>
          {touched.parentRowId && errors.parentRowId && (
            <div className="error-text">{errors.parentRowId}</div>
          )}
        </Field>

        {/* ================================================================= */}
        {/*                        ASSIGNED TO                               */}
        {/* ================================================================= */}
        <Field label="Assigned To">
          <ContactMultiSelect
            contacts={contacts}
            value={form.assignedTo}
            onChange={(updated) => update({ assignedTo: updated })}
          />
          {touched.assignedTo && errors.assignedTo && (
            <div className="error-text">{errors.assignedTo}</div>
          )}
        </Field>

        {/* ================================================================= */}
        {/*                            DATES                                  */}
        {/* ================================================================= */}
        <div style={{ display: "flex", gap: 10 }}>
          <Field label="Start Date" style={{ flex: 1 }}>
            <input
              type="date"
              value={form.start}
              onChange={(e) =>
                update({ start: e.target.value.slice(0, 10) })
              }
              onBlur={() => markTouched("start")}
            />
            {touched.start && errors.start && (
              <div className="error-text">{errors.start}</div>
            )}
          </Field>

          <Field label="End Date" style={{ flex: 1 }}>
            <input
              type="date"
              value={form.end}
              onChange={(e) =>
                update({ end: e.target.value.slice(0, 10) })
              }
              onBlur={() => markTouched("end")}
            />
            {touched.end && errors.end && (
              <div className="error-text">{errors.end}</div>
            )}
          </Field>
        </div>

        {/* ================================================================= */}
        {/*                        % COMPLETE                                 */}
        {/* ================================================================= */}
        <Field label="% Complete">
          <input
            type="number"
            min={0}
            max={100}
            value={form.percent}
            onChange={(e) => update({ percent: e.target.value })}
            onBlur={() => markTouched("percent")}
            placeholder="0 - 100"
          />
          {touched.percent && errors.percent && (
            <div className="error-text">{errors.percent}</div>
          )}
        </Field>

        {/* ================================================================= */}
        {/*                       FOOTER BUTTONS                              */}
        {/* ================================================================= */}
        <div
          style={{
            marginTop: 12,
            display: "flex",
            gap: 10,
            justifyContent: "flex-end"
          }}
        >
          <button className="btn" onClick={onClose}>
            Cancel
          </button>

          <button
            className="btn btn-primary"
            disabled={invalid}
            onClick={() => {
              const e = validate();
              setErrors(e);
              setTouched({
                taskName: true,
                parentRowId: true,
                assignedTo: true,
                start: true,
                end: true,
                percent: true
              });
              if (Object.keys(e).length > 0) return;

              onCreate(form); // ✅ parent auto-expansion happens in onCreate()
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

// --- Contact maps & helpers (normalize names -> emails) ---
const normalizeKey = (s) => String(s || '').replace(/["']/g, '').trim().toLowerCase();

function useContactMaps(contacts) {
  return React.useMemo(() => {
    const byEmail = new Map();
    const byName  = new Map(); // key: normalized name (e.g., "allen mitchell, sales")
    for (const c of contacts || []) {
      byEmail.set((c.email || '').toLowerCase(), c);
      byName.set(normalizeKey(c.name), c);
    }
    return { byEmail, byName };
  }, [contacts]);
}

/**
 * normalizeToEmails:
 *   - If val is already array of emails -> return as-is
 *   - If val is array of names -> map to emails using contacts
 *   - If val is a single string:
 *       - try exact name match (no split)
 *       - if contains ';' (multi), split by ';'
 *       - otherwise, if it contains ',' but full string matches a contact name -> it's one person (do not split)
 */
function normalizeToEmails(val, contactsBy) {
  const { byEmail, byName } = contactsBy;
  if (!val) return [];

  const mapOne = (v) => {
    const t = String(v || '').trim();
    if (!t) return null;
    if (t.includes('@')) return t; // email already
    const byNameHit = byName.get(normalizeKey(t));
    return byNameHit?.email || null;
  };

  if (Array.isArray(val)) {
    const emails = [];
    for (const v of val) {
      if (!v) continue;
      if (String(v).includes('@')) { emails.push(String(v)); continue; }
      const hit = mapOne(v);
      if (hit) emails.push(hit);
    }
    return emails;
  }

  // Single string
  const raw = String(val).trim();
  if (!raw) return [];

  // 1) exact display name match (common case like "Allen Mitchell, Sales")
  const hit = byName.get(normalizeKey(raw));
  if (hit?.email) return [hit.email];

  // 2) if multiple people are separated by ';'
  if (raw.includes(';')) {
    const parts = raw.split(';').map(s => s.trim()).filter(Boolean);
    const emails = [];
    for (const p of parts) {
      const h = mapOne(p);
      if (h) emails.push(h);
    }
    return emails;
  }

  // 3) fallback: if it looks like an email, accept; else treat as display name once (no comma split)
  if (raw.includes('@')) return [raw];
  const h = mapOne(raw);
  return h ? [h] : [];
}

// Static, colored chips for read-only mode
function AssigneeChips({ emails, contacts, mutedWhenEmpty=false }) {
  if (!emails || emails.length === 0) {
    return <span className={mutedWhenEmpty ? 'cell-muted' : ''}>—</span>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {emails.map(email => {
        const c = (contacts || []).find(x => x.email === email);
        const initials = c
          ? c.name.split(' ').map(p => p[0]).join('').slice(0,2).toUpperCase()
          : (email.slice(0,2).toUpperCase());
        const bg = c?.color || '#4268f7';
        return (
          <span key={email} className="assignee-chip" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 8px', borderRadius: 999, border: '1px solid var(--border)',
            background: 'var(--panel)'
          }}>
            <span style={{
              width: 18, height: 18, borderRadius: '50%', background: bg, color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10
            }}>{initials}</span>
            <span style={{ fontSize: 12 }}>{c ? c.name : email}</span>
          </span>
        );
      })}
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

  const DEPENDENCY_READONLY = new Set([
    'End Date',       // cannot update
    'Duration',       // cannot update
    'Predecessors'    // cannot update
  ]);
// contact lookup maps
const contactsBy = useContactMaps(contacts);

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

// --- Parent options for the "Add Task" modal: ANY node in the hierarchy ---
const parentOptions = useMemo(() => {
  // Sort by "visual order" (as already rendered in displayRows when not searching)
  // but without search visibility filter. We’ll just use rowsWithDepth.
  return rowsWithDepth.map(r => {
    const label = cellVal(r, 'Primary') || '(unnamed)';
    return {
      id: String(r.id),
      depth: r.depth || 0,
      label
    };
  });
}, [rowsWithDepth]);

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
    // Helper functions
    const normalizeKey = (s) =>
      String(s || "").replace(/["']/g, "").trim().toLowerCase();
  
    const byName = new Map(
      (contacts || []).map((c) => [normalizeKey(c.name), c])
    );
  
    // Normalize Assigned To (convert names -> emails[])
    const normalizeAssignedTo = (raw) => {
      if (!raw) return [];
  
      // Case 1: array
      if (Array.isArray(raw)) {
        return raw
          .map((v) => {
            const t = String(v || "").trim();
  
            if (t.includes("@")) return t; // already email
  
            const hit = byName.get(normalizeKey(t));
            return hit?.email || null;
          })
          .filter(Boolean);
      }
  
      // Case 2: single email
      if (String(raw).includes("@")) return [raw];
  
      // Case 3: single display name like "Diana Foster, Project Manager"
      const hit = byName.get(normalizeKey(raw));
      return hit?.email ? [hit.email] : [];
    };
  
    setEditForm({
      primary: cellValue(row, "Primary") || "",
      status: cellValue(row, "Status") || "",
      assignedTo: normalizeAssignedTo(cellValue(row, "Assigned To")),
      start: (cellValue(row, "Start Date") || "").slice(0, 10),
      end: (cellValue(row, "End Date") || "").slice(0, 10),
      percent: Number(cellValue(row, "% Complete") || 0)
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
    // parent toggle: ensure the branch is visible immediately
    const parentChain = (ancestorsMap.get(String(form.parentRowId)) || []).concat(String(form.parentRowId));
    setExpanded(prev => {
      const s = new Set(prev);
      for (const id of parentChain) s.add(String(id));
      return s;
    });
  
    await createTask({
      parentId: String(form.parentRowId),
      cells: {
        'Primary': form.taskName.trim(),
        'Assigned To': form.assignedTo || [],
        'Start Date': form.start || '',
        'End Date': form.end || '',
        '% Complete': Number(form.percent)
      }
    });
  
    setShowAdd(false);
    await load();
  }
  // optimistic quick update
  async function onQuickUpdate(rowId, title, value) {
    // snapshot for revert
    const snapshot = rows;

    
 // ❗ Skip updates for dependency columns
 if (['End Date', 'Duration', 'Predecessors'].includes(title)) {
   console.warn("Skipping update to dependency column:", title);
   return;
 }

  
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
      
await updateTask(String(rowId), { 
        ...(title === 'Assigned To'
           ? { 'Assigned To': normalizeEmails(value) }
           : { [title]: value })
      });
  
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
  
    // ✅ normalize Assigned To to emails
    const normalizeKey = (s) =>
      String(s || "").replace(/["']/g, "").trim().toLowerCase();
  
    const byName = new Map(
      (contacts || []).map((c) => [normalizeKey(c.name), c])
    );
  
    const normalizeEmails = (arr) => {
      if (!arr) return [];
      return arr
        .map((v) => {
          const t = String(v || "").trim();
          if (t.includes("@")) return t;
          const hit = byName.get(normalizeKey(t));
          return hit?.email || null;
        })
        .filter(Boolean);
    };
  
    const assignedEmails = normalizeEmails(editForm.assignedTo);
  
    // ✅ SAFE PAYLOAD — NEVER SEND END DATE (dependency rule)
    const payload = {
      "Primary": editForm.primary,
      "Assigned To": assignedEmails,
      "Start Date": editForm.start || "",
      "% Complete": Number(editForm.percent || 0),
    };
  
    // ✅ END DATE REMOVED 100% (DO NOT SEND)
    // payload["End Date"] = undefined   // DO NOT ADD THIS
  
    await updateTask(String(editRow.id), payload);
  
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
  {displayRows.map((row) => {
    const isEditing = !!(editRow && String(editRow.id) === String(row.id));

    // local helpers to avoid NaN/stray text
    const showText = (v, dash = '—') => {
      if (v === null || v === undefined) return dash;
      const s = String(v);
      return s.trim() === '' ? dash : s;
    };
    const coercePercent = (val) => {
      if (val === null || val === undefined) return '';
      if (typeof val === 'number') return val <= 1 ? Math.round(val * 100) : Math.round(val);
      const s = String(val).trim();
      if (!s) return '';
      if (s.endsWith('%')) {
        const n = parseFloat(s.slice(0, -1));
        return Number.isFinite(n) ? Math.round(n) : '';
      }
      const n = parseFloat(s);
      if (!Number.isFinite(n)) return '';
      return n <= 1 ? Math.round(n * 100) : Math.round(n);
    };

    return (
      <tr
        key={String(row.id)}
        className={`row-depth-${Math.min(row.depth ?? row.indent ?? 0, 4)}`}
        onClick={() => setSelected(String(row.id))}
        style={{ cursor: 'pointer' }}
      >
        {/* hierarchy indicator column (kept minimal; caret lives in Primary) */}
        <td className="cell-indent">{row.depth ? '↳' : ''}</td>

        {columns.map((col) => {
          // ✅ Center certain columns (Health, Children, % Complete, etc.)
          const CENTER_TITLES = new Set([
            "Health",
            "Status",
            "Children",
            "Ancestors",
            "% Complete",
            "Working Days Remaining",
            "MR",
            "ATT",
          ]);

          const isCenter = CENTER_TITLES.has(col.title);
          const tdClass = isCenter ? "td-center" : "";
          const cell = (row.cells?.[col.title]) || { value: '', editable: false };

          // ---- Assignees helpers (emails[] <-> chips) ----
          const renderAssigneeChips = (emails) => {
            const list = Array.isArray(emails) ? emails : [];
            if (!list.length) return <span className="cell-muted">—</span>;
            return (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {list.map(email => {
                  const c = (contacts || []).find(x => x.email === email);
                  const initials = c
                    ? c.name.split(' ').map(p => p[0]).join('').slice(0,2).toUpperCase()
                    : (email.slice(0,2).toUpperCase());
                  const bg = c?.color || '#4268f7';
                  return (
                    <span key={email} className="assignee-chip" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 8px', borderRadius: 999, border: '1px solid var(--border)',
                      background: 'var(--panel)'
                    }}>
                      <span style={{
                        width: 18, height: 18, borderRadius: '50%', background: bg, color: '#fff',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10
                      }}>{initials}</span>
                      <span style={{ fontSize: 12 }}>{c ? c.name : email}</span>
                    </span>
                  );
                })}
              </div>
            );
          };
          const toEmails = (val) => {
            const normKey = (s) => String(s || '').replace(/["']/g, '').trim().toLowerCase();
            const byName = new Map((contacts || []).map(c => [normKey(c.name), c]));
            const mapOne = (v) => {
              const t = String(v || '').trim();
              if (!t) return null;
              if (t.includes('@')) return t;
              const hit = byName.get(normKey(t));
              return hit?.email || null;
            };
            if (!val) return [];
            if (Array.isArray(val)) {
              const out = [];
              for (const v of val) {
                if (!v) continue;
                if (String(v).includes('@')) out.push(String(v));
                else { const h = mapOne(v); if (h) out.push(h); }
              }
              return out;
            }
            const raw = String(val).trim();
            if (!raw) return [];
            // exact name (e.g., "Allen Mitchell, Sales")
            const hit = byName.get(normKey(raw));
            if (hit?.email) return [hit.email];
            // multiple separated by ';'
            if (raw.includes(';')) {
              const out = [];
              for (const part of raw.split(';').map(s => s.trim()).filter(Boolean)) {
                const h = mapOne(part);
                if (h) out.push(h);
              }
              return out;
            }
            if (raw.includes('@')) return [raw];
            const h = mapOne(raw);
            return h ? [h] : [];
          };
          // ------------------------------------------------

          // Milestone: fallback to immediate parent's Primary if empty
          if (col.title === 'Milestone') {
            let v = cell.value;
            if (!v) {
              const pid = row.parentId != null ? String(row.parentId) : null;
              if (pid) {
                const parent = displayRows.find(r => String(r.id) === pid);
                v = parent ? cellVal(parent, 'Primary') : v;
              }
              if (!v && row.parentId == null) v = '—';
            }
            return <td key={String(col.id)}><span>{showText(v)}</span></td>;
          }

          // Health (read-only chip unless editing)
          if (col.title === 'Health') {
            const h = String(cell.value || '');
            return (
              <td key={String(col.id)}>
                {!isEditing
                  ? <span className="health">
                      <span className={`health-dot ${healthClass(h)}`}></span>
                      {/* <span>{showText(h)}</span> */}
                    </span>
                  : <input value={h} onChange={(e)=>onQuickUpdate(row.id, 'Health', e.target.value)} />
                }
              </td>
            );
          }

          // Status (read-only chip unless editing)
          if (col.title === 'Status') {
            const v = String(cell.value || '');
            return (
              <td key={String(col.id)}>
                {!isEditing
                  ? <span className={`status-chip ${statusClass(v)}`}>{showText(v)}</span>
                  : <input value={v} onChange={(e)=>onQuickUpdate(row.id, 'Status', e.target.value)} />
                }
              </td>
            );
          }

          // Children (direct children count)
          if (col.title === 'Children') {
            const c = childrenCount.get(String(row.id)) || 0;
            return <td key={String(col.id)} className="cell-muted">{String(c)}</td>;
          }

          // Working Days Remaining → compute fallback if empty
          if (col.title === 'Working Days Remaining') {
            const raw = cell.value;
            const fallback = bizDaysFromToday(cellVal(row, 'End Date'));
            const shown = (raw !== '' && raw !== null && raw !== undefined) ? raw : (fallback || '—');
            return <td key={String(col.id)} className={!shown || shown === '—' ? 'cell-muted' : ''}>{showText(shown)}</td>;
          }

          // Modified / Modified By (system)
          if (col.title === 'Modified' || col.title === 'Modified By') {
            return <td key={String(col.id)} className={!cell.value ? 'cell-muted' : ''}>{showText(cell.value)}</td>;
          }

          // CHECKBOX columns: editable only in edit mode
         {/* ✅ CHECKBOX columns: render true read‑only visuals in view mode.
    MR/ATT are always read‑only (even in edit mode).
    Other checkbox columns become interactive ONLY when isEditing is true. */}
if (col.type === 'CHECKBOX') {
  const checked = !!cell.value;
  const isMRorATT = (col.title === 'MR' || col.title === 'ATT');

  // 🔸 View mode (not editing this row): always show visual checkbox (no disabled inputs)
  if (!isEditing) {
    return (
      <td key={String(col.id)}>
        <span
          className={`ro-checkbox ${checked ? 'checked' : ''}`}
          role="img"
          aria-label={checked ? 'Checked' : 'Unchecked'}
          title={checked ? 'Yes' : 'No'}
        />
      </td>
    );
  }

  // 🔸 Edit mode:
  //   - MR/ATT still read-only visual
  //   - other checkbox columns become real inputs (editable)
  if (isMRorATT) {
    return (
      <td key={String(col.id)}>
        <span
          className={`ro-checkbox ${checked ? 'checked' : ''}`}
          role="img"
          aria-label={checked ? 'Checked' : 'Unchecked'}
          title="read‑only"
        />
      </td>
    );
  }

  // Editable checkbox (only when editing the row and not MR/ATT)
  return (
    <td key={String(col.id)}>
      <label className="edit-checkbox-wrapper">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onQuickUpdate(row.id, col.title, e.target.checked)}
        />
        <span className="edit-checkbox-faux" />
      </label>
    </td>
  );
}

          // % Complete (avoid NaN; show 0..100)
          if (col.title === '% Complete') {
            const pct = coercePercent(cell.value);
            const shown = pct === '' ? '—' : String(pct);
            return (
              <td key={String(col.id)}>
                {isEditing
                  ? <input
                      type="number"
                      min={0}
                      max={100}
                      value={pct === '' ? 0 : pct}
                      onChange={(e) => {
                        const v = e.target.value === '' ? '' : Number(e.target.value);
                        onQuickUpdate(row.id, '% Complete', v);
                      }}
                    />
                  : <span>{shown}</span>
                }
              </td>
            );
          }

          //
// START DATE — Editable
//
if (col.title === 'Start Date') {
  const iso = String(cell.value || '');
  const shown = iso ? iso.slice(0,10) : '';

  return (
    <td key={String(col.id)} className={tdClass}>
      {isEditing
        ? <input
            type="date"
            value={shown}
            onChange={(e) => onQuickUpdate(row.id, 'Start Date', e.target.value)}
          />
        : <span className={!shown ? 'cell-muted' : ''}>{shown || '—'}</span>
      }
    </td>
  );
}

//
// END DATE — Read-only (Dependency Controlled)
//
if (col.title === 'End Date') {
  const iso = String(cell.value || '');
  const shown = iso ? iso.slice(0,10) : '';

  return (
    <td key={String(col.id)} className={tdClass}>
      <span className={!shown ? 'cell-muted' : ''}>{shown || '—'}</span>
    </td>
  );
}

          // Assigned To (chips in read mode; picker in edit mode)
          if (col.title === 'Assigned To') {
            const emails = toEmails(cell.value);
            return (
              <td key={String(col.id)} style={{ minWidth: 280 }}>
                {isEditing ? (
                  <ContactMultiSelect
                    contacts={contacts}
                    value={emails}
                    onChange={(updated) => onQuickUpdate(row.id, 'Assigned To', updated)}
                  />
                ) : (
                  renderAssigneeChips(emails)
                )}
              </td>
            );
          }

          // Primary with indent + caret; edit only in edit mode
          if (col.title === 'Primary') {
            const val = String(cell.value ?? '');
            const idStr = String(row.id);
            const hasKids = (childrenMap.get(idStr) || []).length > 0;
            const isOpen = expanded.has(idStr);

            return (
              <td key={String(col.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                  {isEditing
                    ? <input value={val} onChange={(e) => onQuickUpdate(row.id, 'Primary', e.target.value)} />
                    : <strong>{showText(val)}</strong>
                  }
                </div>
              </td>
            );
          }

          // Default column: read-only text; editable only when isEditing
          const val = String(cell.value ?? '');
          return (
            <td key={String(col.id)}>
              {isEditing
                ? <input value={val} onChange={(e) => onQuickUpdate(row.id, col.title, e.target.value)} />
                : <span className={!val ? 'cell-muted' : ''}>{showText(val)}</span>
              }
            </td>
          );
        })}

        {/* Actions */}
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
    );
  })}
</tbody>
        </table>
      </div>

      {/* Add Task Modal */}
      {showAdd && (
        <AddModal
          nodes={parentOptions}
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
                disabled
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