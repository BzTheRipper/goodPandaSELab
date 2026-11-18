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
    if (user.role === 'admin') socket.join(rooms.admins);

    // Only the order's customer, the restaurant owner, or an admin may join an order room.
    socket.on('order:join', async (orderId, ack = () => {}) => {
      try {
        const order = await loadOrder(orderId);
        if (!isParticipant(user, order)) return ack({ ok: false, error: 'Forbidden' });
        socket.join(rooms.order(orderId));
        ack({ ok: true });
      } catch {
        ack({ ok: false, error: 'Order not found' });
      }
    });

    socket.on('order:leave', (orderId) => socket.leave(rooms.order(orderId)));
  });

  setIo(io);
  return io;
}
