import { ORDER_STATUS, RESTAURANT_STATUS } from '../constants.js';
import { MenuItem, Order, Restaurant } from '../models/index.js';
import { conflict, notFound } from '../utils/errors.js';
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
  return Restaurant.find(filter).sort(SORTS[sort] || SORTS.recommended);
}

export async function getPublic(id) {
  const restaurant = await Restaurant.findOne({ _id: id, status: RESTAURANT_STATUS.APPROVED });
  if (!restaurant) throw notFound('Restaurant');
  const menu = await MenuItem.find({ restaurant: id, isAvailable: true }).sort({ category: 1, name: 1 });
  return { restaurant, menu };
}

export async function getOwned(ownerId) {
  const restaurant = await Restaurant.findOne({ owner: ownerId });
  if (!restaurant) throw notFound('Restaurant profile (create it first)');
  return restaurant;
}

export const findOwned = (ownerId) => Restaurant.findOne({ owner: ownerId });

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

// ---- Admin ----
export const listAll = (status) => Restaurant.find(status ? { status } : {}).populate('owner', 'name email phone').sort({ createdAt: -1 });

export async function setStatus(id, status) {
  const restaurant = await Restaurant.findById(id);
  if (!restaurant) throw notFound('Restaurant');
  restaurant.status = status;
  if (status === RESTAURANT_STATUS.SUSPENDED) restaurant.isOpen = false;
  await restaurant.save();
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

  const [byStatus, totals, daily, topItems, today] = await Promise.all([
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
  };
}
