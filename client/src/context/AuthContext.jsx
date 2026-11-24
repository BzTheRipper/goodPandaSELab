import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/index.js';
import { tokenStore } from '../api/http.js';

const AuthContext = createContext(null);

/** Avoids a guaranteed 401 on load when the saved JWT is already expired. */
function tokenExpired(token) {
  try {
    const segment = token.split('.')[1];
    if (!segment) return true;
    const payload = JSON.parse(atob(segment.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(tokenStore.get());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token || tokenExpired(token)) {
      if (token) tokenStore.clear();
      setToken(null);
      setReady(true);
      return;
    }
    authApi
      .me()
      .then((r) => setUser(r.user))
      .catch(() => {
        tokenStore.clear();
        setToken(null);
      })
      .finally(() => setReady(true));
    // Only on first load; login/register set the user directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accept = useCallback(({ token: t, user: u }) => {
    tokenStore.set(t);
    setToken(t);
    setUser(u);
    return u;
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      ready,
      login: async (body) => accept(await authApi.login(body)),
      register: async (body) => accept(await authApi.register(body)),
      logout: () => {
        authApi.logout().catch(() => {});
        tokenStore.clear();
        setToken(null);
        setUser(null);
      },
      updateProfile: async (body) => {
        const r = await authApi.updateMe(body);
        setUser(r.user);
        return r.user;
      },
      updateNotifications: async (prefs) => {
        const r = await authApi.updateNotifications(prefs);
        setUser(r.user);
        return r.user;
      },
      setAvatar: async (file) => {
        const r = await authApi.setAvatar(file);
        setUser(r.user);
      },
      removeAvatar: async () => {
        const r = await authApi.removeAvatar();
        setUser(r.user);
      },
      isFavorite: (restaurantId) => (user?.favorites || []).some((f) => String(f) === String(restaurantId)),
      toggleFavorite: async (restaurantId) => {
        const saved = (user?.favorites || []).some((f) => String(f) === String(restaurantId));
        const r = saved ? await authApi.removeFavorite(restaurantId) : await authApi.addFavorite(restaurantId);
        setUser((u) => ({ ...u, favorites: r.favorites }));
        return !saved;
      },
    }),
    [user, token, ready, accept],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export const homeFor = (user) =>
  ({ owner: '/owner/orders', admin: '/admin', hub_operator: '/hub' })[user?.role] || '/';
