import mongoose from 'mongoose';
import { ORDER_STATUS, ROLES } from '../constants.js';
import { Order, Restaurant, Review } from '../models/index.js';
import { conflict, forbidden, notFound } from '../utils/errors.js';
import { notify } from './notification.service.js';
import { getOwned } from './restaurant.service.js';

// "Ayesha Rahman" -> "Ayesha R." so public reviews don't expose full names.
const publicName = (name = '') => {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0].toUpperCase()}.` : first || 'Customer';
};

const toPublic = (review) => {
  const json = review.toJSON();
  json.customer = { name: publicName(review.customer?.name) };
  return json;
};

async function recompute(restaurantId) {
  const [stats] = await Review.aggregate([
    { $match: { restaurant: new mongoose.Types.ObjectId(String(restaurantId)) } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await Restaurant.updateOne(
    { _id: restaurantId },
    { ratingAvg: stats ? Math.round(stats.avg * 10) / 10 : 0, ratingCount: stats?.count || 0 }
  );
}

export async function createForOrder(user, orderId, { rating, comment }) {
  const order = await Order.findById(orderId).populate('restaurant', 'name owner');
  if (!order) throw notFound('Order');
  if (user.role !== ROLES.CUSTOMER || String(order.customer) !== String(user._id)) {
    throw forbidden('This order does not belong to you');
  }
  if (order.status !== ORDER_STATUS.COLLECTED) throw conflict('You can review an order once you have collected it', 'NOT_COLLECTED');
  if (order.review || (await Review.exists({ order: order._id }))) throw conflict('You already reviewed this order', 'ALREADY_REVIEWED');

  const review = await Review.create({
    order: order._id,
    restaurant: order.restaurant._id,
    customer: user._id,
    rating,
    comment,
  });
  // updateOne keeps the order's optimistic-concurrency version untouched.
  await Order.updateOne({ _id: order._id }, { review: review._id });
  await recompute(order.restaurant._id);
  await notify(order.restaurant.owner, {
    type: 'NEW_REVIEW',
    title: `New ${rating}-star review (#${String(order._id).slice(-6)})`,
    body: comment ? comment.slice(0, 120) : order.restaurant.name,
    order: order._id,
  });
  await review.populate('customer', 'name');
  return toPublic(review);
}

export async function listForRestaurant(restaurantId, { limit = 20 } = {}) {
  const reviews = await Review.find({ restaurant: restaurantId }).populate('customer', 'name').sort({ createdAt: -1 }).limit(limit);
  return reviews.map(toPublic);
}

export async function listOwned(ownerId) {
  const restaurant = await getOwned(ownerId);
  const reviews = await Review.find({ restaurant: restaurant._id }).populate('customer', 'name').sort({ createdAt: -1 }).limit(200);
  return {
    ratingAvg: restaurant.ratingAvg,
    ratingCount: restaurant.ratingCount,
    reviews: reviews.map(toPublic),
  };
}

export async function reply(ownerId, reviewId, text) {
  const restaurant = await getOwned(ownerId);
  const review = await Review.findOne({ _id: reviewId, restaurant: restaurant._id }).populate('customer', 'name');
  if (!review) throw notFound('Review');
  review.reply = text ? { text, at: new Date() } : undefined;
  await review.save();
  if (text) {
    await notify(review.customer._id, {
      type: 'REVIEW_REPLY',
      title: `${restaurant.name} replied to your review`,
      body: text.slice(0, 120),
      order: review.order,
    });
  }
  return toPublic(review);
}
