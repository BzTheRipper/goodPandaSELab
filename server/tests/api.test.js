import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { Drone, MenuItem, Restaurant } from '../src/models/index.js';
import { flightController } from '../src/services/drone/index.js';
import { SEED_CREDENTIALS, seedDatabase } from '../src/seed/seedData.js';

let mongo;
const app = createApp();
const api = () => request(app);
const tokens = {};
let hubs;

async function login(key) {
  const res = await api().post('/api/auth/login').send(SEED_CREDENTIALS[key]);
  expect(res.status).toBe(200);
  return res.body.token;
}
const as = (key) => ({ Authorization: `Bearer ${tokens[key]}` });

async function placeOrder(restaurantName = 'Panda Biryani House') {
  const restaurant = await Restaurant.findOne({ name: restaurantName });
  const items = await MenuItem.find({ restaurant: restaurant._id, isAvailable: true }).limit(2);
  const res = await api()
    .post('/api/orders')
    .set(as('customer'))
    .send({
      restaurantId: String(restaurant._id),
      hubId: String(hubs[0]._id),
      customerNote: 'serve hot',
      items: [
        { menuItemId: String(items[0]._id), quantity: 2, note: 'less spicy', price: 1 },
        { menuItemId: String(items[1]._id), quantity: 1 },
      ],
    });
  expect(res.status).toBe(201);
  return { order: res.body, items };
}

const setStatus = (key, id, status, reason) =>
  api().patch(`/api/orders/${id}/status`).set(as(key)).send({ status, ...(reason && { reason }) });

const waitFor = async (fn, timeout = 5000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('waitFor timed out');
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDb(mongo.getUri());
});

beforeEach(async () => {
  flightController.stopAll();
  ({ hubs } = await seedDatabase());
  for (const key of ['admin', 'owner1', 'owner2', 'customer']) tokens[key] = await login(key);
});

afterAll(async () => {
  flightController.stopAll();
  await disconnectDb();
  await mongo.stop();
});

describe('auth & role-based authorization', () => {
  it('registers a customer with required phone and rejects admin self-registration', async () => {
    const ok = await api().post('/api/auth/register').send({ name: 'New User', email: 'n@x.io', password: 'secret1', phone: '01800000000' });
    expect(ok.status).toBe(201);
    expect(ok.body.user.passwordHash).toBeUndefined();

    const noPhone = await api().post('/api/auth/register').send({ name: 'No Phone', email: 'p@x.io', password: 'secret1' });
    expect(noPhone.status).toBe(400);
    expect(noPhone.body.error.code).toBe('BAD_REQUEST');

    const admin = await api().post('/api/auth/register').send({ name: 'Evil', email: 'e@x.io', password: 'secret1', phone: '01800000001', role: 'admin' });
    expect(admin.status).toBe(400);
  });

  it('only accepts Bangladeshi mobile numbers and stores them as +8801XXXXXXXXX', async () => {
    const register = (email, phone) => api().post('/api/auth/register').send({ name: 'Phone Test', email, password: 'secret1', phone });

    // Local, international and bare 10-digit forms are all saved the same way.
    for (const [i, phone] of ['01712345678', '+880 1712-345678', '1912345678'].entries()) {
      const res = await register(`ok${i}@x.io`, phone);
      expect(res.status).toBe(201);
      expect(res.body.user.phone).toMatch(/^\+8801[3-9]\d{8}$/);
    }
    expect((await register('ok9@x.io', '01712345678')).body.user.phone).toBe('+8801712345678');

    // Wrong length, wrong operator prefix, letters, or another country are refused.
    for (const [i, phone] of ['171234567', '17123456789', '1212345678', '17123abc78', '+447912345678'].entries()) {
      const res = await register(`bad${i}@x.io`, phone);
      expect(res.status).toBe(400);
    }

    // The profile page uses the same rule.
    const { body } = await register('edit@x.io', '01712345678');
    const auth = { Authorization: `Bearer ${body.token}` };
    expect((await api().patch('/api/auth/me').set(auth).send({ phone: '12345' })).status).toBe(400);
    const updated = await api().patch('/api/auth/me').set(auth).send({ phone: '01812345678' });
    expect(updated.status).toBe(200);
    expect(updated.body.user.phone).toBe('+8801812345678');
  });

  it('requires a token and enforces roles', async () => {
    expect((await api().get('/api/orders')).status).toBe(401);
    expect((await api().get('/api/admin/dashboard').set(as('customer'))).status).toBe(403);
    expect((await api().get('/api/admin/dashboard').set(as('owner1'))).status).toBe(403);
    expect((await api().get('/api/admin/dashboard').set(as('admin'))).status).toBe(200);
    expect((await api().get('/api/owner/menu').set(as('customer'))).status).toBe(403);
    expect((await api().post('/api/orders').set(as('owner1')).send({})).status).toBe(403);
  });

  it('blocks deactivated users', async () => {
    const users = await api().get('/api/admin/users?role=customer').set(as('admin'));
    const customer = users.body.find((u) => u.email === SEED_CREDENTIALS.customer.email);
    await api().patch(`/api/admin/users/${customer._id}/active`).set(as('admin')).send({ isActive: false }).expect(200);
    expect((await api().get('/api/auth/me').set(as('customer'))).status).toBe(403);
  });

  it('hides other restaurants\' orders from an owner', async () => {
    const { order } = await placeOrder();
    expect((await api().get(`/api/orders/${order._id}`).set(as('owner2'))).status).toBe(403);
    expect((await setStatus('owner2', order._id, 'ACCEPTED')).status).toBe(403);
    expect((await api().get(`/api/orders/${order._id}`).set(as('owner1'))).status).toBe(200);
  });
});

