import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Button from './Button.jsx';
import Icon from './Icon.jsx';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import styles from './Toast.module.css';

const ToastContext = createContext(null);
const ICONS = { success: 'checkCircle', danger: 'alertCircle', info: 'info', warning: 'alertTriangle' };
const MAX = 4;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);
  const paused = useRef(false);
  const schedule = useRef(null);
  const max = useMediaQuery('(min-width: 640px)') ? MAX : 2;

  const dismiss = useCallback((id) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  // Pause auto-dismiss while a toast is hovered or carries focus, so it can always be read.
  schedule.current = (id, ms) => {
    setTimeout(() => {
      if (paused.current) schedule.current(id, 1000);
      else dismiss(id);
    }, ms);
  };

  const show = useCallback(
    (tone, message, { title, duration } = {}) => {
      const id = ++seq.current;
      setToasts((all) => [...all.slice(-(max - 1)), { id, tone, message, title }]);
      schedule.current(id, duration ?? (tone === 'danger' ? 8000 : 5000));
      return id;
    },
    [max],
  );

  const api = useMemo(
    () => ({
      success: (m, o) => show('success', m, o),
      error: (m, o) => show('danger', m, o),
      info: (m, o) => show('info', m, o),
      warning: (m, o) => show('warning', m, o),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className={styles.region}
        aria-live="polite"
        aria-relevant="additions"
        onPointerEnter={() => {
          paused.current = true;
        }}
        onPointerLeave={() => {
          paused.current = false;
        }}
        onFocusCapture={() => {
          paused.current = true;
        }}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) paused.current = false;
        }}
      >
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.toast} ${styles[t.tone]}`} role={t.tone === 'danger' ? 'alert' : 'status'}>
            <Icon name={ICONS[t.tone]} size={18} />
            <div className={styles.message}>
              {t.title && <div className={styles.title}>{t.title}</div>}
              {t.message}
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon="x"
              iconOnly
              aria-label="Dismiss"
              className={styles.close}
              onClick={() => dismiss(t.id)}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
