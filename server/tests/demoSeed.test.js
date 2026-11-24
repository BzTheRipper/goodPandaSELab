import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { Coupon, Dispute, Order, Restaurant, Review } from '../src/models/index.js';
import { seedDemoData } from '../src/seed/seedDemo.js';
import { SEED_CREDENTIALS } from '../src/seed/seedData.js';

let mongo;
const app = createApp();
const api = () => request(app);
const tokens = {};
const as = (key) => ({ Authorization: `Bearer ${tokens[key]}` });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDb(mongo.getUri());
  await seedDemoData();
  for (const key of ['admin', 'owner1', 'customer']) {
    const res = await api().post('/api/auth/login').send(SEED_CREDENTIALS[key]);
    tokens[key] = res.body.token;
  }
});

afterAll(async () => {
  await disconnectDb();
  await mongo.stop();
});

describe('demo seed', () => {
  it('creates collected, live and waiting orders with consistent totals', async () => {
    const collected = await Order.find({ status: 'COLLECTED' });
    expect(collected.length).toBeGreaterThanOrEqual(6);
    for (const order of collected) {
      expect(order.total).toBeCloseTo(order.subtotal + order.deliveryFee, 2);
      expect(order.payoutAmount).toBeCloseTo(order.subtotal - order.commissionAmount, 2);
      expect(order.collectedAt).toBeTruthy();
      expect(order.statusHistory.at(-1).status).toBe('COLLECTED');
      // History must be chronological.
      const times = order.statusHistory.map((h) => new Date(h.at).getTime());
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    }

    const waiting = await Order.findOne({ status: 'ARRIVED_AT_HUB' });
    expect(waiting.pickupCode).toBe('246810');
    expect(waiting.pickupToken).toHaveLength(32);

    expect(await Order.countDocuments({ status: 'PLACED' })).toBeGreaterThanOrEqual(1);
    expect(await Order.countDocuments({ status: 'PREPARING' })).toBeGreaterThanOrEqual(1);
  });

  it('feeds the owner payout and earnings screens', async () => {
    const payout = await api().get('/api/admin/payouts').set(as('admin')).expect(200);
    expect(payout.body.items.length).toBeGreaterThan(0);
    expect(payout.body.items.every((o) => o.status === 'COLLECTED')).toBe(true);

    const earnings = await api().get('/api/owner/earnings').set(as('owner1')).expect(200);
    expect(earnings.body.totals.orders).toBeGreaterThan(0);
    expect(earnings.body.totals.pending).toBeGreaterThan(0);
    expect(earnings.body.totals.paid).toBeGreaterThan(0);
  });

  it('seeds a live coupon and a support queue', async () => {
    const coupon = await Coupon.findOne({ code: 'SAVE10' });
    expect(coupon).toMatchObject({ type: 'PERCENT', value: 10, active: true });

    expect(await Dispute.countDocuments({ status: 'OPEN' })).toBe(1);
    const resolved = await Dispute.findOne({ status: 'RESOLVED' });
    expect(resolved.refundAmount).toBe(60);
    const refundedOrder = await Order.findById(resolved.order);
    expect(refundedOrder.refundAmount).toBe(60);
  });

  it('recomputes public ratings from the demo reviews', async () => {
    const reviews = await Review.countDocuments({});
    expect(reviews).toBeGreaterThanOrEqual(3);
    const restaurant = await Restaurant.findOne({ name: 'Panda Biryani House' });
    expect(restaurant.ratingCount).toBeGreaterThan(0);
    expect(restaurant.ratingAvg).toBeGreaterThan(0);
    const publicList = await api().get('/api/restaurants').expect(200);
    const listed = publicList.body.find((r) => r.name === 'Panda Biryani House') || publicList.body[0];
    expect(listed.ratingCount).toBeGreaterThan(0);
  });
});
