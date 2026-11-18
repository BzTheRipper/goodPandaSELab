import { useEffect, useState } from 'react';

/** Tracks a media query. Used to choose between the desktop chat rail and the mobile chat sheet. */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches));

  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);

  return matches;
}
