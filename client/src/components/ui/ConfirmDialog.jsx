import { createContext, useCallback, useContext, useRef, useState } from 'react';
import Button from './Button.jsx';
import { Modal } from './Modal.jsx';

/** Two-button confirmation. tone: danger | primary. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={message}
      size="sm"
      role="alertdialog"
      dismissible={!loading}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} autoFocus>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

const ConfirmContext = createContext(null);

/** Promise-based replacement for window.confirm: `if (!(await confirm({...}))) return;` */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((opts) => {
    resolver.current?.(false);
    setState(typeof opts === 'string' ? { title: opts } : opts);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (value) => {
    resolver.current?.(value);
    resolver.current = null;
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog open={!!state} {...state} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
