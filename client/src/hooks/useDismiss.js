import { useEffect } from 'react';

/** Closes a popover on outside pointerdown or Esc (focus returns to the trigger on Esc). */
export function useDismiss(open, close, rootRef, triggerRef) {
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      close();
      triggerRef?.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, rootRef, triggerRef]);
}
