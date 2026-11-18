// Thin wrapper around the Socket.IO server so services can emit without depending on the socket layer.
let io = null;

export const setIo = (instance) => {
  io = instance;
};

export const rooms = {
  user: (id) => `user:${id}`,
  order: (id) => `order:${id}`,
  admins: 'admins',
};

export const emitToUser = (userId, event, payload) => io?.to(rooms.user(userId)).emit(event, payload);
export const emitToAdmins = (event, payload) => io?.to(rooms.admins).emit(event, payload);
export const emitToOrder = (orderId, event, payload) => io?.to(rooms.order(orderId)).emit(event, payload);
