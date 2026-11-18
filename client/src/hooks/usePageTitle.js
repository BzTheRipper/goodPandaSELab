import { useEffect } from 'react';

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · GoodPanda` : 'GoodPanda · Food by drone';
  }, [title]);
}
