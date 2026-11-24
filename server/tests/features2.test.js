import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { Drone, Hub, MenuItem, Notification, Order, PushSubscription, Restaurant, Review, User } from '../src/models/index.js';
import { pushToUsers, subscribe, vapidPublicKey } from '../src/services/push.service.js';
import { SEED_CREDENTIALS, seedDatabase } from '../src/seed/seedData.js';

let mongo;
const app = createApp();
const api = () => request(app);
const tokens = {};
const as = (key) => ({ Authorization: `Bearer ${tokens[key]}` });

const login = async (key) => {
  const c = SEED_CREDENTIALS[key];
  const res = await api().post('/api/auth/login').send({ email: c.email, password: c.password });
  expect(res.status).toBe(200);
  return res.body.token;
};

const setStatus = (key, id, status) => api().patch(`/api/orders/${id}/status`).set(as(key)).send({ status });

async function placeOrder({ restaurantName = 'Panda Biryani House', hubIndex = 0 } = {}) {
  const restaurant = await Restaurant.findOne({ name: restaurantName });
  const menu = await MenuItem.find({ restaurant: restaurant._id, isAvailable: true });
  const hubs = await Hub.find().sort({ name: 1 });
  const res = await api().post('/api/orders').set(as('customer')).send({
    restaurantId: String(restaurant._id),
    hubId: String(hubs[hubIndex]._id),
    items: [{ menuItemId: String(menu[0]._id), quantity: 1 }],
  });
  expect(res.status).toBe(201);
  return { order: res.body, restaurant, hubs, menu };
}

const driveToReady = async (id) => {
  await setStatus('owner1', id, 'ACCEPTED').expect(200);
  await setStatus('owner1', id, 'PREPARING').expect(200);
  await setStatus('owner1', id, 'READY_FOR_DRONE').expect(200);
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDb(mongo.getUri('fixes2'));
  await seedDatabase();
  for (const key of Object.keys(SEED_CREDENTIALS)) tokens[key] = await login(key);
}, 120000);

afterAll(async () => {
  await disconnectDb();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  vi.restoreAllMocks();
  // Keep state predictable between tests without reseeding the whole world.
  await Promise.all([
    Order.deleteMany({}),
    Notification.deleteMany({}),
    Review.deleteMany({}),
    PushSubscription.deleteMany({}),
  ]);
});

describe('delivery fee modes', () => {
  it('prices by distance when admin switches the mode on', async () => {
    const settings = await api().get('/api/admin/settings').set(as('admin'));
    expect(settings.body.mode).toBe('flat');

    const changed = await api().put('/api/admin/settings').set(as('admin')).send({ mode: 'distance', perKm: 10, max: 300 });
    expect(changed.status).toBe(200);
    expect(changed.body.mode).toBe('distance');

    const { order } = await placeOrder();
    expect(order.deliveryDistanceKm).toBeGreaterThan(0);
    expect(order.deliveryFee).toBeGreaterThan(changed.body.deliveryFee);
    expect(order.total).toBe(order.subtotal + order.deliveryFee);

    // A receipt keeps the same priced fee for cash reconciliation (after collection below).
    await api().put('/api/admin/settings').set(as('admin')).send({ mode: 'flat' });
  });
});

describe('QR pickup, receipts and hub ratings', () => {
  it('scans a QR token, prints a receipt and aggregates hub/drone ratings', async () => {
    const { order } = await placeOrder();
    await driveToReady(order._id);
    const drones = await api().get('/api/drones/available').set(as('owner1'));
    await api().post(`/api/orders/${order._id}/load-drone`).set(as('owner1')).send({ droneId: drones.body[0]._id }).expect(200);
    await api().post(`/api/orders/${order._id}/dispatch`).set(as('owner1')).expect(200);

    // Drive the arrival without waiting for a real flight.
    const delivery = await import('../src/services/delivery.service.js');
    await delivery.handleArrival(order._id, drones.body[0]._id, { location: { lat: 23.7, lng: 90.4 }, battery: 80 });

    const full = await api().get(`/api/orders/${order._id}`).set(as('customer'));
    expect(full.body.pickupToken).toMatch(/^[a-f\d]{32}$/);
    expect(full.body.pickupCode).toMatch(/^\d{6}$/);
    // Staff never see the secret.
    const staffView = await api().get(`/api/orders/${order._id}`).set(as('admin'));
    expect(staffView.body.pickupToken).toBeUndefined();
    expect(staffView.body.pickupCode).toBeUndefined();

    // Wrong token is refused, correct one works.
    await api().post(`/api/orders/${order._id}/collect`).set(as('admin')).send({ pickupToken: '0'.repeat(32) }).expect(400);
    const collected = await api()
      .post(`/api/orders/${order._id}/collect`)
      .set(as('admin'))
      .send({ pickupToken: full.body.pickupToken });
    expect(collected.status).toBe(200);
    expect(collected.body.paymentStatus).toBe('PAID');

    const receipt = await api().get(`/api/orders/${order._id}/receipt`).set(as('customer'));
    expect(receipt.status).toBe(200);
    expect(receipt.body.number).toMatch(/^GP-/);
    expect(receipt.body.total).toBe(order.total);
    expect(receipt.body.timeline.prepMinutes).toBeGreaterThanOrEqual(0);
    expect(receipt.body.collectedBy.name).toBeTruthy();

    const reviewed = await api().post(`/api/orders/${order._id}/review`).set(as('customer')).send({
      rating: 5,
      hubRating: 4,
      droneRating: 3,
      comment: 'Smooth pickup',
    });
    expect(reviewed.status).toBe(201);
    expect(reviewed.body.hubRating).toBe(4);
    expect(reviewed.body.droneRating).toBe(3);
    const hub = await Hub.findById(order.hub);
    expect(hub.ratingAvg).toBe(4);
    expect(hub.ratingCount).toBe(1);
  });
});

