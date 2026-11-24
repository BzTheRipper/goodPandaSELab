export const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  OWNER: 'owner',
  ADMIN: 'admin',
  // Hub staff: verify pickups and watch the queue, no platform-wide powers.
  HUB_OPERATOR: 'hub_operator',
  SYSTEM: 'system',
});

/** Roles that act as staff on orders (view everything, read chats, clear intervention). */
export const STAFF_ROLES = [ROLES.ADMIN, ROLES.HUB_OPERATOR];export const ORDER_STATUS = Object.freeze({
  PLACED: 'PLACED',
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  READY_FOR_DRONE: 'READY_FOR_DRONE',
  IN_FLIGHT: 'IN_FLIGHT',
  ARRIVED_AT_HUB: 'ARRIVED_AT_HUB',
  COLLECTED: 'COLLECTED',
  NEEDS_CUSTOMER_CONFIRMATION: 'NEEDS_CUSTOMER_CONFIRMATION',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
});

export const FINAL_STATUSES = [ORDER_STATUS.COLLECTED, ORDER_STATUS.CANCELLED, ORDER_STATUS.REJECTED];

export const RESTAURANT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  SUSPENDED: 'SUSPENDED',
});

// CHARGING drones are docked and topping up but still count as available when they hold enough charge.
export const DRONE_STATUS = Object.freeze({
  IDLE: 'IDLE',
  CHARGING: 'CHARGING',
  LOADED: 'LOADED',
  IN_FLIGHT: 'IN_FLIGHT',
  MAINTENANCE: 'MAINTENANCE',
});

/** Drone states that may be claimed for a new order. */
export const AVAILABLE_DRONE_STATUSES = [DRONE_STATUS.IDLE, DRONE_STATUS.CHARGING];

/** Drone states that mean the drone is committed to an order. */
export const BUSY_DRONE_STATUSES = [DRONE_STATUS.LOADED, DRONE_STATUS.IN_FLIGHT];

export const CONFIRMATION_TYPES = Object.freeze({
  ITEM_UNAVAILABLE: 'ITEM_UNAVAILABLE',
  NOTE_UNMET: 'NOTE_UNMET',
  CANCEL_REQUEST: 'CANCEL_REQUEST',
});

export const PAYMENT_METHODS = Object.freeze({ CASH_ON_COLLECTION: 'CASH_ON_COLLECTION', ONLINE_PAYMENT: 'ONLINE_PAYMENT' });
export const PAYMENT_STATUS = Object.freeze({ PENDING: 'PENDING', PAID: 'PAID', VOID: 'VOID', FAILED: 'FAILED' });
