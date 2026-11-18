import { useId, useRef } from 'react';
import styles from './Tabs.module.css';

/**
 * WAI-ARIA tabs with arrow/Home/End keys. Renders the active panel (children).
 * tabs: [{ value, label, count? }]. variant: underline | pills.
 */
export default function Tabs({ tabs, value, onChange, label, variant = 'underline', children }) {
  const base = useId();
  const listRef = useRef(null);
  const index = Math.max(
    0,
    tabs.findIndex((t) => t.value === value),
  );

  const onKeyDown = (e) => {
    const last = tabs.length - 1;
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const i = next < 0 ? last : next > last ? 0 : next;
    onChange(tabs[i].value);
    listRef.current?.querySelectorAll('[role="tab"]')[i]?.focus();
  };

  return (
    <>
      <div ref={listRef} role="tablist" aria-label={label} className={`${styles.list} ${styles[variant]}`} onKeyDown={onKeyDown}>
        {tabs.map((t, i) => {
          const selected = i === index;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              id={`${base}-tab-${i}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              className={styles.tab}
              onClick={() => onChange(t.value)}
            >
              {t.label}
              {t.count !== undefined && <span className={styles.count}>{t.count}</span>}
            </button>
          );
        })}
      </div>
      {children !== undefined && (
        <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${index}`}>
          {children}
        </div>
      )}
    </>
  );
}
