import crypto from 'node:crypto';
import { DRONE_STATUS, ORDER_STATUS as S, RESTAURANT_STATUS, ROLES } from '../constants.js';
import { Drone, Hub, MenuItem, Message, Order, Restaurant } from '../models/index.js';
import { emitToAdmins, emitToUser } from '../realtime.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { flightController } from './drone/index.js';
import { notify } from './notification.service.js';
import { applyTransition, isFinal } from './orderStateMachine.js';
import { initiatePayment, voidPayment } from './payment.service.js';
import { getDeliveryFee } from './setting.service.js';

const round2 = (n) => Math.round(n * 100) / 100;

const STATUS_MESSAGES = {
  [S.ACCEPTED]: 'Your order was accepted',
  [S.PREPARING]: 'Your food is being prepared',
  [S.READY_FOR_DRONE]: 'Your food is ready and waiting for a drone',
  [S.IN_FLIGHT]: 'Your food is flying to the hub',
  [S.ARRIVED_AT_HUB]: 'Your food has arrived at the hub',
  [S.COLLECTED]: 'Order collected. Enjoy!',
  [S.CANCELLED]: 'Order cancelled',
  [S.REJECTED]: 'Order rejected by the restaurant',
  [S.NEEDS_CUSTOMER_CONFIRMATION]: 'The restaurant needs your confirmation',
};

// ---------- loading & access ----------

export async function loadOrder(id) {
  const order = await Order.findById(id)
    .populate('restaurant', 'name phone address owner location')
    .populate('customer', 'name phone')
    .populate('hub')
    .populate('drone')
    .populate('review', 'rating comment reply createdAt');
  if (!order) throw notFound('Order');
  return order;
}

const idOf = (ref) => String(ref?._id ?? ref);
export const customerIdOf = (order) => idOf(order.customer);
export const ownerIdOf = (order) => idOf(order.restaurant.owner);

export function isParticipant(user, order) {
  const uid = String(user._id);
  if (user.role === ROLES.ADMIN) return true;
  if (user.role === ROLES.CUSTOMER) return customerIdOf(order) === uid;
  if (user.role === ROLES.OWNER) return ownerIdOf(order) === uid;
  return false;
}

export function assertCanView(user, order) {
  if (!isParticipant(user, order)) throw forbidden('This order does not belong to you');
}

function assertRole(user, order, role) {
  assertCanView(user, order);
  if (user.role !== role) throw forbidden(`Only the ${role} can do this`);
}

export async function getForUser(user, id) {
  const order = await loadOrder(id);
  assertCanView(user, order);
  return order;
}

/** Pickup code is only revealed to the customer; the hub operator (admin) must be told it. */
export function serialize(order, role) {
  const json = order.toJSON ? order.toJSON() : order;
  if (role !== ROLES.CUSTOMER) delete json.pickupCode;
  return json;
}

// Pushes the fresh order to everyone involved and notifies the parties that did not trigger the change.
export async function announce(order, { actorId, title, body, type = 'ORDER_STATUS' } = {}) {
  const customerId = customerIdOf(order);
  const ownerId = ownerIdOf(order);
  emitToUser(customerId, 'order:updated', serialize(order, ROLES.CUSTOMER));
  emitToUser(ownerId, 'order:updated', serialize(order, ROLES.OWNER));
  emitToAdmins('order:updated', serialize(order, ROLES.ADMIN));

  const recipients = [customerId, ownerId].filter((id) => id !== String(actorId ?? ''));
  const text = title ?? STATUS_MESSAGES[order.status] ?? `Order is now ${order.status}`;
  await notify(recipients, {
    type,
    title: `${text} (#${String(order._id).slice(-6)})`,
    body: body ?? order.restaurant?.name ?? '',
    order: order._id,
  });
}

/** Frees the drone attached to an order (used on cancel / admin reset). Drones under maintenance stay there. */
export async function releaseDrone(order) {
  const droneId = order.drone?._id ?? order.drone;
  if (!droneId) return;
  flightController.abort(String(droneId));
  await Drone.updateOne(
    { _id: droneId, currentOrder: order._id, status: { $ne: DRONE_STATUS.MAINTENANCE } },
    { status: DRONE_STATUS.IDLE, currentOrder: null, destination: null }
  );
  await Drone.updateOne({ _id: droneId, currentOrder: order._id }, { currentOrder: null, destination: null });
  const drone = await Drone.findById(droneId);
  if (drone) emitToAdmins('drone:updated', drone.toJSON());
}

