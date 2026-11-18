import { useEffect, useState } from 'react';
import { orderApi } from '../api/index.js';
import { useSocket, useSocketEvent } from '../context/SocketContext.jsx';
import { useAsync } from './useAsync.js';

/** A single order kept live via socket updates, plus the latest drone telemetry for it. */
export function useOrder(id) {
  const { data: order, setData, loading, error, reload } = useAsync(() => orderApi.detail(id), [id]);
  const [telemetry, setTelemetry] = useState(null);

  useSocketEvent('order:updated', (o) => {
    if (o._id === id) setData(o);
  });
  useSocketEvent('drone:location', (t) => {
    if (t.orderId === id) setTelemetry(t);
  });

  useEffect(() => {
    if (order && order.status !== 'IN_FLIGHT') setTelemetry(null);
  }, [order?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  return { order, setOrder: setData, loading, error, reload, telemetry };
}

/** Order list that merges in real-time creations and updates. */
export function useOrderList(params = {}) {
  const key = JSON.stringify(params);
  const { data, setData, loading, error, reload } = useAsync(() => orderApi.list(params), [key]);

  const matches = (o) =>
    (!params.status || o.status === params.status) && (params.needsIntervention !== 'true' || o.needsAdminIntervention);
  const upsert = (o) =>
    setData((list) => {
      if (!list) return list;
      const rest = list.filter((x) => x._id !== o._id);
      return matches(o) ? [o, ...rest].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : rest;
    });

  useSocketEvent('order:new', upsert);
  useSocketEvent('order:updated', upsert);

  return { orders: data || [], loading, error, reload };
}

/** Order chat: history over REST, new messages over Socket.IO. Safe to mount before the order has loaded. */
export function useChat(orderId) {
  const { socket } = useSocket();
  const { data, setData, loading, error, reload } = useAsync(() => (orderId ? orderApi.messages(orderId) : Promise.resolve([])), [orderId]);

  useEffect(() => {
    if (!socket || !orderId) return undefined;
    socket.emit('order:join', orderId);
    return () => socket.emit('order:leave', orderId);
  }, [socket, orderId]);

  useSocketEvent('chat:message', (m) => {
    if (!orderId || String(m.order) !== String(orderId)) return;
    setData((list) => (list?.some((x) => x._id === m._id) ? list : [...(list || []), m]));
  });

  const send = async (text) => {
    if (!orderId) throw new Error('Order chat is not ready yet');
    const m = await orderApi.sendMessage(orderId, text);
    setData((list) => (list?.some((x) => x._id === m._id) ? list : [...(list || []), m]));
  };

  return { messages: data || [], loading: orderId ? loading : false, error, send, reload };
}
