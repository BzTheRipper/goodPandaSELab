import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../api/http.js';
import { notificationApi } from '../api/index.js';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext(null);

/** Notifications worth surfacing outside the app while the tab is in the background. */
const DESKTOP_TYPES = new Set([
  'ORDER_STATUS',
  'CONFIRMATION_REQUESTED',
  'CANCEL_REQUESTED',
  'CANCEL_DECLINED',
  'CONFIRMATION_RESOLVED',
  'NEW_REVIEW',
  'REVIEW_REPLY',
  'RESTAURANT_STATUS',
]);

/** Fires a desktop notification for a notification document, if the user allowed them. */
function desktopNotify(n) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted' || !DESKTOP_TYPES.has(n.type)) return;
  // Only interrupt when the user is looking at another tab or window.
  if (document.visibilityState === 'visible') return;
  try {
    const notice = new Notification(n.title, {
      body: n.body || 'Tap to open the order.',
      tag: n.order ? `order-${n.order}` : undefined,
      icon: '/favicon.ico',
    });
    notice.onclick = () => {
      window.focus();
      if (n.order) window.location.assign(`/orders/${n.order}`);
      notice.close();
    };
  } catch {
    // Ignore: notifications are best-effort.
  }
}

export function SocketProvider({ children }) {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  // Latest orders statuses, so the socket can shout about arrivals that happened while away.
  const statuses = useRef(new Map());

  useEffect(() => {
    if (!token || !user) return undefined;
    const s = io(API_URL || undefined, { auth: { token } });
    setSocket(s);
    notificationApi
      .list()
      .then((r) => {
        setNotifications(r.items);
        setUnread(r.unread);
      })
      .catch(() => {});
    s.on('notification', (n) => {
      setNotifications((list) => [n, ...list].slice(0, 50));
      setUnread((u) => u + 1);
      desktopNotify(n);
    });
    // Status changes drive the most important alert: "your food is here".
    s.on('order:updated', (o) => {
      const previous = statuses.current.get(o._id);
      statuses.current.set(o._id, o.status);
      if (previous === o.status) return;
      if (o.status === 'ARRIVED_AT_HUB') {
        desktopNotify({
          type: 'ORDER_STATUS',
          title: `Food at ${o.hub?.name || 'the hub'}`,
          body: 'Show your pickup code to collect it and pay.',
          order: o._id,
        });
      } else if (o.status === 'IN_FLIGHT') {
        desktopNotify({
          type: 'ORDER_STATUS',
          title: 'Your food is on the way',
          body: o.estimatedArrivalAt
            ? `Arriving at ${o.hub?.name || 'the hub'} around ${new Date(o.estimatedArrivalAt).toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit',
              })}.`
            : 'A drone is flying your order to the hub.',
          order: o._id,
        });
      }
    });
    return () => {
      s.disconnect();
      setSocket(null);
      setNotifications([]);
      setUnread(0);
      statuses.current.clear();
    };
  }, [token, user?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const markRead = useCallback(async (n) => {
    if (n.read) return;
    await notificationApi.markRead(n._id);
    setNotifications((list) => list.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await notificationApi.markAllRead();
    setNotifications((list) => list.map((x) => ({ ...x, read: true })));
    setUnread(0);
  }, []);

  return <SocketContext.Provider value={{ socket, notifications, unread, markRead, markAllRead }}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext);

/** Subscribes to a socket event for the component's lifetime; the latest handler is always used. */
export function useSocketEvent(event, handler) {
  const { socket } = useSocket();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return undefined;
    const fn = (payload) => ref.current(payload);
    socket.on(event, fn);
    return () => socket.off(event, fn);
  }, [socket, event]);
}
