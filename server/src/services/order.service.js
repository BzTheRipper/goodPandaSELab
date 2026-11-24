import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { AVAILABLE_DRONE_STATUSES, CONFIRMATION_TYPES, DRONE_STATUS, ORDER_STATUS as S, PAYMENT_METHODS, PAYMENT_STATUS, RESTAURANT_STATUS, ROLES, STAFF_ROLES } from '../constants.js';
import { Drone, Hub, MenuItem, Message, Order, Restaurant, User } from '../models/index.js';
import { emitToAdmins, emitToHub, emitToUser } from '../realtime.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { audit } from './audit.service.js';
import { flightController } from './drone/index.js';
import { distanceMeters } from './drone/routing.js';
import { notify } from './notification.service.js';
import { applyTransition, awaitingPartyOf, isFinal } from './orderStateMachine.js';
import { createCheckoutSession, expireCheckoutSession, initiatePayment, voidPayment } from './payment.service.js';
import { quoteCoupon, redeemCoupon, releaseCoupon } from './coupon.service.js';
import { refundCredit } from './referral.service.js';
import { getFeeConfig, priceDeliveryFee } from './setting.service.js';

const round2 = (n) => Math.round(n * 100) / 100;

const STATUS_MESSAGES = {
  [S.ACCEPTED]: 'Your order was accepted',
  [S.PREPARING]: 'Your food is being prepared',
  [S.READY_FOR_DRONE]: 'Your food is ready and waiting for a drone',
  [S.IN_FLIGHT]: 'Your food is on its way to the hub',
  [S.ARRIVED_AT_HUB]: 'Your food has arrived at the hub',
  [S.COLLECTED]: 'Order collected. Enjoy!',
  [S.CANCELLED]: 'Order cancelled',
  [S.REJECTED]: 'Order rejected by the restaurant',
  [S.NEEDS_CUSTOMER_CONFIRMATION]: 'The restaurant needs your confirmation',
};

/** "in about 6 minutes" for a future timestamp; returns '' when the estimate has already passed. */
export function etaPhrase(etaAt) {
  if (!etaAt) return '';
  const seconds = Math.round((new Date(etaAt).getTime() - Date.now()) / 1000);
  if (seconds <= 0) return 'any moment now';
  if (seconds < 60) return `in about ${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

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
  // Hub staff can see orders headed to their hub (and history from it).
  if (user.role === ROLES.HUB_OPERATOR) return user.hub && idOf(order.hub) === String(user.hub);
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

/** Pickup secrets go to the customer only; platform margin stays with admins. */
export function serialize(order, role) {
  const json = order.toJSON ? order.toJSON() : { ...order };
  if (role !== ROLES.CUSTOMER) {
    delete json.pickupCode;
    delete json.pickupToken;
  }
  if (role !== ROLES.ADMIN) {
    // The restaurant sees its net payout but never the platform's cut of it.
    delete json.commissionPercent;
    delete json.commissionAmount;
    if (role === ROLES.CUSTOMER) {
      delete json.payoutAmount;
      delete json.payoutStatus;
    }
  }
  if (role !== ROLES.CUSTOMER) {
    // The payment link belongs to the customer's checkout session.
    delete json.paymentUrl;
    delete json.paymentSessionId;
    delete json.paymentIntentId;
  }
  return json;
}

// Staff feed: admins see every order; hub operators only the orders routed to their hub.
function emitOrderToStaff(order) {
  emitToAdmins('order:updated', serialize(order, ROLES.ADMIN));
  emitToHub(idOf(order.hub), 'order:updated', serialize(order, ROLES.HUB_OPERATOR));
}

// Pushes the fresh order to everyone involved and notifies the parties that did not trigger the change.
export async function announce(order, { actorId, title, body, type = 'ORDER_STATUS' } = {}) {
  const customerId = customerIdOf(order);
  const ownerId = ownerIdOf(order);
  emitToUser(customerId, 'order:updated', serialize(order, ROLES.CUSTOMER));
  emitToUser(ownerId, 'order:updated', serialize(order, ROLES.OWNER));
  emitOrderToStaff(order);

  // Only tell the party that did not cause the change.
  const recipients = [customerId, ownerId].filter((id) => id !== String(actorId ?? ''));
  if (!recipients.length) return;

  const base = title ?? STATUS_MESSAGES[order.status] ?? `Order is now ${order.status}`;
  // In-flight updates carry the promised arrival time, which is the whole point for the customer.
  const suffix =
    order.status === S.IN_FLIGHT && order.estimatedArrivalAt ? ` — arriving ${etaPhrase(order.estimatedArrivalAt)}` : '';
  await notify(recipients, {
    type,
    title: `${base}${suffix} (#${String(order._id).slice(-6)})`,
    body: body ?? order.restaurant?.name ?? '',
    order: order._id,
  });
}