/** Validates + applies a transition, persists it and broadcasts. `actor` null means the system. */
export async function transition(order, to, actor, { note, mutate, announceOpts } = {}) {
  const role = actor ? actor.role : ROLES.SYSTEM;
  applyTransition(order, to, { id: actor?._id, role }, note);
  mutate?.(order);
  if (role === ROLES.ADMIN) order.needsAdminIntervention = false;
  if (to === S.CANCELLED || to === S.REJECTED) voidPayment(order);
  await order.save();
  if (to === S.CANCELLED || to === S.REJECTED) await releaseDrone(order);
  await announce(order, { actorId: actor?._id, ...announceOpts });
  return order;
}

// ---------- creation & listing ----------

function recalc(order) {
  order.subtotal = round2(order.items.filter((i) => !i.removed).reduce((sum, i) => sum + i.price * i.quantity, 0));
  order.total = round2(order.subtotal + order.deliveryFee);
}

export async function createOrder(customer, { restaurantId, hubId, items, customerNote, paymentMethod }) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant || restaurant.status !== RESTAURANT_STATUS.APPROVED) throw notFound('Restaurant');
  if (!restaurant.isOpen) throw conflict('This restaurant is currently closed', 'RESTAURANT_CLOSED');

  const hub = await Hub.findOne({ _id: hubId, isActive: true });
  if (!hub) throw badRequest('Selected drone hub is not available');

  const ids = [...new Set(items.map((i) => i.menuItemId))];
  const menuItems = await MenuItem.find({ _id: { $in: ids }, restaurant: restaurant._id });
  const byId = new Map(menuItems.map((m) => [String(m._id), m]));

  const lines = items.map((line) => {
    const mi = byId.get(line.menuItemId);
    if (!mi) throw badRequest('Cart contains an item that is not on this restaurant\'s menu');
    if (!mi.isAvailable) throw conflict(`"${mi.name}" is no longer available`, 'ITEM_UNAVAILABLE');
    // Name and price are snapshotted; the client-sent price (if any) is ignored.
    return { menuItem: mi._id, name: mi.name, price: mi.price, quantity: line.quantity, note: line.note };
  });

  const order = new Order({
    customer: customer._id,
    restaurant: restaurant._id,
    hub: hub._id,
    items: lines,
    customerNote,
    paymentMethod,
    deliveryFee: await getDeliveryFee(),
    subtotal: 0,
    total: 0,
    status: S.PLACED,
    statusHistory: [{ status: S.PLACED, actor: customer._id, actorRole: ROLES.CUSTOMER }],
  });
  recalc(order);
  initiatePayment(order);
  await order.save();

  const full = await loadOrder(order._id);
  emitToUser(restaurant.owner, 'order:new', serialize(full, ROLES.OWNER));
  emitToAdmins('order:updated', serialize(full, ROLES.ADMIN));
  await notify(restaurant.owner, {
    type: 'NEW_ORDER',
    title: `New order #${String(order._id).slice(-6)}`,
    body: `${lines.length} item(s), total ৳${full.total.toFixed(2)}`,
    order: order._id,
  });
  return full;
}

export async function listForUser(user, { status, needsIntervention } = {}) {
  const filter = {};
  if (user.role === ROLES.CUSTOMER) filter.customer = user._id;
  if (user.role === ROLES.OWNER) {
    const restaurant = await Restaurant.findOne({ owner: user._id });
    if (!restaurant) return [];
    filter.restaurant = restaurant._id;
  }
  if (status) filter.status = status;
  if (needsIntervention === 'true') filter.needsAdminIntervention = true;
  return Order.find(filter)
    .populate('restaurant', 'name phone owner')
    .populate('customer', 'name phone')
    .populate('hub', 'name')
    .populate('drone', 'identifier status')
    .populate('review', 'rating')
    .sort({ createdAt: -1 })
    .limit(200);
}

// ---------- simple status changes ----------

export async function updateStatus(user, id, { status, reason }) {
  const order = await getForUser(user, id);

  if (status === S.REJECTED && !reason) throw badRequest('A reason is required to reject an order');
  if (status === S.CANCELLED && user.role === ROLES.ADMIN && !reason) throw badRequest('A reason is required to force-cancel');

  const resettingFlight = order.status === S.IN_FLIGHT && status === S.READY_FOR_DRONE;

  await transition(order, status, user, {
    note: reason,
    mutate: (o) => {
      if (status === S.REJECTED) o.rejectionReason = reason;
      if (status === S.CANCELLED) {
        o.cancellationReason = reason || `Cancelled by ${user.role}`;
        if (o.confirmationRequest && !o.confirmationRequest.resolution) {
          o.confirmationRequest.resolution = 'CANCELLED';
          o.confirmationRequest.resolvedAt = new Date();
        }
      }
    },
  });

  if (resettingFlight) {
    await releaseDrone(order);
    order.drone = null;
    await order.save();
    await announce(order, { actorId: user._id, title: 'Delivery is being re-arranged' });
  }
  return order;
}

