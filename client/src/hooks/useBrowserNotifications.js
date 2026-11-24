import { useCallback, useEffect, useState } from 'react';
import { authApi } from '../api/index.js';
import { tokenStore } from '../api/http.js';

const SUPPORTED = typeof window !== 'undefined' && 'Notification' in window;
const PUSH_SUPPORTED = SUPPORTED && 'serviceWorker' in navigator && 'PushManager' in window;

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
};

/** Registers a Web Push subscription so notifications arrive with the tab fully closed. */
async function subscribeForPush() {
  if (!PUSH_SUPPORTED || !tokenStore.get()) return;
  try {
    const config = await authApi.pushConfig();
    if (!config.enabled || !config.publicKey) return;
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      }));
    const json = subscription.toJSON();
    if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
      await authApi.pushSubscribe({ endpoint: json.endpoint, keys: json.keys });
    }
  } catch {
    // Push is best-effort: unsupported browsers or missing VAPID keys simply keep the in-tab notifications.
  }
}

/**
 * Notifications while the app is open (socket events) and, when the browser supports Web Push
 * and the server has VAPID keys, also with the tab fully closed.
 */
export function useBrowserNotifications() {
  const [permission, setPermission] = useState(SUPPORTED ? Notification.permission : 'unsupported');

  useEffect(() => {
    if (!SUPPORTED) return undefined;
    // The permission can change while the page is open (browser settings).
    const sync = () => {
      const next = Notification.permission;
      setPermission((previous) => {
        if (next === 'granted' && previous !== 'granted') subscribeForPush();
        return next;
      });
    };
    document.addEventListener('visibilitychange', sync);
    if (Notification.permission === 'granted') subscribeForPush();
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  const request = useCallback(async () => {
    if (!SUPPORTED) return 'unsupported';
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') await subscribeForPush();
    return result;
  }, []);

  /** Shows a notification only when the user opted in and the page is not in the foreground. */
  const show = useCallback(
    (title, options = {}) => {
      if (!SUPPORTED || Notification.permission !== 'granted') return null;
      try {
        const n = new Notification(title, { badge: '/favicon.ico', ...options });
        n.onclick = () => {
          window.focus();
          if (options.url) window.location.assign(options.url);
          n.close();
        };
        return n;
      } catch {
        // Some browsers reject notifications without a service worker; silently skip.
        return null;
      }
    },
    [],
  );

  return { permission, request, show, supported: SUPPORTED };
}