/**
 * Detaches the drone from an order and frees it. Drones under maintenance stay there.
 * Also clears the order's own drone reference so cancelled orders don't keep pointing at a drone.
 */
export async function releaseDrone(order) {
  const droneId = order.drone?._id ?? order.drone;
  if (!droneId) return;
  flightController.abort(String(droneId));
  await Drone.updateOne(
    { _id: droneId, currentOrder: order._id, status: { $nin: [DRONE_STATUS.MAINTENANCE, DRONE_STATUS.IN_FLIGHT] } },
    { status: DRONE_STATUS.IDLE, currentOrder: null, destination: null }
  );
  order.drone = null;
  const drone = await Drone.findById(droneId);
  if (drone) emitToAdmins('drone:updated', drone.toJSON());
}

/** Validates + applies a transition, persists it and broadcasts. `actor` null means the system. */
export async function transition(order, to, actor, { note, mutate, announceOpts, afterSave } = {}) {
  const role = actor ? actor.role : ROLES.SYSTEM;
  applyTransition(order, to, { id: actor?._id, role }, note);
  mutate?.(order);
  if (STAFF_ROLES.includes(role)) order.needsAdminIntervention = false;
  // Ground-truth timestamps for prep-time analytics and receipts.
  if (to === S.ACCEPTED && !order.acceptedAt) order.acceptedAt = new Date();
  if (to === S.READY_FOR_DRONE && !order.preparedAt) order.preparedAt = new Date();
  if (to === S.COLLECTED && !order.collectedAt) order.collectedAt = new Date();
  if (to === S.CANCELLED || to === S.REJECTED) {
    voidPayment(order);
    // Nothing is owed to the restaurant for an order that never completed.
    order.payoutStatus = 'VOID';
    // Store credit goes back to the customer's balance, once.
    if (order.creditApplied > 0 && !order.creditRefundedAt) {
      order.creditRefundedAt = new Date();
      await refundCredit(idOf(order.customer), order.creditApplied);
    }
  }
  await order.save();
  if (to === S.CANCELLED || to === S.REJECTED) {
    await expireCheckoutSession(order);
  }
  if (to === S.CANCELLED || to === S.REJECTED) {
    await releaseDrone(order);
    // releaseDrone clears order.drone, so persist that change too.
    await order.save();
  }
  await afterSave?.(order);
  await announce(order, { actorId: actor?._id, ...announceOpts });
  return order;
}

// ---------- creation & listing ----------

/** Re-derives the platform commission and restaurant payout from the current subtotal. */
function applyCommission(order) {
  const percent = order.commissionPercent ?? 0;
  const base = Math.max(0, order.subtotal - (order.discount || 0));
  order.commissionAmount = round2(base * (percent / 100));
  order.payoutAmount = round2(base - order.commissionAmount);
}

function recalc(order) {
  order.subtotal = round2(order.items.filter((i) => !i.removed).reduce((sum, i) => sum + i.price * i.quantity, 0));
  // A shrinking order can't keep a discount larger than what is left to pay.
  order.discount = round2(Math.min(order.discount || 0, order.subtotal));
  order.creditApplied = round2(Math.min(order.creditApplied || 0, Math.max(0, order.subtotal - order.discount)));
  order.total = round2(
    Math.max(0, order.subtotal - order.discount - order.creditApplied + order.deliveryFee)
  );
  // Edits and partial fulfilment change the subtotal, so the payout has to follow it.
  applyCommission(order);
}

/** Merges repeated menu items into one line so the same dish can't appear twice on an order. */
function mergeLines(items) {
  const merged = new Map();
  items.forEach((line) => {
    const key = line.menuItemId;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...line });
      return;
    }
    existing.quantity += line.quantity;
    // Keep both notes rather than silently dropping one.
    if (line.note && existing.note && line.note !== existing.note) existing.note = `${existing.note}; ${line.note}`;
    else if (line.note) existing.note = line.note;
  });
  return [...merged.values()];
}