// ---------- unavailable item / unmet note flow ----------

export async function requestConfirmation(user, id, { type, message, itemIds }) {
  const order = await loadOrder(id);
  assertRole(user, order, ROLES.OWNER);

  const activeItems = order.items.filter((i) => !i.removed);
  if (type === 'ITEM_UNAVAILABLE') {
    if (!itemIds.length) throw badRequest('Select at least one unavailable item');
    const known = new Set(activeItems.map((i) => String(i._id)));
    if (!itemIds.every((iid) => known.has(iid))) throw badRequest('Unknown item in this order');
  }

  const previousStatus = order.status;
  await transition(order, S.NEEDS_CUSTOMER_CONFIRMATION, user, {
    note: message,
    mutate: (o) => {
      o.confirmationRequest = {
        type,
        message,
        itemIds: type === 'ITEM_UNAVAILABLE' ? itemIds : [],
        previousStatus,
        requestedAt: new Date(),
        resolution: null,
      };
      o.items.forEach((i) => {
        i.unavailable = type === 'ITEM_UNAVAILABLE' && itemIds.includes(String(i._id));
      });
    },
    announceOpts: { type: 'CONFIRMATION_REQUESTED', body: message },
  });

  // Mirror the request into the chat so the conversation has context.
  const label = type === 'ITEM_UNAVAILABLE' ? 'Item unavailable' : "Can't fully satisfy request";
  await postMessage(user, order, `[${label}] ${message}`);
  return order;
}

export async function respondConfirmation(user, id, { decision }) {
  const order = await loadOrder(id);
  assertRole(user, order, ROLES.CUSTOMER);
  const req = order.confirmationRequest;
  if (order.status !== S.NEEDS_CUSTOMER_CONFIRMATION || !req || req.resolution) {
    throw conflict('There is no pending confirmation request on this order', 'INVALID_TRANSITION');
  }

  if (decision === 'CANCEL') {
    return transition(order, S.CANCELLED, user, {
      note: 'Customer declined after confirmation request',
      mutate: (o) => {
        o.cancellationReason = 'Customer declined after confirmation request';
        o.confirmationRequest.resolution = 'CANCELLED';
        o.confirmationRequest.resolvedAt = new Date();
      },
    });
  }

  if (req.type === 'ITEM_UNAVAILABLE') {
    const remaining = order.items.filter((i) => !i.removed && !i.unavailable);
    if (!remaining.length) throw conflict('Every item is unavailable, so the order can only be cancelled', 'NOTHING_LEFT');
  }

  return transition(order, req.previousStatus, user, {
    note: 'Customer agreed to continue',
    mutate: (o) => {
      if (req.type === 'ITEM_UNAVAILABLE') {
        o.items.forEach((i) => {
          if (i.unavailable) i.removed = true;
        });
        recalc(o);
      }
      o.confirmationRequest.resolution = 'CONTINUED';
      o.confirmationRequest.resolvedAt = new Date();
    },
    announceOpts: { title: 'Customer agreed to continue the order', type: 'CONFIRMATION_RESOLVED' },
  });
}

// ---------- chat ----------

export async function listMessages(user, id) {
  const order = await getForUser(user, id);
  return Message.find({ order: order._id }).populate('sender', 'name role').sort({ createdAt: 1 });
}

async function postMessage(user, order, text) {
  const msg = await Message.create({ order: order._id, sender: user._id, senderRole: user.role, text });
  await msg.populate('sender', 'name role');
  const payload = msg.toJSON();
  // Deliver to both participants' personal rooms and to admins watching the order.
  const recipients = new Set([customerIdOf(order), ownerIdOf(order)]);
  recipients.forEach((uid) => emitToUser(uid, 'chat:message', payload));
  emitToAdmins('chat:message', payload);
  return msg;
}

export async function sendMessage(user, id, { text }) {
  const order = await getForUser(user, id);
  if (user.role === ROLES.ADMIN) throw forbidden('Admins can read but not send order chat messages');
  if (isFinal(order.status)) throw new AppError(409, 'Chat is closed for finished orders', 'CHAT_CLOSED');
  const msg = await postMessage(user, order, text);
  const other = user.role === ROLES.CUSTOMER ? ownerIdOf(order) : customerIdOf(order);
  await notify(other, {
    type: 'NEW_MESSAGE',
    title: `New message from ${user.name} (#${String(order._id).slice(-6)})`,
    body: text.slice(0, 120),
    order: order._id,
  });
  return msg;
}

export const generatePickupCode = () => String(crypto.randomInt(100000, 1000000));
