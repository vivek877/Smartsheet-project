import React, { useState, useRef, useEffect } from 'react';

/**
 * props:
 *  contacts: [{ email, name, color }]
 *  value: array of emails
 *  onChange: (updatedArray) => void
 */

export default function ContactMultiSelect({ contacts, value = [], onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, []);

  const toggle = () => setOpen(!open);

  const toggleContact = (email) => {
    if (value.includes(email)) {
      onChange(value.filter((v) => v !== email));
    } else {
      onChange([...value, email]);
    }
  };

  return (
    <div className="cmulti" ref={ref}>
      {/* Chips */}
      <div className="cmulti__chips" onClick={toggle}>
        {value.map((email) => {
          const c = contacts.find((x) => x.email === email);
          const initials = c
            ? c.name
                .split(' ')
                .map((x) => x[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()
            : '?';

          return (
            <div key={email} className="cmulti__chip">
              <div
                className="cmulti__avatar"
                style={{ backgroundColor: c?.color || '#666' }}
              >
                {initials}
              </div>
              <span className="cmulti__chipLabel">{c ? c.name : email}</span>
              <span
                className="cmulti__chipRemove"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleContact(email);
                }}
              >
                ✕
              </span>
            </div>
          );
        })}
        <div className="cmulti__caret">▾</div>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="cmulti__dropdown">
          {contacts.map((c) => {
            const initials = c.name
              .split(' ')
              .map((x) => x[0])
              .join('')
              .slice(0, 2)
              .toUpperCase();
            const checked = value.includes(c.email);

            return (
              <div
                key={c.email}
                className="cmulti__option"
                onClick={() => toggleContact(c.email)}
              >
                <input type="checkbox" readOnly checked={checked} />
                <div
                  className="cmulti__optionAvatar"
                  style={{ backgroundColor: c.color }}
                >
                  {initials}
                </div>
                <div className="cmulti__optionText">
                  <div>{c.name}</div>
                  <div className="cmulti__email">{c.email}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