export async function createOrder(customer, { restaurantId, hubId, items, customerNote, paymentMethod, scheduledFor, couponCode, useCredit }) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant || restaurant.status !== RESTAURANT_STATUS.APPROVED) throw notFound('Restaurant');
  if (!restaurant.isOpen) throw conflict('This restaurant is currently closed', 'RESTAURANT_CLOSED');

  const hub = await Hub.findOne({ _id: hubId, isActive: true });
  if (!hub) throw badRequest('Selected drone hub is not available');

  // Scheduled orders: the time must be in the future.
  let scheduledAt = null;
  if (scheduledFor) {
    scheduledAt = new Date(scheduledFor);
    if (isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      throw badRequest('Scheduled time must be in the future', 'INVALID_SCHEDULE');
    }
  }

  const merged = mergeLines(items);
  const ids = [...new Set(merged.map((i) => i.menuItemId))];
  const menuItems = await MenuItem.find({ _id: { $in: ids }, restaurant: restaurant._id });
  const byId = new Map(menuItems.map((m) => [String(m._id), m]));

  const lines = merged.map((line) => {
    const mi = byId.get(line.menuItemId);
    if (!mi) throw badRequest('Cart contains an item that is not on this restaurant\'s menu');
    if (!mi.isAvailable) throw conflict(`"${mi.name}" is no longer available`, 'ITEM_UNAVAILABLE');
    // Name and price are snapshotted; the client-sent price (if any) is ignored.
    return { menuItem: mi._id, name: mi.name, price: mi.price, quantity: line.quantity, note: line.note };
  });

  const distanceKm = distanceMeters(restaurant.location, hub.location) / 1000;
  const feeConfig = await getFeeConfig();

  // Delivery zone: refuse hubs beyond the configured maximum restaurant→hub distance.
  if (feeConfig.maxDeliveryDistanceKm && distanceKm > feeConfig.maxDeliveryDistanceKm) {
    throw conflict(
      `This hub is ${Math.round(distanceKm * 10) / 10} km away — beyond the ${feeConfig.maxDeliveryDistanceKm} km delivery limit.`,
      'OUT_OF_DELIVERY_ZONE'
    );
  }

  const priced = priceDeliveryFee(feeConfig, distanceKm);

  // Coupons are validated against the server-computed subtotal, never the client's.
  const itemSubtotal = round2(lines.reduce((sum, line) => sum + line.price * line.quantity, 0));
  const couponQuote = couponCode
    ? await quoteCoupon({ code: couponCode, restaurantId: restaurant._id, subtotal: itemSubtotal }, customer._id)
    : null;

  const order = new Order({
    customer: customer._id,
    restaurant: restaurant._id,
    hub: hub._id,
    items: lines,
    customerNote,
    paymentMethod,
    couponId: couponQuote?.coupon._id ?? null,
    couponCode: couponQuote?.code ?? null,
    discount: couponQuote?.discount ?? 0,
    deliveryFee: priced.fee,
    deliveryDistanceKm: priced.distanceKm,
    subtotal: 0,
    total: 0,
    status: S.PLACED,
    scheduledFor: scheduledAt || undefined,
    statusHistory: [{ status: S.PLACED, actor: customer._id, actorRole: ROLES.CUSTOMER }],
  });
  const commissionPercent = feeConfig.platformCommissionPercent ?? 0;
  order.commissionPercent = commissionPercent;
  recalc(order);

  // Store credit is debited atomically before the order is saved; a losing race just means no credit.
  let creditUsed = 0;
  if (useCredit && order.total > 0) {
    const fresh = await User.findById(customer._id).select('creditBalance');
    creditUsed = round2(Math.min(fresh?.creditBalance || 0, order.total));
    if (creditUsed > 0) {
      const debited = await User.findOneAndUpdate(
        { _id: customer._id, creditBalance: { $gte: creditUsed } },
        { $inc: { creditBalance: -creditUsed } }
      );
      if (debited) {
        order.creditApplied = creditUsed;
        recalc(order);
      } else {
        creditUsed = 0;
      }
    }
  }

  initiatePayment(order);
  await order.save();

  // Reserve the coupon use atomically; a race that exhausts it must not leave a discounted order.
  if (couponQuote) {
    try {
      await redeemCoupon(couponQuote.coupon);
    } catch (err) {
      await order.deleteOne();
      if (creditUsed) await refundCredit(customer._id, creditUsed);
      throw err;
    }
  }

  // Online payment is a redirect flow: without a session the order could never be paid.
  if (paymentMethod === PAYMENT_METHODS.ONLINE_PAYMENT) {
    try {
      await createCheckoutSession(order);
    } catch (err) {
      await order.deleteOne();
      if (couponQuote) await releaseCoupon(couponQuote.coupon._id);
      if (creditUsed) await refundCredit(customer._id, creditUsed);
      throw err;
    }
  }

  const full = await loadOrder(order._id);
  emitToUser(restaurant.owner, 'order:new', serialize(full, ROLES.OWNER));
  emitOrderToStaff(full);
  if (!scheduledAt) {
    await notify(restaurant.owner, {
      type: 'NEW_ORDER',
      title: `New order #${String(order._id).slice(-6)}`,
      body: `${lines.length} item(s), total ৳${full.total.toFixed(2)}`,
      order: order._id,
    });
  }
  return full;
}

