import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { userFromToken } from '../middleware/auth.js';
import { rooms, setIo } from '../realtime.js';
import { isParticipant, loadOrder } from '../services/order.service.js';

export function initSocket(httpServer) {
  const io = new Server(httpServer, { cors: { origin: env.clientOrigin, credentials: true } });

  io.use(async (socket, next) => {
    try {
      socket.data.user = await userFromToken(socket.handshake.auth?.token);
      next();
    } catch (err) {
      next(new Error(err.message || 'Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(rooms.user(user._id));
    // Admins get the platform-wide feed. Hub operators are staff too, but scoped to their hub —
    // they must never receive other hubs' orders, chats or telemetry.
    if (user.role === 'admin') socket.join(rooms.admins);
    if (user.role === 'hub_operator' && user.hub) socket.join(rooms.hub(user.hub));

    // Only the order's customer, the restaurant owner, or an admin may join an order room.
    socket.on('order:join', async (orderId, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const order = await loadOrder(orderId);
        if (!isParticipant(user, order)) return reply({ ok: false, error: 'Forbidden' });
        socket.join(rooms.order(orderId));
        reply({ ok: true });
      } catch {
        reply({ ok: false, error: 'Order not found' });
      }
    });

    socket.on('order:leave', (orderId) => socket.leave(rooms.order(orderId)));
  });

  setIo(io);
  return io;
}
