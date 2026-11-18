/**
 * The single source of truth for how statuses look across every role.
 * tone -> StatusPill colour; hint -> InfoTooltip text. Keys mirror the server enums.
 */
export const ORDER_STATUS = {
  PLACED: { label: 'Placed', tone: 'info', icon: 'receipt', hint: 'Sent to the restaurant. Waiting for them to accept.' },
  ACCEPTED: { label: 'Accepted', tone: 'info', icon: 'check', hint: 'The restaurant accepted the order and will start cooking soon.' },
  PREPARING: { label: 'Preparing', tone: 'brand', icon: 'utensils', hint: 'The food is being prepared.' },
  NEEDS_CUSTOMER_CONFIRMATION: {
    label: 'Awaiting confirmation',
    tone: 'warning',
    icon: 'alertTriangle',
    hint: 'The restaurant flagged a problem (an unavailable item or a request it cannot meet). The customer must continue or cancel.',
  },
  READY_FOR_DRONE: { label: 'Ready for drone', tone: 'brand', icon: 'drone', hint: 'Packed and waiting to be loaded onto a drone.' },
  IN_FLIGHT: { label: 'In flight', tone: 'info', icon: 'drone', live: true, hint: 'A drone is flying the food to the selected hub.' },
  ARRIVED_AT_HUB: {
    label: 'At hub',
    tone: 'success',
    icon: 'mapPin',
    live: true,
    hint: 'Waiting at the hub. The customer shows the pickup code and pays in cash.',
  },
  COLLECTED: { label: 'Collected', tone: 'success', icon: 'checkCircle', hint: 'Picked up and paid. Order complete.' },
  CANCELLED: { label: 'Cancelled', tone: 'danger', icon: 'x', hint: 'The order was cancelled and will not be delivered.' },
  REJECTED: { label: 'Rejected', tone: 'danger', icon: 'x', hint: 'The restaurant declined the order.' },
};

export const DRONE_STATUS = {
  IDLE: { label: 'Idle', tone: 'success', icon: 'check', hint: 'Available for a new delivery.' },
  LOADED: { label: 'Loaded', tone: 'brand', icon: 'drone', hint: 'Food is attached; waiting for dispatch.' },
  IN_FLIGHT: { label: 'In flight', tone: 'info', icon: 'drone', live: true, hint: 'Flying to a hub.' },
  MAINTENANCE: { label: 'Maintenance', tone: 'warning', icon: 'settings', hint: 'Out of service until an admin puts it back.' },
};

export const RESTAURANT_STATUS = {
  PENDING: { label: 'Pending approval', tone: 'warning', icon: 'clock', hint: 'Hidden from customers until an admin approves it.' },
  APPROVED: { label: 'Approved', tone: 'success', icon: 'check', hint: 'Visible to customers.' },
  SUSPENDED: { label: 'Suspended', tone: 'danger', icon: 'x', hint: 'Hidden and closed by an admin.' },
};

export const PAYMENT_STATUS = {
  PENDING: { label: 'Unpaid', tone: 'neutral', icon: 'clock', hint: 'Cash is paid at the hub on collection.' },
  PAID: { label: 'Paid', tone: 'success', icon: 'check', hint: 'Cash received at the hub.' },
  VOID: { label: 'Void', tone: 'neutral', icon: 'x', hint: 'No payment due: the order did not complete.' },
};

const KINDS = { order: ORDER_STATUS, drone: DRONE_STATUS, restaurant: RESTAURANT_STATUS, payment: PAYMENT_STATUS };

export const statusMeta = (kind, status) =>
  KINDS[kind]?.[status] || { label: String(status || '—').replaceAll('_', ' ').toLowerCase(), tone: 'neutral' };

export const FINAL_ORDER_STATUSES = ['COLLECTED', 'CANCELLED', 'REJECTED'];
export const isFinalOrder = (s) => FINAL_ORDER_STATUSES.includes(s);

/** The happy-path journey drawn by the order timeline. Side statuses are handled separately. */
export const ORDER_FLOW = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_DRONE', 'IN_FLIGHT', 'ARRIVED_AT_HUB', 'COLLECTED'];
export const ORDER_FLOW_INDEX = Object.fromEntries(ORDER_FLOW.map((s, i) => [s, i]));
export const isAttentionOrder = (s) => s === 'NEEDS_CUSTOMER_CONFIRMATION' || s === 'ARRIVED_AT_HUB';

