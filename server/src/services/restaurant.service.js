import { ORDER_STATUS, RESTAURANT_STATUS } from '../constants.js';
import { MenuItem, Order, Restaurant, Review } from '../models/index.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { audit } from './audit.service.js';
import { storage } from './storage.service.js';
import { notify } from './notification.service.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SORTS = {
  recommended: { isOpen: -1, ratingAvg: -1, name: 1 },
  rating: { ratingAvg: -1, ratingCount: -1, name: 1 },
  name: { name: 1 },
};

export async function listPublic({ q, category, sort = 'recommended', openNow } = {}) {
  const filter = { status: RESTAURANT_STATUS.APPROVED };
  if (openNow === 'true') filter.isOpen = true;
  const and = [];
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    // Match restaurant name/categories, or restaurants with an available dish of that name or category.
    const withDish = await MenuItem.distinct('restaurant', { isAvailable: true, $or: [{ category: rx }, { name: rx }] });
    and.push({ $or: [{ name: rx }, { categories: rx }, { _id: { $in: withDish } }] });
  }
  if (category) {
    const rx = new RegExp(`^${escapeRegex(category)}$`, 'i');
    const withCategory = await MenuItem.distinct('restaurant', { category: rx });
    and.push({ $or: [{ categories: rx }, { _id: { $in: withCategory } }] });
  }
  if (and.length) filter.$and = and;
  return Restaurant.find(filter).select('-documents').sort(SORTS[sort] || SORTS.recommended);
}

export async function getPublic(id) {
  const restaurant = await Restaurant.findOne({ _id: id, status: RESTAURANT_STATUS.APPROVED }).select('-documents');
  if (!restaurant) throw notFound('Restaurant');
  const menu = await MenuItem.find({ restaurant: id, isAvailable: true }).sort({ category: 1, name: 1 });
  return { restaurant, menu };
}

/**
 * Small personalised rail: saved restaurants and places the customer already collected from,
 * then open + top-rated as filler. Guests get the plain top-rated/open list.
 */
export async function recommended(user, { limit = 6 } = {}) {
  const approved = await Restaurant.find({ status: RESTAURANT_STATUS.APPROVED }).limit(60);
  let savedIds = new Set();
  let orderedIds = new Set();
  if (user) {
    savedIds = new Set((user.favorites || []).map(String));
    const recent = await Order.find({ customer: user._id, status: ORDER_STATUS.COLLECTED })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('restaurant');
    orderedIds = new Set(recent.map((o) => String(o.restaurant)));
  }

  const score = (r) => {
    const id = String(r._id);
    let value = 0;
    if (savedIds.has(id)) value += 5;
    if (orderedIds.has(id)) value += 3;
    if (r.isOpen) value += 1;
    return value + (r.ratingAvg || 0);
  };
  return approved
    .sort((a, b) => score(b) - score(a) || (b.ratingCount || 0) - (a.ratingCount || 0))
    .slice(0, limit)
    .map((r) => ({ ...r.toObject(), reason: savedIds.has(String(r._id)) ? 'saved' : orderedIds.has(String(r._id)) ? 'ordered' : 'top' }));
}

export async function getOwned(ownerId) {
  const restaurant = await Restaurant.findOne({ owner: ownerId });
  if (!restaurant) throw notFound('Restaurant profile (create it first)');
  return restaurant;
}

export const findOwned = (ownerId) => Restaurant.findOne({ owner: ownerId });

/**
 * Payout statement for one restaurant: what the platform took and what is still owed.
 * Only collected orders are payable, so cancelled or rejected orders never appear here.
 */
export async function earningsReport(ownerId) {
  const restaurant = await getOwned(ownerId);
  const match = { restaurant: restaurant._id, status: ORDER_STATUS.COLLECTED };

  const [summary] = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        orders: { $sum: 1 },
        gross: { $sum: '$subtotal' },
        commission: { $sum: '$commissionAmount' },
        net: { $sum: '$payoutAmount' },
        pending: { $sum: { $cond: [{ $eq: ['$payoutStatus', 'PENDING'] }, '$payoutAmount', 0] } },
        paid: { $sum: { $cond: [{ $eq: ['$payoutStatus', 'PAID'] }, '$payoutAmount', 0] } },
      },
    },
  ]);

  const recent = await Order.find(match)
    .sort({ collectedAt: -1 })
    .limit(10)
    .select('subtotal commissionPercent commissionAmount payoutAmount payoutStatus payoutAt collectedAt');

  const round2 = (n) => Math.round((n || 0) * 100) / 100;
  return {
    restaurant: { _id: restaurant._id, name: restaurant.name },
    commissionPercent: recent[0]?.commissionPercent ?? null,
    totals: {
      orders: summary?.orders || 0,
      gross: round2(summary?.gross),
      commission: round2(summary?.commission),
      net: round2(summary?.net),
      pending: round2(summary?.pending),
      paid: round2(summary?.paid),
    },
    recent: recent.map((o) => ({
      _id: o._id,
      subtotal: o.subtotal,
      commissionAmount: o.commissionAmount,
      payoutAmount: o.payoutAmount,
      payoutStatus: o.payoutStatus,
      payoutAt: o.payoutAt,
      collectedAt: o.collectedAt,
    })),
  };
}