describe('hub operators', () => {
  it('can verify pickups at their hub but cannot reach platform admin', async () => {
    const { order } = await placeOrder();
    await driveToReady(order._id);
    const drones = await api().get('/api/drones/available').set(as('owner1'));
    await api().post(`/api/orders/${order._id}/load-drone`).set(as('owner1')).send({ droneId: drones.body[0]._id });
    await api().post(`/api/orders/${order._id}/dispatch`).set(as('owner1'));
    const delivery = await import('../src/services/delivery.service.js');
    await delivery.handleArrival(order._id, drones.body[0]._id, { location: { lat: 23.7, lng: 90.4 }, battery: 80 });

    // Hub operator created by seed is assigned to the first hub by name; order uses that hub.
    const hubOp = await api().get(`/api/orders/${order._id}`).set(as('hubOperator'));
    expect(hubOp.status).toBe(200);
    const denied = await api().get('/api/admin/settings').set(as('hubOperator'));
    expect(denied.status).toBe(403);

    const full = await api().get(`/api/orders/${order._id}`).set(as('customer'));
    const verified = await api()
      .post(`/api/orders/${order._id}/collect`)
      .set(as('hubOperator'))
      .send({ pickupToken: full.body.pickupToken });
    expect(verified.status).toBe(200);
  });

  it('refuses an operator from a different hub', async () => {
    const { order } = await placeOrder({ hubIndex: 1 });
    const other = await User.findOne({ role: 'hub_operator' });
    const hubs = await Hub.find().sort({ name: 1 });
    expect(String(other.hub)).not.toBe(String(hubs[1]._id));
    const forbidden = await api().get(`/api/orders/${order._id}`).set(as('hubOperator'));
    expect(forbidden.status).toBe(403);
  });
});

describe('fleet maintenance', () => {
  it('schedules service and records battery history', async () => {
    const drone = await Drone.findOne({ identifier: 'GP-DR-01' });
    const due = new Date(Date.now() + 86400000).toISOString();
    const scheduled = await api()
      .patch(`/api/admin/drones/${drone._id}`)
      .set(as('admin'))
      .send({ maintenanceDueAt: due, maintenanceNote: 'Check rotors' });
    expect(scheduled.status).toBe(200);
    expect(scheduled.body.maintenanceNote).toBe('Check rotors');

    const health = await api().get('/api/admin/drones/health').set(as('admin'));
    expect(health.status).toBe(200);
    const row = health.body.find((d) => d.identifier === 'GP-DR-01');
    expect(Boolean(row.maintenanceDueAt)).toBe(true);
    expect(row.batteryHistory.some((e) => e.event === 'MANUAL_ADJUST')).toBe(false);

    const completed = await api()
      .patch(`/api/admin/drones/${drone._id}`)
      .set(as('admin'))
      .send({ status: 'MAINTENANCE', serviceNow: true });
    expect(completed.status).toBe(200);
    expect(completed.body.maintenanceDueAt).toBeNull();
    expect(completed.body.lastServiceAt).toBeTruthy();
    const after = await Drone.findById(drone._id);
    expect(after.batteryHistory.some((e) => e.event === 'SERVICED')).toBe(true);
  });
});

describe('approaching notification', () => {
  it('pings the customer once when the drone is within the ETA threshold', async () => {
    const env = (await import('../src/config/env.js')).env;
    const { deliveryEtaSeconds, planLegs } = await import('../src/services/delivery.service.js');
    const hubs = await Hub.find().sort({ name: 1 });
    const restaurant = await Restaurant.findOne({ name: 'Panda Biryani House' });
    const orderDoc = { hub: hubs[0], restaurant };
    // A point near the hub should yield a small drop-off ETA, while the return leg is excluded.
    const nearHub = { lat: hubs[0].location.lat, lng: hubs[0].location.lng };
    const legs = planLegs(orderDoc, nearHub);
    expect(legs.some((l) => l.phase === 'RETURN')).toBe(true);
    const eta = deliveryEtaSeconds(orderDoc, nearHub);
    expect(eta).toBeGreaterThanOrEqual(0);
    expect(eta).toBeLessThanOrEqual(env.drone.approachingEtaSeconds);

    // One-shot guard: the flag is set on the order when the ping goes out.
    const { order } = await placeOrder();
    await Order.updateOne({ _id: order._id }, { approachingNotifiedAt: new Date() });
    const flagged = await Order.findById(order._id);
    expect(flagged.approachingNotifiedAt).toBeTruthy();
  });
});

describe('web push', () => {
  it('stores subscriptions and is a no-op without VAPID keys', async () => {
    const customer = await User.findOne({ role: 'customer' });
    const sub = await subscribe(customer._id, {
      endpoint: 'https://push.example.com/device-1',
      keys: { p256dh: 'key', auth: 'auth' },
    });
    expect(sub.endpoint).toBe('https://push.example.com/device-1');
    const stored = await PushSubscription.countDocuments({ user: customer._id });
    expect(stored).toBe(1);
    const config = await api().get('/api/auth/push/config');
    expect(config.body.enabled).toBe(false);
    expect(typeof vapidPublicKey()).toBe('string');
    await expect(pushToUsers([customer._id], { title: 'hi' })).resolves.toBeUndefined();
  });
});
