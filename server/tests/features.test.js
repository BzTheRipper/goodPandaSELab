import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { MenuItem, Order, Restaurant } from '../src/models/index.js';
import { flightController } from '../src/services/drone/index.js';
import { SEED_CREDENTIALS, seedDatabase } from '../src/seed/seedData.js';

let mongo;
let hubs;
const app = createApp();
const api = () => request(app);
const tokens = {};
const as = (key) => ({ Authorization: `Bearer ${tokens[key]}` });

async function placeOrder(quantity = 1) {
  const restaurant = await Restaurant.findOne({ name: 'Panda Biryani House' });
  const item = await MenuItem.findOne({ restaurant: restaurant._id, isAvailable: true });
  const res = await api()
    .post('/api/orders')
    .set(as('customer'))
    .send({ restaurantId: String(restaurant._id), hubId: String(hubs[0]._id), items: [{ menuItemId: String(item._id), quantity }] });
  expect(res.status).toBe(201);
  return { order: res.body, restaurant, item };
}

async function collectedOrder() {
  const placed = await placeOrder(3);
  // Skip the drone flight: these rules only care that the order reached COLLECTED.
  await Order.updateOne({ _id: placed.order._id }, { status: 'COLLECTED', paymentStatus: 'PAID' });
  return placed;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDb(mongo.getUri());
});

beforeEach(async () => {
  flightController.stopAll();
  ({ hubs } = await seedDatabase());
  for (const key of ['admin', 'owner1', 'owner2', 'customer']) {
    const res = await api().post('/api/auth/login').send(SEED_CREDENTIALS[key]);
    tokens[key] = res.body.token;
  }
});

afterAll(async () => {
  flightController.stopAll();
  await disconnectDb();
  await mongo.stop();
});

describe('reviews', () => {
  it('lets the customer review a collected order once and updates the restaurant rating', async () => {
    const { order, restaurant } = await collectedOrder();

    const review = await api().post(`/api/orders/${order._id}/review`).set(as('customer')).send({ rating: 4, comment: 'Tasty' });
    expect(review.status).toBe(201);
    expect(review.body.customer.name).toMatch(/^\S+( \S\.)?$/);

    const again = await api().post(`/api/orders/${order._id}/review`).set(as('customer')).send({ rating: 5 });
    expect(again.status).toBe(409);

    const detail = await api().get(`/api/restaurants/${restaurant._id}`);
    expect(detail.body.restaurant).toMatchObject({ ratingAvg: 4, ratingCount: 1 });

    const list = await api().get(`/api/restaurants/${restaurant._id}/reviews`);
    expect(list.body).toHaveLength(1);

    const orderView = await api().get(`/api/orders/${order._id}`).set(as('customer'));
    expect(orderView.body.review.rating).toBe(4);
  });

  it('refuses reviews before collection, from other roles, and out of range', async () => {
    const { order } = await placeOrder();
    expect((await api().post(`/api/orders/${order._id}/review`).set(as('customer')).send({ rating: 5 })).status).toBe(409);
    expect((await api().post(`/api/orders/${order._id}/review`).set(as('owner1')).send({ rating: 5 })).status).toBe(403);
    expect((await api().post(`/api/orders/${order._id}/review`).set(as('customer')).send({ rating: 6 })).status).toBe(400);
  });

  it('lets only the owning restaurant reply', async () => {
    const { order } = await collectedOrder();
    const review = await api().post(`/api/orders/${order._id}/review`).set(as('customer')).send({ rating: 5 });
    expect((await api().post(`/api/owner/reviews/${review.body._id}/reply`).set(as('owner2')).send({ text: 'Hi' })).status).toBe(404);
    const reply = await api().post(`/api/owner/reviews/${review.body._id}/reply`).set(as('owner1')).send({ text: 'Thank you!' });
    expect(reply.status).toBe(200);
    expect(reply.body.reply.text).toBe('Thank you!');
    const mine = await api().get('/api/owner/reviews').set(as('owner1'));
    expect(mine.body).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
  });
});