describe('ordering', () => {
  it('calculates prices on the server and snapshots items', async () => {
    const { order, items } = await placeOrder();
    const expectedSubtotal = items[0].price * 2 + items[1].price;
    expect(order.subtotal).toBe(expectedSubtotal);
    expect(order.deliveryFee).toBe(60);
    expect(order.total).toBe(expectedSubtotal + 60);
    expect(order.items[0]).toMatchObject({ name: items[0].name, price: items[0].price, note: 'less spicy' });
    expect(order.status).toBe('PLACED');
    expect(order.paymentMethod).toBe('CASH_ON_COLLECTION');
  });

  it('uses the admin-configured delivery fee', async () => {
    await api().put('/api/admin/settings').set(as('admin')).send({ deliveryFee: 99 }).expect(200);
    const { order } = await placeOrder();
    expect(order.deliveryFee).toBe(99);
  });

  it('refuses closed restaurants and unavailable items', async () => {
    await api().patch('/api/owner/restaurant/open').set(as('owner1')).send({ isOpen: false }).expect(200);
    const restaurant = await Restaurant.findOne({ name: 'Panda Biryani House' });
    const item = await MenuItem.findOne({ restaurant: restaurant._id });
    const body = { restaurantId: String(restaurant._id), hubId: String(hubs[0]._id), items: [{ menuItemId: String(item._id), quantity: 1 }] };
    expect((await api().post('/api/orders').set(as('customer')).send(body)).status).toBe(409);

    await api().patch('/api/owner/restaurant/open').set(as('owner1')).send({ isOpen: true });
    const firni = await MenuItem.findOne({ name: 'Firni' });
    body.items = [{ menuItemId: String(firni._id), quantity: 1 }];
    const res = await api().post('/api/orders').set(as('customer')).send(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ITEM_UNAVAILABLE');
  });
});

describe('order lifecycle', () => {
  it('customer can cancel while PLACED but not after ACCEPTED', async () => {
    const a = (await placeOrder()).order;
    expect((await setStatus('customer', a._id, 'CANCELLED')).body.status).toBe('CANCELLED');

    const b = (await placeOrder()).order;
    await setStatus('owner1', b._id, 'ACCEPTED').expect(200);
    const res = await setStatus('customer', b._id, 'CANCELLED');
    expect(res.status).toBe(403);
  });

  it('rejects invalid transitions with a clear 409', async () => {
    const { order } = await placeOrder();
    const res = await setStatus('owner1', order._id, 'READY_FOR_DRONE');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('requires a reason to reject', async () => {
    const { order } = await placeOrder();
    expect((await setStatus('owner1', order._id, 'REJECTED')).status).toBe(400);
    const res = await setStatus('owner1', order._id, 'REJECTED', 'Out of gas');
    expect(res.body).toMatchObject({ status: 'REJECTED', rejectionReason: 'Out of gas' });
  });

  it('runs end-to-end: accept → prepare → drone → hub → collected', async () => {
    const { order } = await placeOrder();
    const id = order._id;
    for (const s of ['ACCEPTED', 'PREPARING', 'READY_FOR_DRONE']) await setStatus('owner1', id, s).expect(200);

    const available = await api().get('/api/drones/available').set(as('owner1'));
    expect(available.body.map((d) => d.identifier)).not.toContain('GP-DR-04'); // low battery
    const drone = available.body[0];

    await api().post(`/api/orders/${id}/load-drone`).set(as('owner1')).send({ droneId: drone._id }).expect(200);
    const dispatched = await api().post(`/api/orders/${id}/dispatch`).set(as('owner1'));
    expect(dispatched.body.status).toBe('IN_FLIGHT');

    const arrived = await waitFor(async () => {
      const r = await api().get(`/api/orders/${id}`).set(as('customer'));
      return r.body.status === 'ARRIVED_AT_HUB' && r.body;
    });
    expect(arrived.pickupCode).toMatch(/^\d{6}$/);
    // The drone is released from the order on drop-off; it then flies the empty return leg.
    await waitFor(async () => !(await Drone.findById(drone._id)).currentOrder);
    expect(arrived.estimatedArrivalAt).toBeTruthy();

    const ownerView = await api().get(`/api/orders/${id}`).set(as('owner1'));
    expect(ownerView.body.pickupCode).toBeUndefined();

    expect((await api().post(`/api/orders/${id}/collect`).set(as('admin')).send({ pickupCode: '000000' })).status).toBe(400);
    const collected = await api().post(`/api/orders/${id}/collect`).set(as('admin')).send({ pickupCode: arrived.pickupCode });
    expect(collected.body).toMatchObject({ status: 'COLLECTED', paymentStatus: 'PAID' });
    expect(collected.body.statusHistory.map((h) => h.status)).toEqual([
      'PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_DRONE', 'IN_FLIGHT', 'ARRIVED_AT_HUB', 'COLLECTED',
    ]);
  });

  it('only lets one order grab a drone when two race for it', async () => {
    const a = (await placeOrder()).order;
    const b = (await placeOrder()).order;
    for (const o of [a, b]) for (const s of ['ACCEPTED', 'PREPARING', 'READY_FOR_DRONE']) await setStatus('owner1', o._id, s);
    const drone = await Drone.findOne({ identifier: 'GP-DR-01' });
    const results = await Promise.all(
      [a, b].map((o) => api().post(`/api/orders/${o._id}/load-drone`).set(as('owner1')).send({ droneId: String(drone._id) }))
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('flags an in-flight order when its drone fails, and admin can reset it', async () => {
    const { order } = await placeOrder();
    const id = order._id;
    for (const s of ['ACCEPTED', 'PREPARING', 'READY_FOR_DRONE']) await setStatus('owner1', id, s);
    const drone = await Drone.findOne({ identifier: 'GP-DR-01' });
    await api().post(`/api/orders/${id}/load-drone`).set(as('owner1')).send({ droneId: String(drone._id) }).expect(200);
    flightController.startFlight = () => ({}); // keep the drone "in the air" for this test
    try {
      await api().post(`/api/orders/${id}/dispatch`).set(as('owner1')).expect(200);
    } finally {
      delete flightController.startFlight;
    }

    await api().post(`/api/admin/drones/${drone._id}/fail`).set(as('admin')).expect(200);
    const flagged = await api().get(`/api/orders/${id}`).set(as('admin'));
    expect(flagged.body.needsAdminIntervention).toBe(true);

    const reset = await setStatus('admin', id, 'READY_FOR_DRONE');
    expect(reset.body).toMatchObject({ status: 'READY_FOR_DRONE', needsAdminIntervention: false, drone: null });
    expect((await Drone.findById(drone._id)).status).toBe('MAINTENANCE');
  });
});

describe('confirmation flow', () => {
  it('removes unavailable items and recalculates when the customer continues', async () => {
    const { order, items } = await placeOrder();
    const id = order._id;
    await setStatus('owner1', id, 'ACCEPTED');
    const dropped = order.items[1];
    const req = await api()
      .post(`/api/orders/${id}/confirmation-request`)
      .set(as('owner1'))
      .send({ type: 'ITEM_UNAVAILABLE', message: 'Sorry, sold out', itemIds: [dropped._id] });
    expect(req.body.status).toBe('NEEDS_CUSTOMER_CONFIRMATION');

    const msgs = await api().get(`/api/orders/${id}/messages`).set(as('customer'));
    expect(msgs.body[0].text).toContain('Sorry, sold out');

    const res = await api().post(`/api/orders/${id}/confirmation-response`).set(as('customer')).send({ decision: 'CONTINUE' });
    expect(res.body.status).toBe('ACCEPTED');
    expect(res.body.subtotal).toBe(items[0].price * 2);
    expect(res.body.total).toBe(items[0].price * 2 + 60);

    // After the customer agreed, the owner may still cancel.
    expect((await setStatus('owner1', id, 'CANCELLED', 'Kitchen issue')).body.status).toBe('CANCELLED');
  });

  it('lets the customer decline an unmet special request', async () => {
    const { order } = await placeOrder();
    await api()
      .post(`/api/orders/${order._id}/confirmation-request`)
      .set(as('owner1'))
      .send({ type: 'NOTE_UNMET', message: 'We cannot make it less spicy' })
      .expect(200);
    expect((await api().post(`/api/orders/${order._id}/confirmation-response`).set(as('owner1')).send({ decision: 'CANCEL' })).status).toBe(403);
    const res = await api().post(`/api/orders/${order._id}/confirmation-response`).set(as('customer')).send({ decision: 'CANCEL' });
    expect(res.body).toMatchObject({ status: 'CANCELLED', paymentStatus: 'VOID' });
  });
});

describe('chat', () => {
  it('lets participants chat, admin read only, and closes after final status', async () => {
    const { order } = await placeOrder();
    const id = order._id;
    await api().post(`/api/orders/${id}/messages`).set(as('customer')).send({ text: 'Hi!' }).expect(201);
    await api().post(`/api/orders/${id}/messages`).set(as('owner1')).send({ text: 'Hello' }).expect(201);
    expect((await api().post(`/api/orders/${id}/messages`).set(as('owner2')).send({ text: 'x' })).status).toBe(403);
    expect((await api().post(`/api/orders/${id}/messages`).set(as('admin')).send({ text: 'x' })).status).toBe(403);
    expect((await api().get(`/api/orders/${id}/messages`).set(as('admin'))).body).toHaveLength(2);

    await setStatus('customer', id, 'CANCELLED');
    expect((await api().post(`/api/orders/${id}/messages`).set(as('customer')).send({ text: 'late' })).status).toBe(409);
  });
});
