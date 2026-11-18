import { del, get, patch, post, put, toFormData } from './http.js';

export const authApi = {
  register: (body) => post('/auth/register', body),
  login: (body) => post('/auth/login', body),
  logout: () => post('/auth/logout'),
  me: () => get('/auth/me'),
  updateMe: (body) => patch('/auth/me', body),
  changePassword: (body) => post('/auth/me/password', body),
  setAvatar: (file) => put('/auth/me/avatar', toFormData({ avatar: file })),
  removeAvatar: () => del('/auth/me/avatar'),
  addFavorite: (id) => put(`/auth/me/favorites/${id}`),
  removeFavorite: (id) => del(`/auth/me/favorites/${id}`),
};

export const restaurantApi = {
  list: (params) => get('/restaurants', params),
  detail: (id) => get(`/restaurants/${id}`),
  reviews: (id) => get(`/restaurants/${id}/reviews`),
};

export const hubApi = {
  listActive: () => get('/hubs'),
};

export const ownerApi = {
  getRestaurant: () => get('/owner/restaurant'),
  createRestaurant: (fields) => post('/owner/restaurant', toFormData(fields)),
  updateRestaurant: (fields) => patch('/owner/restaurant', toFormData(fields)),
  setOpen: (isOpen) => patch('/owner/restaurant/open', { isOpen }),
  listMenu: () => get('/owner/menu'),
  createItem: (fields) => post('/owner/menu', toFormData(fields)),
  updateItem: (id, fields) => patch(`/owner/menu/${id}`, toFormData(fields)),
  setAvailability: (id, isAvailable) => patch(`/owner/menu/${id}/availability`, { isAvailable }),
  deleteItem: (id) => del(`/owner/menu/${id}`),
  availableDrones: () => get('/drones/available'),
  insights: () => get('/owner/insights'),
  reviews: () => get('/owner/reviews'),
  replyReview: (id, text) => post(`/owner/reviews/${id}/reply`, { text }),
};

export const orderApi = {
  create: (body) => post('/orders', body),
  list: (params) => get('/orders', params),
  detail: (id) => get(`/orders/${id}`),
  setStatus: (id, status, reason) => patch(`/orders/${id}/status`, { status, ...(reason && { reason }) }),
  requestConfirmation: (id, body) => post(`/orders/${id}/confirmation-request`, body),
  respondConfirmation: (id, decision) => post(`/orders/${id}/confirmation-response`, { decision }),
  messages: (id) => get(`/orders/${id}/messages`),
  sendMessage: (id, text) => post(`/orders/${id}/messages`, { text }),
  loadDrone: (id, droneId) => post(`/orders/${id}/load-drone`, { droneId }),
  unloadDrone: (id) => post(`/orders/${id}/unload-drone`),
  dispatch: (id) => post(`/orders/${id}/dispatch`),
  collect: (id, pickupCode) => post(`/orders/${id}/collect`, { pickupCode }),
  review: (id, body) => post(`/orders/${id}/review`, body),
};

export const notificationApi = {
  list: () => get('/notifications'),
  markRead: (id) => patch(`/notifications/${id}/read`),
  markAllRead: () => post('/notifications/read-all'),
};

export const adminApi = {
  dashboard: () => get('/admin/dashboard'),
  restaurants: (status) => get('/admin/restaurants', status ? { status } : undefined),
  setRestaurantStatus: (id, status) => patch(`/admin/restaurants/${id}/status`, { status }),
  users: (role) => get('/admin/users', role ? { role } : undefined),
  setUserActive: (id, isActive) => patch(`/admin/users/${id}/active`, { isActive }),
  hubs: () => get('/admin/hubs'),
  createHub: (body) => post('/admin/hubs', body),
  updateHub: (id, body) => patch(`/admin/hubs/${id}`, body),
  deleteHub: (id) => del(`/admin/hubs/${id}`),
  drones: () => get('/admin/drones'),
  createDrone: (body) => post('/admin/drones', body),
  updateDrone: (id, body) => patch(`/admin/drones/${id}`, body),
  deleteDrone: (id) => del(`/admin/drones/${id}`),
  failDrone: (id) => post(`/admin/drones/${id}/fail`),
  settings: () => get('/admin/settings'),
  updateSettings: (body) => put('/admin/settings', body),
};
