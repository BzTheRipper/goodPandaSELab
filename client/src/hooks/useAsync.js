import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/http.js';

/** Runs an async loader on mount / when deps change. Exposes data, loading, error, reload and setData. */
export function useAsync(loader, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await loaderRef.current();
      setData(result);
      return result;
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, setData, loading, error, reload };
}

/** Wraps an async action with busy/error state, e.g. for buttons. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async (fn) => {
    setBusy(true);
    setError('');
    try {
      return await fn();
    } catch (err) {
      setError(errorMessage(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}