/**
 * Multi-restaurant checkout: one order per restaurant, sharing a hub and a checkout group id.
 * Each restaurant delivers separately (own drone, own pickup code), so the fee is priced per order.
 * Online payment and coupons are single-order flows and are rejected here on purpose.
 */
export async function createCheckoutGroup(customer, { hubId, customerNote, paymentMethod, scheduledFor, couponCode, groups }) {
  if (groups.length < 2) throw badRequest('A checkout group needs at least two restaurants');
  if (new Set(groups.map((g) => String(g.restaurantId))).size !== groups.length) {
    throw badRequest('Each restaurant can only appear once in a group');
  }
  if (paymentMethod === PAYMENT_METHODS.ONLINE_PAYMENT) {
    throw conflict('Online payment is only available for single-restaurant orders', 'PAYMENT_SINGLE_RESTAURANT');
  }
  if (couponCode) {
    throw conflict('Coupons can only be used on single-restaurant orders', 'COUPON_SINGLE_RESTAURANT');
  }

  const hub = await Hub.findOne({ _id: hubId, isActive: true });
  if (!hub) throw badRequest('Selected drone hub is not available');

  let scheduledAt = null;
  if (scheduledFor) {
    scheduledAt = new Date(scheduledFor);
    if (isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      throw badRequest('Scheduled time must be in the future', 'INVALID_SCHEDULE');
    }
  }

  const feeConfig = await getFeeConfig();
  const prepared = [];

  for (const group of groups) {
    const restaurant = await Restaurant.findById(group.restaurantId);
    if (!restaurant || restaurant.status !== RESTAURANT_STATUS.APPROVED) throw notFound('Restaurant');
    if (!restaurant.isOpen) throw conflict(`"${restaurant.name}" is currently closed`, 'RESTAURANT_CLOSED');

    const merged = mergeLines(group.items);
    const ids = [...new Set(merged.map((i) => i.menuItemId))];
    const menuItems = await MenuItem.find({ _id: { $in: ids }, restaurant: restaurant._id });
    const byId = new Map(menuItems.map((m) => [String(m._id), m]));
    const lines = merged.map((line) => {
      const mi = byId.get(line.menuItemId);
      if (!mi) throw badRequest(`Cart contains an item that is not on ${restaurant.name}'s menu`);
      if (!mi.isAvailable) throw conflict(`"${mi.name}" is no longer available`, 'ITEM_UNAVAILABLE');
      return { menuItem: mi._id, name: mi.name, price: mi.price, quantity: line.quantity, note: line.note };
    });

    const distanceKm = distanceMeters(restaurant.location, hub.location) / 1000;
    if (feeConfig.maxDeliveryDistanceKm && distanceKm > feeConfig.maxDeliveryDistanceKm) {
      throw conflict(
        `${restaurant.name} is ${Math.round(distanceKm * 10) / 10} km from this hub — beyond the ${feeConfig.maxDeliveryDistanceKm} km delivery limit.`,
        'OUT_OF_DELIVERY_ZONE'
      );
    }
    prepared.push({ restaurant, lines, distanceKm, priced: priceDeliveryFee(feeConfig, distanceKm) });
  }

  const checkoutGroup = new mongoose.Types.ObjectId();
  const commissionPercent = feeConfig.platformCommissionPercent ?? 0;
  const created = [];
  try {
    for (const item of prepared) {
      const order = new Order({
        customer: customer._id,
        restaurant: item.restaurant._id,
        hub: hub._id,
        checkoutGroup,
        items: item.lines,
        customerNote,
        paymentMethod: PAYMENT_METHODS.CASH_ON_COLLECTION,
        deliveryFee: item.priced.fee,
        deliveryDistanceKm: item.priced.distanceKm,
        subtotal: 0,
        total: 0,
        status: S.PLACED,
        scheduledFor: scheduledAt || undefined,
        statusHistory: [{ status: S.PLACED, actor: customer._id, actorRole: ROLES.CUSTOMER }],
      });
      order.commissionPercent = commissionPercent;
      recalc(order);
      initiatePayment(order);
      await order.save();
      created.push(order);
    }
  } catch (err) {
    // No multi-document transaction on a standalone Mongo: compensate by deleting what we made.
    await Order.deleteMany({ _id: { $in: created.map((o) => o._id) } });
    throw err;
  }

  const full = [];
  for (const order of created) {
    const loaded = await loadOrder(order._id);
    full.push(loaded);
    emitToUser(ownerIdOf(loaded), 'order:new', serialize(loaded, ROLES.OWNER));
    emitOrderToStaff(loaded);
    if (!scheduledAt) {
      await notify(ownerIdOf(loaded), {
        type: 'NEW_ORDER',
        title: `New order #${String(loaded._id).slice(-6)}`,
        body: `${loaded.items.length} item(s), total ৳${loaded.total.toFixed(2)}`,
        order: loaded._id,
      });
    }
  }
  return { checkoutGroup: String(checkoutGroup), orders: full };
}

