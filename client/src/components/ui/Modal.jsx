import { useEffect, useId, useRef } from 'react';
import Button from './Button.jsx';
import styles from './Modal.module.css';

const cx = (...c) => c.filter(Boolean).join(' ');
let lockCount = 0;

/** Controlled native <dialog>: focus trap, Esc and top layer come from the browser. */
function DialogBase({ open, onClose, dismissible = true, labelledBy, describedBy, wrapClass, panelClass, role, children }) {
  const ref = useRef(null);
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return undefined;
    if (open && !d.open) {
      d.showModal();
      if (++lockCount === 1) document.documentElement.classList.add('scroll-locked');
      return () => {
        if (d.open) d.close();
        if (--lockCount === 0) document.documentElement.classList.remove('scroll-locked');
      };
    }
    return undefined;
  }, [open]);

  const isBackdrop = (e) => e.target === ref.current || e.target.dataset?.backdrop !== undefined;

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      role={role}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose?.();
      }}
      onPointerDown={(e) => {
        downOnBackdrop.current = isBackdrop(e);
      }}
      onClick={(e) => {
        if (dismissible && downOnBackdrop.current && isBackdrop(e)) onClose?.();
      }}
    >
      {open && (
        <div className={wrapClass} data-backdrop="">
          <div className={cx(styles.panel, panelClass)}>{children}</div>
        </div>
      )}
    </dialog>
  );
}

function Head({ titleId, descId, title, description, onClose, dismissible }) {
  return (
    <div className={styles.head}>
      <div className={styles.titles}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {description && (
          <p id={descId} className={styles.description}>
            {description}
          </p>
        )}
      </div>
      {dismissible && <Button variant="ghost" size="sm" icon="x" iconOnly aria-label="Close" className={styles.close} onClick={onClose} />}
    </div>
  );
}

/** Centered on desktop, bottom sheet on mobile. size: sm | md | lg. */
export function Modal({ open, onClose, title, description, footer, size = 'md', dismissible = true, role, children }) {
  const titleId = useId();
  const descId = useId();
  return (
    <DialogBase
      open={open}
      onClose={onClose}
      dismissible={dismissible}
      role={role}
      labelledBy={titleId}
      describedBy={description ? descId : undefined}
      wrapClass={styles.modalWrap}
      panelClass={cx(styles.modal, styles[size])}
    >
      <Head titleId={titleId} descId={descId} title={title} description={description} onClose={onClose} dismissible={dismissible} />
      {children && <div className={styles.body}>{children}</div>}
      {footer && <div className={styles.footer}>{footer}</div>}
    </DialogBase>
  );
}

/** Side panel (mobile navigation, cart). side: left | right; size: sm | md. */
export function Drawer({ open, onClose, title, side = 'left', size = 'sm', footer, children }) {
  const titleId = useId();
  return (
    <DialogBase
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      wrapClass={cx(styles.drawerWrap, styles[side])}
      panelClass={cx(styles.drawer, size === 'md' && styles.drawerMd)}
    >
      <Head titleId={titleId} title={title} onClose={onClose} dismissible />
      <div className={styles.body}>{children}</div>
      {footer && <div className={cx(styles.footer, styles.drawerFooter)}>{footer}</div>}
    </DialogBase>
  );
}
