import { useCallback, useEffect, useRef, useState } from 'react';

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Tracks which section (by element id) is under the sticky header + `extraOffset`, and scrolls to one on demand.
 * While a programmatic scroll is running the clicked section stays active, so short final sections still highlight.
 */
export function useScrollSpy(ids, extraOffset = 72) {
  const [active, setActive] = useState(ids[0] || '');
  const locked = useRef(null);
  const key = ids.join('|');

  useEffect(() => {
    if (!ids.length) return undefined;
    let timer;
    const onScroll = () => {
      if (locked.current) {
        clearTimeout(timer);
        timer = setTimeout(() => {
          locked.current = null;
        }, 150);
        return;
      }
      const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-offset')) || 64;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - header - extraOffset <= 1) current = id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [key, extraOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollTo = useCallback((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    locked.current = id;
    setActive(id);
    el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    el.querySelector('h2')?.focus({ preventScroll: true });
  }, []);

  return [active, scrollTo];
}