/**
 * Wakes up scheduled orders whose slot has arrived: tells the restaurant and the customer once.
 * Safe to call repeatedly (and from multiple processes) because the row is claimed atomically.
 */
export async function releaseDueScheduledOrders() {
  const due = await Order.find({
    status: S.PLACED,
    scheduledFor: { $ne: null, $lte: new Date() },
    scheduledNotifiedAt: null,
  })
    .select('_id')
    .limit(50);

  for (const { _id } of due) {
    const claimed = await Order.findOneAndUpdate(
      { _id, scheduledNotifiedAt: null },
      { scheduledNotifiedAt: new Date() },
      { new: true }
    );
    if (!claimed) continue;
    const full = await loadOrder(_id);
    const count = full.items.filter((i) => !i.removed).length;
    emitToUser(ownerIdOf(full), 'order:new', serialize(full, ROLES.OWNER));
    await notify(ownerIdOf(full), {
      type: 'NEW_ORDER',
      title: `Scheduled order #${String(_id).slice(-6)} is due`,
      body: `${count} item(s), total ৳${full.total.toFixed(2)}. The customer scheduled it for now.`,
      order: _id,
    });
    await notify(customerIdOf(full), {
      type: 'ORDER_STATUS',
      title: 'Your scheduled order was sent to the restaurant',
      body: `${full.restaurant?.name || 'The restaurant'} will accept it shortly.`,
      order: _id,
    });
  }
  return due.length;
}

