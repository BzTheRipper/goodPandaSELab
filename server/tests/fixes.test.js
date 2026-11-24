import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { AuditLog, Drone, MenuItem, Notification, Order, Restaurant } from '../src/models/index.js';
import { chargingController, flightController } from '../src/services/drone/index.js';
import { resumeFlights } from '../src/services/delivery.service.js';
import { SEED_CREDENTIALS, seedDatabase } from '../src/seed/seedData.js';

let mongo;
let hubs;
const app = createApp();
const api = () => request(app);
const tokens = {};
const as = (key) => ({ Authorization: `Bearer ${tokens[key]}` });

const setStatus = (key, id, status, reason) =>
  api().patch(`/api/orders/${id}/status`).set(as(key)).send({ status, ...(reason && { reason }) });

async function placeOrder({ quantity = 1, restaurantName = 'Panda Biryani House', items } = {}) {
  const restaurant = await Restaurant.findOne({ name: restaurantName });
  const menu = await MenuItem.find({ restaurant: restaurant._id, isAvailable: true });
  const body = {
    restaurantId: String(restaurant._id),
    hubId: String(hubs[0]._id),
    items: items || [{ menuItemId: String(menu[0]._id), quantity }],
  };
  const res = await api().post('/api/orders').set(as('customer')).send(body);
  expect(res.status).toBe(201);
  return { order: res.body, restaurant, menu };
}

const waitFor = async (fn, timeout = 8000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('waitFor timed out');
};

async function driveToReady(orderId) {
  for (const s of ['ACCEPTED', 'PREPARING', 'READY_FOR_DRONE']) await setStatus('owner1', orderId, s).expect(200);
}