describe('favourites', () => {
  it('adds, lists and removes favourite restaurants for customers only', async () => {
    const restaurant = await Restaurant.findOne({ name: 'Green Leaf Cafe' });
    const add = await api().put(`/api/auth/me/favorites/${restaurant._id}`).set(as('customer'));
    expect(add.status).toBe(200);
    expect(add.body.favorites.map(String)).toContain(String(restaurant._id));
    await api().put(`/api/auth/me/favorites/${restaurant._id}`).set(as('customer')).expect(200);

    const list = await api().get('/api/auth/me/favorites').set(as('customer'));
    expect(list.body.map((r) => r.name)).toEqual(['Green Leaf Cafe']);

    await api().delete(`/api/auth/me/favorites/${restaurant._id}`).set(as('customer')).expect(200);
    expect((await api().get('/api/auth/me/favorites').set(as('customer'))).body).toHaveLength(0);

    expect((await api().put(`/api/auth/me/favorites/${restaurant._id}`).set(as('owner1'))).status).toBe(403);
    expect((await api().put('/api/auth/me/favorites/000000000000000000000000').set(as('customer'))).status).toBe(404);
  });
});

describe('account', () => {
  it('changes the password only with the correct current password', async () => {
    const { password, email } = SEED_CREDENTIALS.customer;
    const wrong = await api().post('/api/auth/me/password').set(as('customer')).send({ currentPassword: 'nope', newPassword: 'brandnew1' });
    expect(wrong.status).toBe(400);
    await api().post('/api/auth/me/password').set(as('customer')).send({ currentPassword: password, newPassword: 'brandnew1' }).expect(204);
    expect((await api().post('/api/auth/login').send({ email, password })).status).toBe(401);
    expect((await api().post('/api/auth/login').send({ email, password: 'brandnew1' })).status).toBe(200);
  });

  it('uploads and removes a profile photo', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const up = await api().put('/api/auth/me/avatar').set(as('customer')).attach('avatar', png, { filename: 'a.png', contentType: 'image/png' });
    expect(up.status).toBe(200);
    expect(up.body.user.avatarUrl).toMatch(/^\/uploads\//);
    const removed = await api().delete('/api/auth/me/avatar').set(as('customer'));
    expect(removed.body.user.avatarUrl).toBeUndefined();
    const bad = await api().put('/api/auth/me/avatar').set(as('customer')).attach('avatar', Buffer.from('hi'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(bad.status).toBe(400);
  });
});

describe('browse & insights', () => {
  it('filters open restaurants, sorts by rating and finds dishes by name', async () => {
    const { order } = await collectedOrder();
    await api().post(`/api/orders/${order._id}/review`).set(as('customer')).send({ rating: 5 });
    const byRating = await api().get('/api/restaurants?sort=rating');
    expect(byRating.body[0].name).toBe('Panda Biryani House');

    await Restaurant.updateOne({ name: 'Green Leaf Cafe' }, { isOpen: false });
    const open = await api().get('/api/restaurants?openNow=true');
    expect(open.body.every((r) => r.isOpen)).toBe(true);

    const dish = await MenuItem.findOne({ isAvailable: true });
    const found = await api().get(`/api/restaurants?q=${encodeURIComponent(dish.name)}`);
    expect(found.body.map((r) => String(r._id))).toContain(String(dish.restaurant));
  });

  it('reports owner sales from collected orders and admin revenue', async () => {
    const { item } = await collectedOrder();
    const insights = await api().get('/api/owner/insights').set(as('owner1'));
    expect(insights.status).toBe(200);
    expect(insights.body).toMatchObject({ revenue: item.price * 3, completedOrders: 1, completionRate: 100 });
    expect(insights.body.days).toHaveLength(14);
    expect(insights.body.topItems[0]).toMatchObject({ name: item.name, quantity: 3 });
    expect((await api().get('/api/owner/insights').set(as('customer'))).status).toBe(403);

    const dash = await api().get('/api/admin/dashboard').set(as('admin'));
    expect(dash.body.grossSales).toBe(item.price * 3 + 60);
    expect(dash.body.deliveryFeeRevenue).toBe(60);
  });
});