/** Server-side paginated list. `page` is 1-based; admins may filter by a free-text term. */export async function listForUser(user, { status, needsIntervention, page = 1, limit = 20, q } = {}) {
  const filter = {};
  if (user.role === ROLES.CUSTOMER) filter.customer = user._id;
  if (user.role === ROLES.HUB_OPERATOR) {
    if (!user.hub) return { items: [], page: 1, limit, total: 0, pages: 0 };
    filter.hub = user.hub;
  }
  if (user.role === ROLES.OWNER) {
    const restaurant = await Restaurant.findOne({ owner: user._id });
    if (!restaurant) return { items: [], page: 1, limit, total: 0, pages: 0 };
    filter.restaurant = restaurant._id;
  }
  if (status) filter.status = status;
  if (needsIntervention === 'true') filter.needsAdminIntervention = true;

  // Scheduled orders that haven't reached their time are hidden from the restaurant's active list.
  const now = new Date();
  const ownerScheduledFilter =
    user.role === ROLES.OWNER
      ? { $or: [{ scheduledFor: null }, { scheduledFor: { $lte: now } }] }
      : {};

  const and = [];
  if (Object.keys(ownerScheduledFilter).length) and.push(ownerScheduledFilter);
  if (q) {
    const term = String(q).trim();
    const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    // Resolve related documents so admins can search by restaurant/customer name, not just ids.
    const [restaurants, customers] = await Promise.all([
      Restaurant.find({ name: rx }).select('_id').limit(50),
      user.role === ROLES.ADMIN ? User.find({ $or: [{ name: rx }, { phone: rx }] }).select('_id').limit(50) : [],
    ]);
    const or = [
      { cancellationReason: rx },
      { interventionReason: rx },
      { restaurant: { $in: restaurants.map((r) => r._id) } },
      ...(customers.length ? [{ customer: { $in: customers.map((c) => c._id) } }] : []),
    ];
    // Order ids are hex; the UI shows the last 6 characters, so match that suffix too.
    const hex = term.replace(/^#/, '');
    if (/^[a-f\d]{6,24}$/i.test(hex)) {
      or.push({ _id: { $regex: `${hex}$`, $options: 'i' } });
    }
    and.push({ $or: or });
  }
  if (and.length) filter.$and = and;

  const size = Math.min(Number(limit) || 20, 100);
  const current = Math.max(1, Number(page) || 1);
  const [items, total] = await Promise.all([
    Order.find(filter)
      .populate('restaurant', 'name phone owner')
      .populate('customer', 'name phone')
      .populate('hub', 'name')
      .populate('drone', 'identifier status')
      .populate('review', 'rating')
      .sort({ createdAt: -1 })
      .skip((current - 1) * size)
      .limit(size),
    Order.countDocuments(filter),
  ]);

  return { items, page: current, limit: size, total, pages: Math.max(1, Math.ceil(total / size)) };
}

// ---------- simple status changes ----------

export async function updateStatus(user, id, { status, reason }) {
  const order = await getForUser(user, id);

  if (status === S.REJECTED && !reason) throw badRequest('A reason is required to reject an order');
  if (status === S.CANCELLED && STAFF_ROLES.includes(user.role) && !reason) throw badRequest('A reason is required to force-cancel');

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
    // One announcement only: the bounce-back gets its own title instead of a second update.
    announceOpts: resettingFlight ? { title: 'Delivery is being re-arranged' } : undefined,
    // Admin recovery: stop the flight and hand the drone back so the owner can re-dispatch.
    afterSave: resettingFlight
      ? async (o) => {
          await releaseDrone(o);
          await o.save();
        }
      : undefined,
  });

  if (STAFF_ROLES.includes(user.role) && (status === S.CANCELLED || status === S.READY_FOR_DRONE)) {
    await audit({
      actor: user,
      action: status === S.CANCELLED ? 'ORDER_FORCE_CANCELLED' : 'ORDER_RETURNED_TO_RESTAURANT',
      targetType: 'order',
      target: order._id,
      summary: reason || '',
    });
  }
  return order;
}

// ---------- online payment ----------

/** Returns a payable Checkout URL for an unpaid online order, creating a session if needed. */
export async function paymentLink(user, id) {
  const order = await getForUser(user, id);
  if (customerIdOf(order) !== String(user._id)) throw forbidden('Only the customer can pay for this order');
  if (order.paymentMethod !== PAYMENT_METHODS.ONLINE_PAYMENT) throw badRequest('This order is paid in cash at the hub');
  if (order.paymentStatus === PAYMENT_STATUS.PAID) throw conflict('This order is already paid');
  if (isFinal(order.status)) throw conflict('This order can no longer be paid', 'INVALID_TRANSITION');
  if (!order.paymentUrl) await createCheckoutSession(order);
  return { url: order.paymentUrl };
}

// ---------- no-show reporting ----------

/**
 * Closes an uncollected order. Cash never moved, so the payment is voided and the payout cancelled;
 * the customer's no-show counter feeds the admin risk view.
 */
export async function reportNoShow(user, id) {
  const order = await loadOrder(id);
  if (order.status !== S.ARRIVED_AT_HUB) {
    throw conflict('Only an order waiting at the hub can be marked as not collected', 'INVALID_TRANSITION');
  }
  if (user.role === ROLES.HUB_OPERATOR && String(user.hub || '') !== String(order.hub._id)) {
    throw forbidden('This order belongs to a different hub');
  }
  if (order.noShowReportedAt) throw conflict('This order was already reported as a no-show', 'DUPLICATE');

  await transition(order, S.CANCELLED, user, {
    note: 'Customer did not collect the order',
    mutate: (o) => {
      o.noShowReportedAt = new Date();
      o.noShowReportedBy = user._id;
    },
    announceOpts: { title: 'Order marked as not collected' },
  });
  await User.updateOne({ _id: order.customer }, { $inc: { noShowCount: 1 } });
  await audit({
    actor: user,
    action: 'ORDER_NO_SHOW',
    targetType: 'order',
    target: order._id,
    summary: `#${String(order._id).slice(-6)} not collected at ${order.hub.name}`,
  });
  await notify(order.customer, {
    type: 'ORDER_STATUS',
    title: 'Your order was marked as not collected',
    body: `Order #${String(order._id).slice(-6)} was closed at ${order.hub.name}. Contact support if this is a mistake.`,
    order: order._id,
  }).catch(() => {});
  return loadOrder(order._id);
}

