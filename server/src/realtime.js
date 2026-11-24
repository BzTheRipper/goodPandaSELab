// Thin wrapper around the Socket.IO server so services can emit without depending on the socket layer.
let io = null;

export const setIo = (instance) => {
  io = instance;
};

export const rooms = {
  user: (id) => `user:${id}`,
  order: (id) => `order:${id}`,
  admins: 'admins',
  // Hub-scoped staff room: hub operators only see the orders and drones for their own hub.
  hub: (id) => `hub:${id}`,
};

export const emitToUser = (userId, event, payload) => io?.to(rooms.user(userId)).emit(event, payload);
export const emitToAdmins = (event, payload) => io?.to(rooms.admins).emit(event, payload);
export const emitToHub = (hubId, event, payload) => (hubId ? io?.to(rooms.hub(hubId)).emit(event, payload) : undefined);
export const emitToOrder = (orderId, event, payload) => io?.to(rooms.order(orderId)).emit(event, payload);

/** Drops a user's live sockets, e.g. after an admin deactivates the account. */
export const disconnectUser = (userId) => io?.in(rooms.user(userId)).disconnectSockets(true);
