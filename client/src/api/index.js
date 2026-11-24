import { del, get, patch, post, put, toFormData } from './http.js';

export const authApi = {
  register: (body) => post('/auth/register', body),
  login: (body) => post('/auth/login', body),
  logout: () => post('/auth/logout'),
  me: () => get('/auth/me'),
  updateMe: (body) => patch('/auth/me', body),
  updateNotifications: (body) => patch('/auth/me/notifications', body),
  changePassword: (body) => post('/auth/me/password', body),
  setAvatar: (file) => put('/auth/me/avatar', toFormData({ avatar: file })),
  removeAvatar: () => del('/auth/me/avatar'),
  exportData: () => get('/auth/me/export'),
  deleteMe: () => del('/auth/me'),
  referrals: () => get('/auth/me/referrals'),
  listFavorites: () => get('/auth/me/favorites'),
  addFavorite: (id) => put(`/auth/me/favorites/${id}`),
  removeFavorite: (id) => del(`/auth/me/favorites/${id}`),
  pushConfig: () => get('/auth/push/config'),
  pushSubscribe: (subscription) => post('/auth/me/push', subscription),
  pushUnsubscribe: (endpoint) => del('/auth/me/push', { data: { endpoint } }),
};

export const restaurantApi = {
  list: (params) => get('/restaurants', params),
  recommended: (params) => get('/restaurants/recommended', params),
  detail: (id) => get(`/restaurants/${id}`),
  reviews: (id) => get(`/restaurants/${id}/reviews`),
};

export const settingsApi = { public: () => get('/settings/public') };

export const couponApi = {
  validate: (body) => post('/coupons/validate', body),
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
  addDocument: (fields) => post('/owner/restaurant/documents', toFormData(fields)),
  removeDocument: (docId) => del(`/owner/restaurant/documents/${docId}`),
  availableDrones: () => get('/drones/available'),
  insights: () => get('/owner/insights'),
  earnings: () => get('/owner/earnings'),
  reviews: () => get('/owner/reviews'),
  replyReview: (id, text) => post(`/owner/reviews/${id}/reply`, { text }),
};

export const orderApi = {
  create: (body) => post('/orders', body),
  /** Returns `{ items, page, limit, total, pages }`. */
  list: (params) => get('/orders', params),
  detail: (id) => get(`/orders/${id}`),
  setStatus: (id, status, reason) => patch(`/orders/${id}/status`, { status, ...(reason && { reason }) }),
  requestConfirmation: (id, body) => post(`/orders/${id}/confirmation-request`, body),
  respondConfirmation: (id, decision) => post(`/orders/${id}/confirmation-response`, { decision }),
  requestCancellation: (id, message) => post(`/orders/${id}/cancel-request`, { message }),
  respondCancellation: (id, decision, reason) => post(`/orders/${id}/cancel-response`, { decision, ...(reason && { reason }) }),
  messages: (id) => get(`/orders/${id}/messages`),
  sendMessage: (id, text) => post(`/orders/${id}/messages`, { text }),
  loadDrone: (id, droneId) => post(`/orders/${id}/load-drone`, { droneId }),
  unloadDrone: (id) => post(`/orders/${id}/unload-drone`),
  dispatch: (id) => post(`/orders/${id}/dispatch`),
  paymentLink: (id) => post(`/orders/${id}/payment-link`),
  /** Body is `{ pickupCode }` or `{ pickupToken }` — already flat, as the API expects. */
  collect: (id, body) => post(`/orders/${id}/collect`, body),
  reportNoShow: (id) => post(`/orders/${id}/no-show`),
  receipt: (id) => get(`/orders/${id}/receipt`),
  emailReceipt: (id) => post(`/orders/${id}/receipt/email`),
  review: (id, body) => post(`/orders/${id}/review`, body),
  disputes: (id) => get(`/orders/${id}/disputes`),
  openDispute: (id, body) => post(`/orders/${id}/disputes`, body),
  modify: (id, body) => patch(`/orders/${id}`, body),
};

export const notificationApi = {
  list: (params) => get('/notifications', params),
  markRead: (id) => patch(`/notifications/${id}/read`),
  markAllRead: () => post('/notifications/read-all'),
};

export const adminApi = {
  dashboard: () => get('/admin/dashboard'),
  restaurants: (status) => get('/admin/restaurants', status ? { status } : undefined),
  setRestaurantStatus: (id, status) => patch(`/admin/restaurants/${id}/status`, { status }),
  verifyDocument: (restaurantId, docId, body) =>
    patch(`/admin/restaurants/${restaurantId}/documents/${docId}`, body),
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
  fleetHealth: () => get('/admin/drones/health'),
  createHubOperator: (body) => post('/admin/users/hub-operator', body),
  settings: () => get('/admin/settings'),
  updateSettings: (body) => put('/admin/settings', body),
  auditLogs: (params) => get('/admin/audit-logs', params),
  campaigns: () => get('/admin/campaigns'),
  previewCampaign: (segment) => post('/admin/campaigns/preview', { segment }),
  sendCampaign: (body) => post('/admin/campaigns', body),
  coupons: () => get('/admin/coupons'),
  createCoupon: (body) => post('/admin/coupons', body),
  updateCoupon: (id, body) => patch(`/admin/coupons/${id}`, body),
  disputes: (params) => get('/admin/disputes', params),
  resolveDispute: (id, body) => patch(`/admin/disputes/${id}`, body),
  payouts: (params) => get('/admin/payouts', params),
  markPayoutPaid: (id) => patch(`/admin/payouts/${id}/paid`),
};