// ---------- order modification before acceptance ----------

/** The customer may add/remove items on a PLACED order before the restaurant accepts. */
export async function modifyOrder(user, id, { items, customerNote }) {
  const order = await getForUser(user, id);
  if (user.role !== ROLES.CUSTOMER || customerIdOf(order) !== String(user._id)) {
    throw forbidden('Only the customer who placed this order can modify it');
  }
  if (order.status !== S.PLACED) {
    throw conflict('Orders can only be modified before the restaurant accepts them', 'NOT_PLACED');
  }

  const merged = mergeLines(items);
  const ids = [...new Set(merged.map((i) => i.menuItemId))];
  const menuItems = await MenuItem.find({ _id: { $in: ids }, restaurant: order.restaurant._id });
  const byId = new Map(menuItems.map((m) => [String(m._id), m]));

  const lines = merged.map((line) => {
    const mi = byId.get(line.menuItemId);
    if (!mi) throw badRequest('Cart contains an item that is not on this restaurant\'s menu');
    if (!mi.isAvailable) throw conflict(`"${mi.name}" is no longer available`, 'ITEM_UNAVAILABLE');
    return { menuItem: mi._id, name: mi.name, price: mi.price, quantity: line.quantity, note: line.note };
  });

  order.items = lines;
  order.customerNote = customerNote ?? order.customerNote;
  recalc(order);
  await order.save();

  const full = await loadOrder(order._id);
  await announce(order, { actorId: user._id, type: 'ORDER_MODIFIED' });
  return full;
}

// ---------- unavailable item / unmet note flow ----------

export async function requestConfirmation(user, id, { type, message, itemIds }) {
  const order = await loadOrder(id);
  assertRole(user, order, ROLES.OWNER);

  const activeItems = order.items.filter((i) => !i.removed);
  if (type === CONFIRMATION_TYPES.ITEM_UNAVAILABLE) {
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
        itemIds: type === CONFIRMATION_TYPES.ITEM_UNAVAILABLE ? itemIds : [],
        previousStatus,
        requestedAt: new Date(),
        awaiting: 'CUSTOMER',
        resolution: null,
      };
      o.items.forEach((i) => {
        i.unavailable = type === CONFIRMATION_TYPES.ITEM_UNAVAILABLE && itemIds.includes(String(i._id));
      });
    },
    announceOpts: { type: 'CONFIRMATION_REQUESTED', body: message },
  });

  // Mirror the request into the chat so the conversation has context.
  const label = type === CONFIRMATION_TYPES.ITEM_UNAVAILABLE ? 'Item unavailable' : "Can't fully satisfy request";
  await postMessage(user, order, `[${label}] ${message}`);
  return order;
}

/**
 * The customer asks the restaurant to cancel after acceptance. The order pauses and the restaurant
 * decides; this is the only cancellation route open to a customer once the order is ACCEPTED.
 */
export async function requestCancellation(user, id, { message }) {
  const order = await loadOrder(id);
  assertRole(user, order, ROLES.CUSTOMER);
  if (![S.ACCEPTED, S.PREPARING].includes(order.status)) {
    throw conflict('You can only request a cancellation while the order is accepted or being prepared', 'INVALID_TRANSITION');
  }

  const previousStatus = order.status;
  await transition(order, S.NEEDS_CUSTOMER_CONFIRMATION, user, {
    note: message,
    mutate: (o) => {
      o.confirmationRequest = {
        type: CONFIRMATION_TYPES.CANCEL_REQUEST,
        message,
        itemIds: [],
        previousStatus,
        requestedAt: new Date(),
        awaiting: 'OWNER',
        resolution: null,
      };
    },
    announceOpts: { type: 'CANCEL_REQUESTED', title: 'The customer asked to cancel', body: message },
  });
  await postMessage(user, order, `[Cancellation request] ${message}`);
  return order;
}

