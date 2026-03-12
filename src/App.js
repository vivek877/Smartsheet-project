import React, { useEffect, useRef, useState } from 'react';

// 👉 UI preview NOW (no backend): keep this line
import {
  getMeta,
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  getContacts,
} from './api.mock';
import ContactMultiSelect from './components/ContactMultiSelect';
// 🔁 When your backend is ready, switch to the real API by replacing the line above with:
// import { getMeta, getTasks, createTask, updateTask, deleteTask } from './api.real';

/* -----------------------------
   Theme hook (light / dark)
-------------------------------- */
function useTheme() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem('theme') || 'light'
  );
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.dataset.theme = resolved; // <html data-theme="light|dark">
  }, [theme, resolved]);

  return {
    theme,
    setTheme,
    resolved,
    toggle: () => setTheme(resolved === 'dark' ? 'light' : 'dark'),
  };
}

/* -----------------------------
   Small labeled field wrapper
-------------------------------- */
function Field({ label, children }) {
  return (
    <div style={{ margin: '10px 0' }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

/* -----------------------------
   Add Task Modal (creates child under phase)
-------------------------------- */
function AddModal({ phases, contacts, onClose, onCreate }) {
  const [form, setForm] = useState({
    taskName: '',
    phaseRowId: '',
    status: 'Not Started',
    assignedTo: [],
    start: '',
    end: '',
    percent: 0,
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Add New Task</h3>

        <Field label="Task Name">
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
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Status">
          <input
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          />
        </Field>

        <Field label="Assigned To">
          <input
            value={form.assignedTo}
            onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
          />
        </Field>

        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Start">
            <input
              type="date"
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            />
          </Field>
          <Field label="End">
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
            onChange={(e) =>
              setForm({ ...form, percent: Number(e.target.value) })
            }
          />
        </Field>

        <div
          style={{
            marginTop: 12,
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
          }}
        >
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (!form.phaseRowId) {
                alert('Select Phase');
                return;
              }
              if (!form.taskName.trim()) {
                alert('Task Name required');
                return;
              }
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

/* -----------------------------
   Main App
-------------------------------- */
export default function App() {
  const { toggle } = useTheme();

  const [meta, setMeta] = useState(null); // { sheetId, columns[], phases[] }
  const [rows, setRows] = useState([]); // flattened rows (phase/task)
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false); // Add Task modal
  const [editRow, setEditRow] = useState(null); // Edit drawer target row
  const [editForm, setEditForm] = useState({}); // Edit drawer state
  const [selected, setSelected] = useState(null); // selected rowId (for shortcuts)
  const [contacts, setContacts] = useState([]); // [{id, name, email, color}]

  const searchRef = useRef(null);

  // --------------------------
  // Keyboard Shortcuts
  // --------------------------
  useEffect(() => {
    const handler = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      const inField = tag === 'INPUT' || tag === 'TEXTAREA';

      // Always allow "/" to focus search
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (searchRef.current) searchRef.current.focus();
        return;
      }

      if (inField) return;

      if (e.key === 'd') toggle();
      if (e.key === 'n') setShowAdd(true);

      if (e.key === 'e' && selected) {
        const r = rows.find((r) => r.id === selected);
        if (r && !r.isPhase) {
          setEditRow(r);
          seedEditForm(r);
        }
      }

      if (e.key === 'Delete' && selected) onDelete(selected);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        if (editRow) onSaveEdit();
        e.preventDefault();
      }

      if (e.key === 'Escape') {
        setShowAdd(false);
        setEditRow(null);
      }

      if (e.key === '?') {
        alert(
          [
            'Shortcuts:',
            'd: Toggle dark mode',
            '/: Focus search',
            'n: New task',
            'e: Edit selected task',
            'Delete: Delete selected task',
            'Esc: Close dialogs',
            'Ctrl/Cmd+S: Save in edit drawer',
          ].join('\n')
        );
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, editRow, rows, toggle]);

  // --------------------------
  // Load meta + rows
  // --------------------------
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

  useEffect(() => {
    load();
  }, []);

  // Helpers
  const columns = (meta && meta.columns) || [];
  const phases = (meta && meta.phases) || [];

  function cellValue(row, title) {
    return (row.cells[title] && row.cells[title].value) || '';
  }

  function asArray(x) {
    return Array.isArray(x) ? x : x ? [x] : [];
  }

  function seedEditForm(row) {
    setEditForm({
      taskName: cellValue(row, 'Task Name'),
      status: cellValue(row, 'Status'),
      assignedTo: asArray(cellValue(row, 'Assigned To')),
      start: cellValue(row, 'Start') || '',
      end: cellValue(row, 'End') || '',
      percent: Number(cellValue(row, '% Complete') || 0),
    });
  }

  // --------------------------
  // CRUD handlers
  // --------------------------
  async function onCreate(form) {
    await createTask({
      parentId: Number(form.phaseRowId), // Phase rowId becomes parentId
      cells: {
        'Task Name': form.taskName,
        Status: form.status,
        'Assigned To': form.assignedTo,
        Start: form.start,
        End: form.end,
        '% Complete': form.percent,
      },
    });
    setShowAdd(false);
    await load();
  }

  async function onQuickUpdate(rowId, title, value) {
    await updateTask(rowId, { [title]: value });
    const t = await getTasks();
    setRows(t.rows || []);
  }

  async function onDelete(rowId) {
    const r = rows.find((x) => x.id === rowId);
    if (!r || r.isPhase) {
      alert('Cannot delete a phase');
      return;
    }
    if (!confirm('Delete this task?')) return;
    await deleteTask(rowId);
    await load();
  }

  async function onSaveEdit() {
    if (!editRow) return;
    await updateTask(editRow.id, {
      'Task Name': editForm.taskName,
      Status: editForm.status,
      'Assigned To': editForm.assignedTo,
      Start: editForm.start,
      End: editForm.end,
      '% Complete': editForm.percent,
    });
    setEditRow(null);
    await load();
  }

  if (loading) return <div className="container">Loading…</div>;

  return (
    <div className="container">
      {/* Header */}
      <div
        className="app-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: 14,
        }}
      >
        <div style={{ fontWeight: 700 }}>PR‑123456 — Example Project Plan</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" title="Toggle dark (d)" onClick={toggle}>
            ☾/☀︎
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            + Add Task
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <input ref={searchRef} placeholder="Search tasks… (/)" />
      </div>

      {/* Grid */}
      <div
        className="panel"
        style={{ marginTop: 12, overflowX: 'auto', padding: 10 }}
      >
        <table className="table">
          <thead>
            <tr>
              <th className="th" style={{ width: 20 }}></th>
              {columns.map((c) => (
                <th key={c.id} className="th">
                  {c.title}
                </th>
              ))}
              <th className="th" style={{ whiteSpace: 'nowrap' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={row.isPhase ? 'row-phase' : ''}
                onClick={() => setSelected(row.id)}
                style={{ cursor: 'pointer' }}
              >
                {/* hierarchy indicator */}
                <td className="td">{row.indent ? '↳' : ''}</td>

                {columns.map((col) => {
                  const cell = row.cells[col.title] || {
                    value: '',
                    editable: false,
                  };

                  // Read-only cells or phase rows => plain text
                  if (row.isPhase || !cell.editable) {
                    return (
                      <td className="td" key={col.id}>
                        {String(cell.value ?? '')}
                      </td>
                    );
                  }

                  // Inline editors for common columns
                  if (col.title === 'Status' && Array.isArray(col.options)) {
                    return (
                      <td className="td" key={col.id}>
                        <select
                          value={cell.value || ''}
                          onChange={(e) =>
                            onQuickUpdate(row.id, 'Status', e.target.value)
                          }
                        >
                          {col.options.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  }

                  if (col.title === '% Complete') {
                    return (
                      <td className="td" key={col.id}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={Number(cell.value || 0)}
                          onChange={(e) =>
                            onQuickUpdate(
                              row.id,
                              '% Complete',
                              Number(e.target.value)
                            )
                          }
                        />
                      </td>
                    );
                  }

                  if (col.title === 'Start' || col.title === 'End') {
                    return (
                      <td className="td" key={col.id}>
                        <input
                          type="date"
                          value={(cell.value || '').split('T')[0] || ''}
                          onChange={(e) =>
                            onQuickUpdate(row.id, col.title, e.target.value)
                          }
                        />
                      </td>
                    );
                  }

                  if (col.title === 'Assigned To') {
                    const selected = Array.isArray(cell.value)
                      ? cell.value
                      : cell.value
                      ? [cell.value]
                      : [];
                    return (
                      <td className="td" key={col.id}>
                        <ContactMultiSelect
                          contacts={contacts}
                          value={selected}
                          onChange={(updated) =>
                            onQuickUpdate(row.id, 'Assigned To', updated)
                          }
                        />
                      </td>
                    );
                  }

                  // Default text editor
                  return (
                    <td className="td" key={col.id}>
                      <input
                        value={String(cell.value ?? '')}
                        onChange={(e) =>
                          onQuickUpdate(row.id, col.title, e.target.value)
                        }
                      />
                    </td>
                  );
                })}

                <td className="td" style={{ whiteSpace: 'nowrap' }}>
                  {!row.isPhase && (
                    <>
                      <button
                        className="btn"
                        onClick={() => {
                          setEditRow(row);
                          seedEditForm(row);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn"
                        style={{ marginLeft: 6 }}
                        onClick={() => onDelete(row.id)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                  {row.isPhase && <span className="muted">—</span>}
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
        <div className="drawer">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h3>Edit Task</h3>
            <button className="btn" onClick={() => setEditRow(null)}>
              ×
            </button>
          </div>

          <Field label="Task Name">
            <input
              value={editForm.taskName || ''}
              onChange={(e) =>
                setEditForm({ ...editForm, taskName: e.target.value })
              }
            />
          </Field>

          <Field label="Assigned To">
            <ContactMultiSelect
              contacts={contacts}
              value={editForm.assignedTo || []}
              onChange={(updated) =>
                setEditForm((prev) => ({
                  ...prev,
                  assignedTo: updated,
                }))
              }
            />
          </Field>

          <Field label="Status">
            <input
              value={editForm.status || ''}
              onChange={(e) =>
                setEditForm({ ...editForm, status: e.target.value })
              }
            />
          </Field>

          <Field label="% Complete">
            <input
              type="number"
              min={0}
              max={100}
              value={editForm.percent || 0}
              onChange={(e) =>
                setEditForm({ ...editForm, percent: Number(e.target.value) })
              }
            />
          </Field>

          <Field label="Start">
            <input
              type="date"
              value={(editForm.start || '').split('T')[0] || ''}
              onChange={(e) =>
                setEditForm({ ...editForm, start: e.target.value })
              }
            />
          </Field>

          <Field label="End">
            <input
              type="date"
              value={(editForm.end || '').split('T')[0] || ''}
              onChange={(e) =>
                setEditForm({ ...editForm, end: e.target.value })
              }
            />
          </Field>

          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button className="btn" onClick={() => setEditRow(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={onSaveEdit}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
