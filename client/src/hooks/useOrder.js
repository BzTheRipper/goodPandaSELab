import { useCallback, useEffect, useRef, useState } from 'react';
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
  // The payment webhook fires outside the order flow, so refetch when it lands.
  useSocketEvent('payment:updated', (p) => {
    if (p.orderId === id) reload();
  });

  useEffect(() => {
    if (order && order.status !== 'IN_FLIGHT') setTelemetry(null);
  }, [order?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  return { order, setOrder: setData, loading, error, reload, telemetry };
}

/**
 * Paginated order list kept live via socket updates.
 * Pass `pageSize` to page through results; the server reports `total`/`pages`.
 */
export function useOrderList(params = {}, { pageSize = 20 } = {}) {
  const [page, setPage] = useState(1);
  const [extra, setExtra] = useState([]);
  const query = { ...params, page, limit: pageSize };
  const key = JSON.stringify(query);
  const { data, setData, loading, error, reload } = useAsync(() => orderApi.list(query), [key]);

  // Reset back to the first page whenever the filters change.
  const filterKey = JSON.stringify(params);
  useEffect(() => {
    setPage(1);
    setExtra([]);
  }, [filterKey]);

  const matches = useCallback(
    (o) =>
      (!params.status || o.status === params.status) && (params.needsIntervention !== 'true' || o.needsAdminIntervention),
    [params.status, params.needsIntervention]
  );

  const upsert = (o) =>
    setData((current) => {
      if (!current) return current;
      const inPage = current.items.some((x) => x._id === o._id);
      // Leave orders that don't match the active filter off the page.
      if (!matches(o)) {
        return inPage ? { ...current, items: current.items.filter((x) => x._id !== o._id), total: Math.max(0, current.total - 1) } : current;
      }
      if (inPage) return { ...current, items: current.items.map((x) => (x._id === o._id ? o : x)) };
      // A new order that belongs on page 1 goes to the top without a full refetch.
      if (page === 1) {
        return { ...current, items: [o, ...current.items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, pageSize), total: current.total + 1 };
      }
      return { ...current, total: current.total + 1 };
    });

  useSocketEvent('order:new', upsert);
  useSocketEvent('order:updated', upsert);

  // Append the last page's already-loaded orders so the UI can show them without refetching.
  const orders = data?.items || [];

  const loadMore = useCallback(async () => {
    if (!data || page >= data.pages) return;
    const next = page + 1;
    const result = await orderApi.list({ ...params, page: next, limit: pageSize });
    setExtra((list) => [...list, ...result.items]);
    setPage(next);
  }, [data, page, params, pageSize]);

  return {
    orders: extra.length ? [...orders, ...extra.filter((o) => !orders.some((x) => x._id === o._id))] : orders,
    total: data?.total ?? 0,
    pages: data?.pages ?? 0,
    page,
    loading,
    error,
    reload: useCallback(async () => {
      setExtra([]);
      return reload();
    }, [reload]),
    loadMore,
  };
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