async function applyFiles(restaurant, files = {}) {
  for (const [field, key] of [
    ['logo', 'logoUrl'],
    ['cover', 'coverUrl'],
  ]) {
    const file = files[field]?.[0];
    if (file) {
      await storage.remove(restaurant[key]);
      restaurant[key] = await storage.save(file);
    }
  }
}

function applyFields(restaurant, { lat, lng, ...rest }) {
  Object.assign(restaurant, rest);
  if (lat !== undefined && lng !== undefined) restaurant.location = { lat, lng };
}

export async function createOwned(ownerId, data, files) {
  if (await Restaurant.exists({ owner: ownerId })) throw conflict('You already have a restaurant');
  const restaurant = new Restaurant({ owner: ownerId });
  applyFields(restaurant, data);
  await applyFiles(restaurant, files);
  return restaurant.save();
}

export async function updateOwned(ownerId, data, files) {
  const restaurant = await getOwned(ownerId);
  applyFields(restaurant, data);
  await applyFiles(restaurant, files);
  return restaurant.save();
}

export async function setOpen(ownerId, isOpen) {
  const restaurant = await getOwned(ownerId);
  restaurant.isOpen = isOpen;
  return restaurant.save();
}

// ---- compliance documents ----

export async function addDocument(ownerId, { type, label = '', expiresAt }, file) {
  if (!file) throw badRequest('Choose a document to upload');
  const restaurant = await getOwned(ownerId);
  const fileUrl = await storage.save(file);
  restaurant.documents.push({
    type,
    label,
    fileUrl,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  });
  await restaurant.save();
  return restaurant;
}

export async function removeDocument(ownerId, docId) {
  const restaurant = await getOwned(ownerId);
  const doc = restaurant.documents.id(docId);
  if (!doc) throw notFound('Document');
  await storage.remove(doc.fileUrl);
  doc.deleteOne();
  await restaurant.save();
  return restaurant;
}

/** Admin review of one document. Rejecting clears a previous verification. */
export async function verifyDocument(restaurantId, docId, { verified, note }, actor) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw notFound('Restaurant');
  const doc = restaurant.documents.id(docId);
  if (!doc) throw notFound('Document');
  doc.verifiedAt = verified ? new Date() : null;
  doc.verifiedBy = verified ? actor._id : null;
  if (note !== undefined) doc.note = note;
  await restaurant.save();
  await audit({
    actor,
    action: verified ? 'DOCUMENT_VERIFIED' : 'DOCUMENT_REJECTED',
    targetType: 'restaurant',
    target: restaurant._id,
    summary: `${restaurant.name}: ${doc.type}${doc.label ? ` (${doc.label})` : ''}`,
  });
  await notify(restaurant.owner, {
    type: 'RESTAURANT_STATUS',
    title: verified ? 'A compliance document was verified' : 'A compliance document needs attention',
    body: `${doc.type}${doc.label ? ` — ${doc.label}` : ''}${note ? `: ${note}` : ''}`,
  });
  return restaurant;
}

// ---- Admin ----
export const listAll = (status) => Restaurant.find(status ? { status } : {}).populate('owner', 'name email phone').sort({ createdAt: -1 });

export async function setStatus(id, status, actor) {
  const restaurant = await Restaurant.findById(id);
  if (!restaurant) throw notFound('Restaurant');
  restaurant.status = status;
  if (status === RESTAURANT_STATUS.SUSPENDED) restaurant.isOpen = false;
  await restaurant.save();
  await audit({
    actor,
    action: status === RESTAURANT_STATUS.APPROVED ? 'RESTAURANT_APPROVED' : 'RESTAURANT_SUSPENDED',
    targetType: 'restaurant',
    target: restaurant._id,
    summary: restaurant.name,
  });
  await notify(restaurant.owner, {
    type: 'RESTAURANT_STATUS',
    title: status === RESTAURANT_STATUS.APPROVED ? 'Your restaurant is approved' : 'Your restaurant was suspended',
    body: restaurant.name,
  });
  return restaurant;
}

