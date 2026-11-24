import { AuditLog, Coupon, Dispute, MenuItem, Notification, Order, Restaurant, Review, User } from '../models/index.js';
import { ORDER_STATUS, PAYMENT_METHODS, PAYMENT_STATUS, ROLES } from '../constants.js';
import { getFeeConfig, priceDeliveryFee } from '../services/setting.service.js';
import { distanceMeters } from '../services/drone/routing.js';
import { notify } from '../services/notification.service.js';
import { seedDatabase } from './seedData.js';

/**
 * Demo data on top of the normal seed: a week of collected orders (with reviews and a mix of paid
 * and pending payouts), a couple of live orders, and one waiting at the hub with a known pickup
 * code. Purely for screenshots/demo day — `npm run seed` still gives the clean MVP dataset.
 */
const round2 = (n) => Math.round(n * 100) / 100;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const PICKUP_CODE = '246810';
const PICKUP_TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

function flowTimes(status, placedAt) {
  const at = (min) => new Date(placedAt.getTime() + min * MINUTE);
  const times = {
    placedAt,
    acceptedAt: at(4),
    preparedAt: at(18),
    dispatchedAt: at(23),
    arrivedAt: at(33),
    collectedAt: at(45),
  };
  const steps = {
    [ORDER_STATUS.PLACED]: [ORDER_STATUS.PLACED],
    [ORDER_STATUS.PREPARING]: [ORDER_STATUS.PLACED, ORDER_STATUS.ACCEPTED, ORDER_STATUS.PREPARING],
    [ORDER_STATUS.ARRIVED_AT_HUB]: [
      ORDER_STATUS.PLACED,
      ORDER_STATUS.ACCEPTED,
      ORDER_STATUS.PREPARING,
      ORDER_STATUS.READY_FOR_DRONE,
      ORDER_STATUS.IN_FLIGHT,
      ORDER_STATUS.ARRIVED_AT_HUB,
    ],
    [ORDER_STATUS.COLLECTED]: [
      ORDER_STATUS.PLACED,
      ORDER_STATUS.ACCEPTED,
      ORDER_STATUS.PREPARING,
      ORDER_STATUS.READY_FOR_DRONE,
      ORDER_STATUS.IN_FLIGHT,
      ORDER_STATUS.ARRIVED_AT_HUB,
      ORDER_STATUS.COLLECTED,
    ],
  };
  const timeFor = {
    [ORDER_STATUS.PLACED]: times.placedAt,
    [ORDER_STATUS.ACCEPTED]: times.acceptedAt,
    [ORDER_STATUS.PREPARING]: times.preparedAt,
    [ORDER_STATUS.READY_FOR_DRONE]: times.preparedAt,
    [ORDER_STATUS.IN_FLIGHT]: times.dispatchedAt,
    [ORDER_STATUS.ARRIVED_AT_HUB]: times.arrivedAt,
    [ORDER_STATUS.COLLECTED]: times.collectedAt,
  };
  return {
    ...times,
    history: steps[status].map((step) => ({ status: step, at: timeFor[step], actorRole: ROLES.SYSTEM })),
  };
}