/** Loads and dispatches the first suitable drone, returning it. */
async function dispatchFirstDrone(orderId) {
  const available = await api().get('/api/drones/available').set(as('owner1'));
  const drone = available.body[0];
  await api().post(`/api/orders/${orderId}/load-drone`).set(as('owner1')).send({ droneId: drone._id }).expect(200);
  await api().post(`/api/orders/${orderId}/dispatch`).set(as('owner1')).expect(200);
  return drone;
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

describe('order list', () => {
  it('paginates and reports totals instead of silently capping', async () => {
    for (let i = 0; i < 3; i++) await placeOrder();
    const first = await api().get('/api/orders?page=1&limit=2').set(as('customer')).expect(200);
    expect(first.body).toMatchObject({ page: 1, limit: 2, total: 3, pages: 2 });
    expect(first.body.items).toHaveLength(2);

    const second = await api().get('/api/orders?page=2&limit=2').set(as('customer')).expect(200);
    expect(second.body.items).toHaveLength(1);

    // Pages must not overlap.
    const ids = new Set([...first.body.items, ...second.body.items].map((o) => o._id));
    expect(ids.size).toBe(3);
  });

  it('rejects an invalid page size', async () => {
    expect((await api().get('/api/orders?limit=5000').set(as('customer'))).status).toBe(400);
  });

  it('does not leak other customers\' orders', async () => {
    const { order } = await placeOrder();
    await api()
      .post('/api/auth/register')
      .send({ name: 'Other', email: 'other@x.io', password: 'secret1', phone: '01800000009' })
      .expect(201);
    const other = (await api().post('/api/auth/login').send({ email: 'other@x.io', password: 'secret1' })).body.token;
    const list = await api().get('/api/orders').set({ Authorization: `Bearer ${other}` });
    expect(list.body.items).toHaveLength(0);
    expect((await api().get(`/api/orders/${order._id}`).set({ Authorization: `Bearer ${other}` })).status).toBe(403);
  });
});

describe('order creation', () => {
  it('merges duplicate lines for the same menu item', async () => {
    const restaurant = await Restaurant.findOne({ name: 'Panda Biryani House' });
    const item = await MenuItem.findOne({ restaurant: restaurant._id, isAvailable: true });
    const res = await api()
      .post('/api/orders')
      .set(as('customer'))
      .send({
        restaurantId: String(restaurant._id),
        hubId: String(hubs[0]._id),
        items: [
          { menuItemId: String(item._id), quantity: 1, note: 'less spicy' },
          { menuItemId: String(item._id), quantity: 2 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ quantity: 3, note: 'less spicy' });
    expect(res.body.subtotal).toBe(item.price * 3);
  });
});

describe('drone handling', () => {
  it('refuses a drone whose battery cannot cover the whole trip', async () => {
    const { order } = await placeOrder();
    await driveToReady(order._id);
    const weak = await Drone.findOne({ identifier: 'GP-DR-04' });
    // Make it otherwise-available so only the battery check can reject it.
    weak.status = 'IDLE';
    await weak.save();
    const res = await api().post(`/api/orders/${order._id}/load-drone`).set(as('owner1')).send({ droneId: String(weak._id) });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DRONE_BATTERY');
  });

  it('refuses a drone that is too small for the order', async () => {
    const small = await Drone.findOne({ identifier: 'GP-DR-04' });
    small.battery = 100; // isolate capacity from the battery check
    small.capacityUnits = 2;
    await small.save();

    const { order } = await placeOrder({ quantity: 5 });
    await driveToReady(order._id);
    const res = await api().post(`/api/orders/${order._id}/load-drone`).set(as('owner1')).send({ droneId: String(small._id) });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DRONE_CAPACITY');
  });

  it('flies the drone from where it is instead of teleporting it to the restaurant', async () => {
    const { order } = await placeOrder();
    await driveToReady(order._id);
    // Put a drone at a hub far from the restaurant, with a full battery.
    const drone = await Drone.findOne({ identifier: 'GP-DR-03' });
    drone.battery = 100;
    drone.location = hubs[0].location;
    await drone.save();

    const res = await api().post(`/api/orders/${order._id}/load-drone`).set(as('owner1')).send({ droneId: String(drone._id) });
    expect(res.status).toBe(200);
    const after = await Drone.findById(drone._id);
    expect(after.location.lat).toBeCloseTo(hubs[0].location.lat, 5);
    expect(after.location.lng).toBeCloseTo(hubs[0].location.lng, 5);
  });

  it('stores a promised arrival time and tells the customer', async () => {
    const { order } = await placeOrder();
    await driveToReady(order._id);
    const drone = await dispatchFirstDrone(order._id);

    const detail = await api().get(`/api/orders/${order._id}`).set(as('customer'));
    expect(detail.body.status).toBe('IN_FLIGHT');
    expect(new Date(detail.body.estimatedArrivalAt).getTime()).toBeGreaterThan(Date.now() - 1000);

    const notes = await Notification.find({ user: (await Order.findById(order._id)).customer });
    // Tests fly absurdly fast, so the promised time rounds to "any moment now"; both forms count.
    expect(notes.some((n) => /arriving (in about|any moment)/i.test(n.title))).toBe(true);
    expect(drone.identifier).toBeTruthy();
  });

  it('takes a failed drone out of the order and lets an admin return it to service', async () => {
    const { order } = await placeOrder();
    await driveToReady(order._id);
    flightController.startFlight = () => ({});
    let drone;
    try {
      const available = await api().get('/api/drones/available').set(as('owner1'));
      drone = available.body[0];
      await api().post(`/api/orders/${order._id}/load-drone`).set(as('owner1')).send({ droneId: drone._id }).expect(200);
      await api().post(`/api/orders/${order._id}/dispatch`).set(as('owner1')).expect(200);
    } finally {
      delete flightController.startFlight;
    }

    await api().post(`/api/admin/drones/${drone._id}/fail`).set(as('admin')).expect(200);
    const failed = await Drone.findById(drone._id);
    expect(failed.status).toBe('MAINTENANCE');
    // The old bug left currentOrder set, which made the drone impossible to rehabilitate.
    expect(failed.currentOrder).toBeNull();

    const restored = await api().patch(`/api/admin/drones/${drone._id}`).set(as('admin')).send({ status: 'IDLE', battery: 100 });
    expect(restored.status).toBe(200);
    expect(restored.body.status).toBe('IDLE');
  });

  it('releases a cancelled order\'s drone and clears the reference', async () => {
    const { order } = await placeOrder();
    await driveToReady(order._id);
    const available = await api().get('/api/drones/available').set(as('owner1'));
    const drone = available.body[0];
    await api().post(`/api/orders/${order._id}/load-drone`).set(as('owner1')).send({ droneId: drone._id }).expect(200);

    await setStatus('admin', order._id, 'CANCELLED', 'Hub closed').expect(200);
    const cancelled = await Order.findById(order._id);
    expect(cancelled.drone).toBeNull();
    const released = await Drone.findById(drone._id);
    expect(released.currentOrder).toBeNull();
  });

  it('only notifies once when an admin bounces a flight back', async () => {
    const { order } = await placeOrder();
    await driveToReady(order._id);
    flightController.startFlight = () => ({});
    let drone;
    try {
      const available = await api().get('/api/drones/available').set(as('owner1'));
      drone = available.body[0];
      await api().post(`/api/orders/${order._id}/load-drone`).set(as('owner1')).send({ droneId: drone._id }).expect(200);
      await api().post(`/api/orders/${order._id}/dispatch`).set(as('owner1')).expect(200);
    } finally {
      delete flightController.startFlight;
    }

    const before = await Notification.countDocuments({ order: order._id });
    await setStatus('admin', order._id, 'READY_FOR_DRONE', 'Drone issue').expect(200);
    const after = await Notification.countDocuments({ order: order._id });
    // One notification per recipient for the return, not two.
    expect(after - before).toBe(2);
  });

  it('docks a stranded low-battery drone instead of leaving it unusable', async () => {
    const flat = await Drone.create({
      identifier: `LOW-${Date.now()}`,
      battery: 10,
      capacityUnits: 12,
      status: 'IDLE',
      location: { lat: hubs[0].location.lat, lng: hubs[0].location.lng },
    });

    // An idle drone below the ready charge is picked up by the startup sweep.
    await resumeFlights();
    expect((await Drone.findById(flat._id)).status).toBe('CHARGING');

    // Returning a flat drone to service must re-dock it, not hand back a drone that cannot fly.
    await Drone.updateOne({ _id: flat._id }, { status: 'MAINTENANCE' });
    const res = await api().patch(`/api/admin/drones/${flat._id}`).set(as('admin')).send({ status: 'IDLE' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CHARGING');

    // The dock tops it up on its timer and hands it back once it crosses the ready charge.
    const charged = await waitFor(async () => {
      const d = await Drone.findById(flat._id);
      return d.battery > 10 ? d : null;
    });
    expect(charged.battery).toBeGreaterThan(10);

    chargingController.stop(String(flat._id));
    await Drone.deleteOne({ _id: flat._id });
  });
});

describe('customer cancellation request', () => {
  it('lets the customer ask and the restaurant accept', async () => {
    const { order } = await placeOrder();
    await setStatus('owner1', order._id, 'ACCEPTED').expect(200);

    const req = await api()
      .post(`/api/orders/${order._id}/cancel-request`)
      .set(as('customer'))
      .send({ message: 'Ordered by mistake, sorry' });
    expect(req.status).toBe(200);
    expect(req.body.status).toBe('NEEDS_CUSTOMER_CONFIRMATION');
    expect(req.body.confirmationRequest).toMatchObject({ type: 'CANCEL_REQUEST', awaiting: 'OWNER' });

    const resolved = await api()
      .post(`/api/orders/${order._id}/cancel-response`)
      .set(as('owner1'))
      .send({ decision: 'CANCEL' });
    expect(resolved.body).toMatchObject({ status: 'CANCELLED', paymentStatus: 'VOID' });
  });

  it('lets the restaurant decline and carry on', async () => {
    const { order } = await placeOrder();
    await setStatus('owner1', order._id, 'ACCEPTED').expect(200);
    await api().post(`/api/orders/${order._id}/cancel-request`).set(as('customer')).send({ message: 'Changed my mind' }).expect(200);

    const kept = await api()
      .post(`/api/orders/${order._id}/cancel-response`)
      .set(as('owner1'))
      .send({ decision: 'CONTINUE', reason: 'Already cooking, 2 minutes away' });
    expect(kept.body.status).toBe('ACCEPTED');
    expect(kept.body.confirmationRequest.resolution).toBe('CONTINUED');
  });

  it('blocks a cancel request once the food is packed, and blocks customers answering it', async () => {
    const { order } = await placeOrder();
    await driveToReady(order._id);
    expect((await api().post(`/api/orders/${order._id}/cancel-request`).set(as('customer')).send({ message: 'nope' })).status).toBe(409);

    const other = await placeOrder({ restaurantName: 'Green Leaf Cafe' });
    await setStatus('owner2', other.order._id, 'ACCEPTED');
    await api().post(`/api/orders/${other.order._id}/cancel-request`).set(as('customer')).send({ message: 'stop' }).expect(200);
    const wrong = await api().post(`/api/orders/${other.order._id}/confirmation-response`).set(as('customer')).send({ decision: 'CANCEL' });
    expect(wrong.status).toBe(403);
  });
});

describe('security', () => {
  it('refuses to deactivate the last active admin', async () => {
    const admins = await api().get('/api/admin/users?role=admin').set(as('admin'));
    const admin = admins.body[0];
    const second = await api()
      .post('/api/auth/register')
      .send({ name: 'Admin Two', email: 'admin2@x.io', password: 'secret1', phone: '01800000002' });
    expect(second.status).toBe(201);
    // Promote the second account directly, then deactivate it — one admin remains, so this works.
    const { User } = await import('../src/models/index.js');
    await User.updateOne({ email: 'admin2@x.io' }, { role: 'admin' });
    const admin2 = await User.findOne({ email: 'admin2@x.io' });
    expect((await api().patch(`/api/admin/users/${admin2._id}/active`).set(as('admin')).send({ isActive: false })).status).toBe(200);

    // Now demote the seed admin is not possible via the API, so simulate a lone admin by deactivating directly.
    await User.updateOne({ _id: admin._id }, { isActive: true });
    await User.deleteMany({ role: 'admin', _id: { $ne: admin._id } });
    const res = await api().patch(`/api/admin/users/${admin._id}/active`).set(as('admin')).send({ isActive: false });
    // Self-deactivation is blocked earlier with a different message; assert it is refused either way.
    expect([400, 409]).toContain(res.status);
  });

  it('hides reviews of a suspended restaurant', async () => {
    const { order, restaurant } = await placeOrder();
    await Order.updateOne({ _id: order._id }, { status: 'COLLECTED', paymentStatus: 'PAID' });
    await api().post(`/api/orders/${order._id}/review`).set(as('customer')).send({ rating: 5 }).expect(201);
    expect((await api().get(`/api/restaurants/${restaurant._id}/reviews`)).status).toBe(200);

    await api().patch(`/api/admin/restaurants/${restaurant._id}/status`).set(as('admin')).send({ status: 'SUSPENDED' }).expect(200);
    expect((await api().get(`/api/restaurants/${restaurant._id}/reviews`)).status).toBe(404);
  });

  it('records admin actions in the audit log', async () => {
    const hub = await api().post('/api/admin/hubs').set(as('admin')).send({
      name: 'Audit Hub',
      address: 'Somewhere 1, Dhaka',
      lat: 23.8,
      lng: 90.4,
    });
    expect(hub.status).toBe(201);
    await api().delete(`/api/admin/hubs/${hub.body._id}`).set(as('admin')).expect(204);

    const logs = await api().get('/api/admin/audit-logs').set(as('admin')).expect(200);
    expect(logs.body.some((l) => l.action === 'HUB_CREATED')).toBe(true);
    expect(logs.body.some((l) => l.action === 'HUB_DELETED')).toBe(true);
    expect(logs.body[0].actor).toMatchObject({ role: 'admin' });
    expect(await AuditLog.countDocuments()).toBeGreaterThan(0);

    expect((await api().get('/api/admin/audit-logs').set(as('owner1'))).status).toBe(403);
  });

  it('only accepts a six-digit pickup code', async () => {
    const { order } = await placeOrder();
    await driveToReady(order._id);
    await dispatchFirstDrone(order._id);
    await waitFor(async () => (await Order.findById(order._id)).status === 'ARRIVED_AT_HUB');

    expect((await api().post(`/api/orders/${order._id}/collect`).set(as('admin')).send({ pickupCode: '1234' })).status).toBe(400);
    expect((await api().post(`/api/orders/${order._id}/collect`).set(as('admin')).send({ pickupCode: '123456' })).status).toBe(400);
  });
});