// ---- Owner insights ----
const DAY = 24 * 60 * 60 * 1000;

export async function insights(ownerId) {
  const restaurant = await getOwned(ownerId);
  // Day buckets are UTC so they line up with $dateToString, which groups in UTC.
  const since = new Date(Date.now() - 13 * DAY);
  since.setUTCHours(0, 0, 0, 0);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const match = { restaurant: restaurant._id };
  const collected = { ...match, status: ORDER_STATUS.COLLECTED };

  const [byStatus, totals, daily, topItems, today, prep, flight, ratingDist] = await Promise.all([
    Order.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: collected }, { $group: { _id: null, revenue: { $sum: '$subtotal' }, orders: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: { ...collected, createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$subtotal' },
          orders: { $sum: 1 },
        },
      },
    ]),
    Order.aggregate([
      { $match: collected },
      { $unwind: '$items' },
      { $match: { 'items.removed': { $ne: true } } },
      {
        $group: {
          _id: '$items.menuItem',
          name: { $last: '$items.name' },
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        },
      },
      { $sort: { quantity: -1, revenue: -1 } },
      { $limit: 5 },
    ]),
    Order.countDocuments({ ...match, createdAt: { $gte: startOfToday } }),
    Order.aggregate([
      {
        $match: {
          ...match,
          status: ORDER_STATUS.COLLECTED,
          acceptedAt: { $ne: null },
          preparedAt: { $ne: null },
        },
      },
      { $group: { _id: null, avgMin: { $avg: { $subtract: ['$preparedAt', '$acceptedAt'] } }, count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      {
        $match: {
          ...match,
          status: ORDER_STATUS.COLLECTED,
          dispatchedAt: { $ne: null },
          arrivedAt: { $ne: null },
        },
      },
      {
        $group: {
          _id: null,
          avgMin: { $avg: { $subtract: ['$arrivedAt', '$dispatchedAt'] } },
          count: { $sum: 1 },
        },
      },
    ]),
    Review.aggregate([
      { $match: { restaurant: restaurant._id } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]),
  ]);

  const ordersByStatus = Object.fromEntries(Object.values(ORDER_STATUS).map((s) => [s, 0]));
  byStatus.forEach((r) => (ordersByStatus[r._id] = r.count));
  const totalOrders = byStatus.reduce((n, r) => n + r.count, 0);
  const lost = ordersByStatus.CANCELLED + ordersByStatus.REJECTED;
  const revenue = totals[0]?.revenue || 0;
  const completed = totals[0]?.orders || 0;

  const byDay = new Map(daily.map((d) => [d._id, d]));
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(since.getTime() + i * DAY);
    const key = d.toISOString().slice(0, 10);
    return { date: key, revenue: byDay.get(key)?.revenue || 0, orders: byDay.get(key)?.orders || 0 };
  });

  return {
    revenue,
    completedOrders: completed,
    totalOrders,
    ordersToday: today,
    averageOrderValue: completed ? Math.round((revenue / completed) * 100) / 100 : 0,
    completionRate: completed + lost > 0 ? Math.round((completed / (completed + lost)) * 100) : null,
    ordersByStatus,
    days,
    topItems: topItems.map((t) => ({ menuItem: t._id, name: t.name, quantity: t.quantity, revenue: t.revenue })),
    ratingAvg: restaurant.ratingAvg,
    ratingCount: restaurant.ratingCount,
    // Average minutes from accepting an order to marking it ready, measured from saved timestamps.
    prepStats: {
      averageMinutes: prep[0] ? Math.round((prep[0].avgMin / 60000) * 10) / 10 : null,
      sampleSize: prep[0]?.count || 0,
    },
    // Average minutes from dispatch to arrival at hub, measured from saved timestamps.
    flightStats: {
      averageMinutes: flight[0] ? Math.round((flight[0].avgMin / 60000) * 10) / 10 : null,
      sampleSize: flight[0]?.count || 0,
    },
    // Distribution of ratings (1-5 stars), including stars nobody has given yet.
    ratingDistribution: {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      ...Object.fromEntries(ratingDist.map(({ _id, count }) => [String(_id), count])),
    },
  };
}
