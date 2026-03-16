import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * ContactMultiSelect
 * props:
 *  - contacts: [{ name, email, color }]
 *  - value: string[] (emails)
 *  - onChange: (emails[]) => void
 *  - placeholder?: string
 */
export default function ContactMultiSelect({ contacts = [], value = [], onChange, placeholder = 'Select assignees…' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const selected = Array.isArray(value) ? value : (value ? [value] : []);

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
    setOpen((v) => !v);
  }

  function toggleOne(email) {
    if (!onChange) return;
    if (selected.includes(email)) {
      onChange(selected.filter(v => v !== email));
    } else {
      onChange([...selected, email]);
    }
  }

  function onKeyDown(e) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
      scrollIntoView(active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
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
    if (item && container) {
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
      {/* chips */}
      <div className="cmulti__chips" onClick={toggle}>
        {selected.length === 0 && <span style={{ color: 'var(--muted)' }}>{placeholder}</span>}
        {selected.map(email => {
          const c = contacts.find(x => x.email === email);
          const initials = c ? c.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() : '?';
          return (
            <span key={email} className="cmulti__chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 18, height: 18, borderRadius: '50%',
                background: c?.color || '#888', color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10
              }}>{initials}</span>
              <span style={{ fontSize: 12 }}>{c ? c.name : email}</span>
              <span style={{ marginLeft: 4, cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); toggleOne(email); }}>✕</span>
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
              const checked = selected.includes(c.email);
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
                  <input type="checkbox" checked={checked} readOnly />
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