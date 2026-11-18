import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import styles from './InfoTooltip.module.css';

const GAP = 8;
const EDGE = 8;

/**
 * The (i) icon pattern for secondary, explanatory text.
 * Hover or keyboard focus shows it; tap/click pins it open; Esc or an outside tap closes it.
 * Never use it as the only place for errors or required actions.
 */
export default function InfoTooltip({ content, label = 'More information', size = 16, className = '' }) {
  const id = useId();
  const triggerRef = useRef(null);
  const bubbleRef = useRef(null);
  const pointerDown = useRef(false);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState(null);

  const close = useCallback(() => {
    setOpen(false);
    setPinned(false);
  }, []);

  const place = useCallback(() => {
    const t = triggerRef.current?.getBoundingClientRect();
    const b = bubbleRef.current?.getBoundingClientRect();
    if (!t || !b) return;
    const vw = document.documentElement.clientWidth;
    let top = t.top - b.height - GAP;
    if (top < EDGE) top = t.bottom + GAP;
    const left = Math.min(Math.max(EDGE, t.left + t.width / 2 - b.width / 2), vw - b.width - EDGE);
    setPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
    else setPos(null);
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && close();
    const onOutside = (e) => {
      if (!triggerRef.current?.contains(e.target)) close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onOutside);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onOutside);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, close, place]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${className}`}
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onPointerDown={() => {
          pointerDown.current = true;
        }}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && !pinned && setOpen(false)}
        onFocus={() => {
          if (!pointerDown.current) setOpen(true);
          pointerDown.current = false;
        }}
        onBlur={() => !pinned && setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (pinned) close();
          else {
            setPinned(true);
            setOpen(true);
          }
        }}
      >
        <Icon name="info" size={size} />
      </button>
      <span id={id} className="visually-hidden">
        {content}
      </span>
      {open &&
        createPortal(
          <div
            ref={bubbleRef}
            className={styles.bubble}
            aria-hidden="true"
            style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
          >
            {content}
          </div>,
          // Inside a modal <dialog> the body is below the top layer, so render within the dialog.
          triggerRef.current?.closest('dialog') || document.body,
        )}
    </>
  );
}