export async function respondConfirmation(user, id, { decision }) {
  const order = await loadOrder(id);
  assertRole(user, order, ROLES.CUSTOMER);
  const req = order.confirmationRequest;
  if (order.status !== S.NEEDS_CUSTOMER_CONFIRMATION || !req || req.resolution) {
    throw conflict('There is no pending confirmation request on this order', 'INVALID_TRANSITION');
  }
  if (req.type === CONFIRMATION_TYPES.CANCEL_REQUEST) {
    throw forbidden('Only the restaurant can answer a cancellation request');
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

  if (req.type === CONFIRMATION_TYPES.ITEM_UNAVAILABLE) {
    const remaining = order.items.filter((i) => !i.removed && !i.unavailable);
    if (!remaining.length) throw conflict('Every item is unavailable, so the order can only be cancelled', 'NOTHING_LEFT');
  }

  return transition(order, req.previousStatus, user, {
    note: 'Customer agreed to continue',
    mutate: (o) => {
      if (req.type === CONFIRMATION_TYPES.ITEM_UNAVAILABLE) {
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

/** The restaurant answers the customer's cancellation request: cancel the order or carry on. */
export async function respondCancellation(user, id, { decision, reason }) {
  const order = await loadOrder(id);
  assertRole(user, order, ROLES.OWNER);
  const req = order.confirmationRequest;
  if (order.status !== S.NEEDS_CUSTOMER_CONFIRMATION || !req || req.resolution) {
    throw conflict('There is no pending cancellation request on this order', 'INVALID_TRANSITION');
  }
  if (req.type !== CONFIRMATION_TYPES.CANCEL_REQUEST) {
    throw conflict('This order is waiting on the customer, not the restaurant', 'INVALID_TRANSITION');
  }

  if (decision === 'CANCEL') {
    return transition(order, S.CANCELLED, user, {
      note: reason || 'Restaurant accepted the cancellation request',
      mutate: (o) => {
        o.cancellationReason = reason || 'Restaurant accepted the cancellation request';
        o.confirmationRequest.resolution = 'CANCELLED';
        o.confirmationRequest.resolvedAt = new Date();
      },
      announceOpts: { title: 'The restaurant cancelled your order' },
    });
  }

  return transition(order, req.previousStatus, user, {
    note: reason || 'Restaurant declined the cancellation request',
    mutate: (o) => {
      o.confirmationRequest.resolution = 'CONTINUED';
      o.confirmationRequest.resolvedAt = new Date();
    },
    announceOpts: {
      title: 'The restaurant will continue your order',
      body: reason || 'Message them in the order chat if you need to change something.',
      type: 'CANCEL_DECLINED',
    },
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
  if (STAFF_ROLES.includes(user.role)) throw forbidden('Staff can read but not send order chat messages');
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

/** Six digits keeps the code space large enough that guessing one in a few tries is not viable. */
export const generatePickupCode = () => String(crypto.randomInt(100000, 1000000));

/** The QR secret: long, random, and only ever shown to the customer. */
export const generatePickupToken = () => crypto.randomBytes(16).toString('hex');

/**
 * Printable receipt for cash reconciliation. Participants only; staff see the collector,
 * customers see their own copy. Everything needed to reconcile a cash drawer is on it.
 */
export async function getReceipt(user, id) {
  const order = await loadOrder(id);
  assertCanView(user, order);
  if (order.status !== S.COLLECTED) throw conflict('A receipt exists once the order has been collected', 'NOT_COLLECTED');
  const collector = order.statusHistory.find((h) => h.status === S.COLLECTED)?.actor;
  const collectorUser = collector ? await User.findById(collector).select('name role') : null;
  const minutesBetween = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)) : null);
  return {
    number: `GP-${String(order._id).slice(-6).toUpperCase()}`,
    order: order._id,
    issuedAt: order.collectedAt || order.updatedAt,
    restaurant: { name: order.restaurant.name, address: order.restaurant.address, phone: order.restaurant.phone },
    hub: { name: order.hub.name, address: order.hub.address },
    customer: { name: order.customer.name, phone: order.customer.phone },
    items: order.items.filter((i) => !i.removed).map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, lineTotal: i.price * i.quantity })),
    subtotal: order.subtotal,
    discount: order.discount || 0,
    couponCode: order.couponCode || null,
    deliveryFee: order.deliveryFee,
    deliveryDistanceKm: order.deliveryDistanceKm,
    total: order.total,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    collectedBy: collectorUser ? { name: collectorUser.name, role: collectorUser.role } : null,
    timeline: {
      placedAt: order.createdAt,
      acceptedAt: order.acceptedAt,
      preparedAt: order.preparedAt,
      dispatchedAt: order.dispatchedAt,
      arrivedAt: order.arrivedAt,
      collectedAt: order.collectedAt,
      prepMinutes: minutesBetween(order.acceptedAt, order.preparedAt),
      flightMinutes: minutesBetween(order.dispatchedAt, order.arrivedAt),
    },
  };
}

export { awaitingPartyOf, CONFIRMATION_TYPES, AVAILABLE_DRONE_STATUSES };
