import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../api/http.js';
import { notificationApi } from '../api/index.js';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);

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
    });
    return () => {
      s.disconnect();
      setSocket(null);
      setNotifications([]);
      setUnread(0);
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