export async function seedDemoData() {
  const { hubs } = await seedDatabase();

  const admin = await User.findOne({ role: ROLES.ADMIN });
  const customer = await User.findOne({ role: ROLES.CUSTOMER });
  const restaurants = await Restaurant.find({}).sort({ name: 1 });
  const menuByRestaurant = new Map();
  for (const restaurant of restaurants) {
    const items = await MenuItem.find({ restaurant: restaurant._id, isAvailable: true });
    menuByRestaurant.set(String(restaurant._id), items);
  }

  const fee = await getFeeConfig();
  const commissionPercent = fee.platformCommissionPercent ?? 0;

  const buildOrder = async ({ restaurant, hub, picks, status, placedAt, payoutStatus, withReview }) => {
    const menu = menuByRestaurant.get(String(restaurant._id));
    const items = picks.map(([index, quantity]) => {
      const item = menu[index % menu.length];
      return { menuItem: item._id, name: item.name, price: item.price, quantity, note: '' };
    });
    const subtotal = round2(items.reduce((sum, i) => sum + i.price * i.quantity, 0));
    const distanceKm = distanceMeters(restaurant.location, hub.location) / 1000;
    const deliveryFee = priceDeliveryFee(fee, distanceKm).fee;
    const commissionAmount = round2(subtotal * (commissionPercent / 100));
    const times = flowTimes(status, placedAt);
    const collected = status === ORDER_STATUS.COLLECTED;

    const order = new Order({
      customer: customer._id,
      restaurant: restaurant._id,
      hub: hub._id,
      items,
      subtotal,
      deliveryFee,
      total: round2(subtotal + deliveryFee),
      deliveryDistanceKm: round2(distanceKm),
      status,
      statusHistory: times.history,
      paymentMethod: PAYMENT_METHODS.CASH_ON_COLLECTION,
      paymentStatus: collected ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.PENDING,
      commissionPercent,
      commissionAmount,
      payoutAmount: round2(subtotal - commissionAmount),
      payoutStatus: collected ? payoutStatus : 'PENDING',
      payoutAt: collected && payoutStatus === 'PAID' ? times.collectedAt : null,
      acceptedAt: status === ORDER_STATUS.PLACED ? null : times.acceptedAt,
      preparedAt: [ORDER_STATUS.PREPARING, ORDER_STATUS.ARRIVED_AT_HUB, ORDER_STATUS.COLLECTED].includes(status)
        ? times.preparedAt
        : null,
      dispatchedAt: [ORDER_STATUS.ARRIVED_AT_HUB, ORDER_STATUS.COLLECTED].includes(status) ? times.dispatchedAt : null,
      arrivedAt: [ORDER_STATUS.ARRIVED_AT_HUB, ORDER_STATUS.COLLECTED].includes(status) ? times.arrivedAt : null,
      collectedAt: collected ? times.collectedAt : null,
      collectedBy: collected ? admin._id : null,
      pickupCode: status === ORDER_STATUS.ARRIVED_AT_HUB ? PICKUP_CODE : null,
      pickupToken: status === ORDER_STATUS.ARRIVED_AT_HUB ? PICKUP_TOKEN : null,
      scheduledFor: null,
    });
    order.createdAt = placedAt;
    order.updatedAt = placedAt;
    // Keep the historical timestamps instead of "now".
    await order.save({ timestamps: false });

    if (withReview) {
      const review = await Review.create({
        order: order._id,
        restaurant: restaurant._id,
        customer: customer._id,
        rating: withReview.rating,
        hubRating: withReview.hubRating ?? null,
        droneRating: withReview.droneRating ?? null,
        hub: hub._id,
        comment: withReview.comment || '',
        ...(withReview.reply ? { reply: { text: withReview.reply, at: new Date() } } : {}),
      });
      await Order.updateOne({ _id: order._id }, { review: review._id });
    }
    return order;
  };

  const now = Date.now();
  const biryani = restaurants.find((r) => r.name === 'Panda Biryani House') || restaurants[0];
  const greenLeaf = restaurants.find((r) => r.name === 'Green Leaf Cafe') || restaurants[1] || restaurants[0];
  const [banani] = hubs;

  // Six days of completed business for the flagship restaurant, plus a couple for the second one.
  const collected = [
    { restaurant: biryani, hub: hubs[0], picks: [[0, 2], [3, 2]], daysAgo: 1, payoutStatus: 'PAID', review: { rating: 5, hubRating: 4, droneRating: 5, comment: 'Still warm when I got it. The drone tracking was fun to watch.' } },
    { restaurant: biryani, hub: hubs[1], picks: [[1, 1], [4, 1]], daysAgo: 2, payoutStatus: 'PAID', review: { rating: 4, hubRating: 5, droneRating: 4, comment: 'Good portions, a little spicy for me.' } },
    { restaurant: greenLeaf, hub: hubs[0], picks: [[0, 1], [3, 2]], daysAgo: 3, payoutStatus: 'PAID', review: { rating: 5, hubRating: 5, droneRating: 5, comment: 'Salad was crisp and the hub handover took under a minute.', reply: 'Thank you! We dress the salad right before dispatch.' } },
    { restaurant: biryani, hub: hubs[2], picks: [[2, 1]], daysAgo: 4, payoutStatus: 'PENDING' },
    { restaurant: greenLeaf, hub: hubs[1], picks: [[1, 1], [2, 1]], daysAgo: 5, payoutStatus: 'PENDING', review: { rating: 4, hubRating: 4, droneRating: 4 } },
    { restaurant: biryani, hub: hubs[0], picks: [[0, 1], [1, 1], [3, 1]], daysAgo: 6, payoutStatus: 'PAID' },
  ];

  const collectedOrders = [];
  for (const entry of collected) {
    const order = await buildOrder({
      restaurant: entry.restaurant,
      hub: entry.hub,
      picks: entry.picks,
      status: ORDER_STATUS.COLLECTED,
      placedAt: new Date(now - entry.daysAgo * DAY),
      payoutStatus: entry.payoutStatus,
      withReview: entry.review,
    });
    collectedOrders.push(order);
  }

  // Live orders so the boards, queue and payout screens are not empty on a fresh demo.
  await buildOrder({
    restaurant: biryani,
    hub: banani,
    picks: [[0, 1], [3, 1]],
    status: ORDER_STATUS.PLACED,
    placedAt: new Date(now - 3 * MINUTE),
  });
  await buildOrder({
    restaurant: greenLeaf,
    hub: hubs[1],
    picks: [[0, 1], [4, 1]],
    status: ORDER_STATUS.PREPARING,
    placedAt: new Date(now - 12 * MINUTE),
  });
  await buildOrder({
    restaurant: biryani,
    hub: banani,
    picks: [[1, 2], [3, 2]],
    status: ORDER_STATUS.ARRIVED_AT_HUB,
    placedAt: new Date(now - 40 * MINUTE),
  });

  // Recompute public rating averages from the demo reviews.
  const reviews = await Review.find({});
  for (const restaurant of restaurants) {
    const own = reviews.filter((r) => String(r.restaurant) === String(restaurant._id));
    if (!own.length) continue;
    restaurant.ratingAvg = round2(own.reduce((sum, r) => sum + r.rating, 0) / own.length);
    restaurant.ratingCount = own.length;
    await restaurant.save();
  }
  for (const hub of hubs) {
    const rated = reviews.filter((r) => String(r.hub) === String(hub._id) && r.hubRating);
    if (!rated.length) continue;
    hub.ratingAvg = round2(rated.reduce((sum, r) => sum + r.hubRating, 0) / rated.length);
    hub.ratingCount = rated.length;
    await hub.save();
  }

  // A live discount code and a support queue with one open + one settled report.
  await Coupon.create({
    code: 'SAVE10',
    description: '10% off, minimum ৳300',
    type: 'PERCENT',
    value: 10,
    maxDiscount: 100,
    minSubtotal: 300,
    perCustomerLimit: 3,
    createdBy: admin._id,
  });
  if (collectedOrders[0]) {
    await Dispute.create({
      order: collectedOrders[0]._id,
      customer: customer._id,
      restaurant: collectedOrders[0].restaurant,
      category: 'COLD_FOOD',
      description: 'The biryani arrived lukewarm; the drone waited too long at the hub.',
    });
  }
  if (collectedOrders[1]) {
    await Dispute.create({
      order: collectedOrders[1]._id,
      customer: customer._id,
      restaurant: collectedOrders[1].restaurant,
      category: 'MISSING_ITEM',
      description: 'The drink was missing from the bag.',
      status: 'RESOLVED',
      resolution: 'PARTIAL_REFUND',
      refundAmount: 60,
      adminNote: 'Refunded the drink after checking the packing list.',
      resolvedBy: admin._id,
      resolvedAt: new Date(now - 2 * DAY),
    });
    await Order.updateOne({ _id: collectedOrders[1]._id }, { refundAmount: 60 });
  }

  await AuditLog.deleteMany({ action: 'DEMO_SEED' });
  await AuditLog.create({
    actor: admin._id,
    actorRole: ROLES.ADMIN,
    action: 'DEMO_SEED',
    targetType: 'system',
    summary: `${collected.length + 3} demo orders created`,
  });

  await notify(biryani.owner, {
    type: 'NEW_ORDER',
    title: 'Scheduled order is due',
    body: 'One order is waiting for acceptance on your board.',
  });

  return {
    orders: await Order.countDocuments({}),
    reviews: reviews.length,
    notifications: await Notification.countDocuments({}),
  };
}
