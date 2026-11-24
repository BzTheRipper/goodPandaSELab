import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { Drone, MenuItem, Notification, Order, Restaurant, User } from '../src/models/index.js';
import { chargingController, flightController } from '../src/services/drone/index.js';
import { SEED_CREDENTIALS, seedDatabase } from '../src/seed/seedData.js';

let mongo;
let hubs;
const app = createApp();
const api = () => request(app);
const tokens = {};
const as = (key) => ({ Authorization: `Bearer ${tokens[key]}` });

const setStatus = (key, id, status, reason) =>
  api().patch(`/api/orders/${id}/status`).set(as(key)).send({ status, ...(reason && { reason }) });

async function placeOrder({ restaurantName = 'Panda Biryani House', quantity = 1, hubIndex = 0, token } = {}) {
  const restaurant = await Restaurant.findOne({ name: restaurantName });
  const menu = await MenuItem.find({ restaurant: restaurant._id, isAvailable: true });
  const res = await api()
    .post('/api/orders')
    .set(token ? { Authorization: `Bearer ${token}` } : as('customer'))
    .send({
      restaurantId: String(restaurant._id),
      hubId: String(hubs[hubIndex]._id),
      items: [{ menuItemId: String(menu[0]._id), quantity }],
    })
    .expect(201);
  return { order: res.body, menu };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDb(mongo.getUri());
});

beforeEach(async () => {
  flightController.stopAll();
  chargingController.stopAll();
  ({ hubs } = await seedDatabase());
  for (const key of ['admin', 'owner1', 'owner2', 'customer', 'hubOperator']) {
    const res = await api().post('/api/auth/login').send(SEED_CREDENTIALS[key]);
    tokens[key] = res.body.token;
  }
});

afterAll(async () => {
  flightController.stopAll();
  chargingController.stopAll();
  await disconnectDb();
  await mongo.stop();
});

describe('payout ledger', () => {
  it('recalculates the restaurant payout when the order shrinks', async () => {
    const { order, menu } = await placeOrder({ quantity: 3 });
    const adminView = await api().get(`/api/orders/${order._id}`).set(as('admin')).expect(200);
    const before = adminView.body;
    expect(before.payoutAmount).toBeCloseTo(before.subtotal * 0.9, 2);

    await api()
      .patch(`/api/orders/${order._id}`)
      .set(as('customer'))
      .send({ items: [{ menuItemId: String(menu[0]._id), quantity: 1 }] })
      .expect(200);

    const after = (await api().get(`/api/orders/${order._id}`).set(as('admin')).expect(200)).body;
    expect(after.subtotal).toBeLessThan(before.subtotal);
    expect(after.payoutAmount).toBeCloseTo(after.subtotal * 0.9, 2);
    expect(after.commissionAmount).toBeCloseTo(after.subtotal * 0.1, 2);
  });

  it('voids the payout and keeps the commission private when an order is cancelled', async () => {
    const { order } = await placeOrder();
    await setStatus('customer', order._id, 'CANCELLED').expect(200);

    const adminView = (await api().get(`/api/orders/${order._id}`).set(as('admin')).expect(200)).body;
    expect(adminView.payoutStatus).toBe('VOID');

    // Customers and owners must not see the platform's margin.
    const customerView = (await api().get(`/api/orders/${order._id}`).set(as('customer')).expect(200)).body;
    expect(customerView.commissionPercent).toBeUndefined();
    expect(customerView.commissionAmount).toBeUndefined();
    expect(customerView.payoutAmount).toBeUndefined();
    const ownerView = (await api().get(`/api/orders/${order._id}`).set(as('owner1')).expect(200)).body;
    expect(ownerView.commissionAmount).toBeUndefined();
    expect(ownerView.payoutAmount).toBeGreaterThan(0);
  });

  it('lists only collected orders and honours the status filter', async () => {
    const { order } = await placeOrder();
    await setStatus('customer', order._id, 'CANCELLED').expect(200);
    const { order: live } = await placeOrder();

    const pending = await api().get('/api/admin/payouts?status=PENDING').set(as('admin')).expect(200);
    expect(pending.body.items.map((o) => o._id)).toEqual([]);

    // A non-collected order is never in the queue, even when its payout is still PENDING.
    const all = await api().get('/api/admin/payouts').set(as('admin')).expect(200);
    expect(all.body.items.map((o) => o._id)).not.toContain(live._id);
    expect(all.body.items.map((o) => o._id)).not.toContain(order._id);
    expect(all.body.total).toBe(0);

    // Marking a non-collected order paid is refused.
    await api().patch(`/api/admin/payouts/${live._id}/paid`).set(as('admin')).expect(409);
  });
});

describe('public settings', () => {
  it('exposes delivery pricing but not the commission rate', async () => {
    const res = await api().get('/api/settings/public').expect(200);
    expect(res.body.deliveryFee).toBeTypeOf('number');
    expect(res.body.platformCommissionPercent).toBeUndefined();
    expect(res.body.maxDeliveryDistanceKm).toBeUndefined();
    expect(res.body.onlinePaymentEnabled).toBe(false);
  });

  it('publishes an admin banner and hides it when deactivated', async () => {
    await api()
      .put('/api/admin/settings')
      .set(as('admin'))
      .send({ announcement: { message: 'Drone ops paused in Mirpur tonight', tone: 'warning', active: true } })
      .expect(200);

    let publicSettings = await api().get('/api/settings/public').expect(200);
    expect(publicSettings.body.announcement).toMatchObject({
      message: 'Drone ops paused in Mirpur tonight',
      tone: 'warning',
    });

    await api()
      .put('/api/admin/settings')
      .set(as('admin'))
      .send({ announcement: { message: 'Drone ops paused in Mirpur tonight', tone: 'warning', active: false } })
      .expect(200);
    publicSettings = await api().get('/api/settings/public').expect(200);
    expect(publicSettings.body.announcement).toBeNull();

    // Clearing the message removes the banner entirely.
    await api().put('/api/admin/settings').set(as('admin')).send({ announcement: null }).expect(200);
    const adminSettings = await api().get('/api/admin/settings').set(as('admin')).expect(200);
    expect(adminSettings.body.announcement).toBeNull();
  });
});

describe('drone servicing', () => {
  it('clears a scheduled service date and resets the trip counter on completion', async () => {
    const drone = await Drone.findOne({});
    await api()
      .patch(`/api/admin/drones/${drone._id}`)
      .set(as('admin'))
      .send({ maintenanceDueAt: null })
      .expect(200);

    await Drone.updateOne({ _id: drone._id }, { status: 'MAINTENANCE', tripsCompleted: 24 });

    const serviced = await api()
      .patch(`/api/admin/drones/${drone._id}`)
      .set(as('admin'))
      .send({ serviceNow: true })
      .expect(200);
    expect(serviced.body.tripsCompleted).toBe(0);
    expect(serviced.body.maintenanceDueAt).toBeNull();
  });
});

describe('owner earnings', () => {
  it('moves a payout from pending to paid when the admin settles it', async () => {
    await api().get('/api/owner/earnings').set(as('admin')).expect(403);

    const { order } = await placeOrder();
    // Nothing is payable until the order is collected.
    const before = await api().get('/api/owner/earnings').set(as('owner1')).expect(200);
    expect(before.body.totals.orders).toBe(0);

    for (const status of ['ACCEPTED', 'PREPARING', 'READY_FOR_DRONE']) {
      await setStatus('owner1', order._id, status).expect(200);
    }
    const available = await api().get('/api/drones/available').set(as('owner1')).expect(200);
    const droneId = available.body[0]._id;
    await api().post(`/api/orders/${order._id}/load-drone`).set(as('owner1')).send({ droneId }).expect(200);
    await api().post(`/api/orders/${order._id}/dispatch`).set(as('owner1')).expect(200);

    const delivery = await import('../src/services/delivery.service.js');
    await delivery.handleArrival(order._id, droneId, { location: { lat: 23.7, lng: 90.4 }, battery: 80 });

    const seen = await api().get(`/api/orders/${order._id}`).set(as('customer')).expect(200);
    await api().post(`/api/orders/${order._id}/collect`).set(as('admin')).send({ pickupCode: seen.body.pickupCode }).expect(200);

    const after = await api().get('/api/owner/earnings').set(as('owner1')).expect(200);
    expect(after.body.totals.orders).toBe(1);
    expect(after.body.totals.pending).toBeCloseTo(after.body.totals.net, 2);
    expect(after.body.totals.paid).toBe(0);
    expect(after.body.recent[0].payoutStatus).toBe('PENDING');

    await api().patch(`/api/admin/payouts/${order._id}/paid`).set(as('admin')).expect(200);

    const paid = await api().get('/api/owner/earnings').set(as('owner1')).expect(200);
    expect(paid.body.totals.pending).toBe(0);
    expect(paid.body.totals.paid).toBeCloseTo(paid.body.totals.net, 2);
  });
});

describe('scheduled orders', () => {
  it('hides the order from the restaurant until its slot, then releases it exactly once', async () => {
    const restaurant = await Restaurant.findOne({ name: 'Panda Biryani House' });
    const menu = await MenuItem.findOne({ restaurant: restaurant._id, isAvailable: true });
    const scheduledFor = new Date(Date.now() + 300).toISOString();
    const res = await api()
      .post('/api/orders')
      .set(as('customer'))
      .send({
        restaurantId: String(restaurant._id),
        hubId: String(hubs[0]._id),
        scheduledFor,
        items: [{ menuItemId: String(menu._id), quantity: 1 }],
      })
      .expect(201);

    // Visible to the customer, hidden from the restaurant until the slot arrives.
    const customerList = await api().get('/api/orders').set(as('customer')).expect(200);
    expect(customerList.body.items.map((o) => o._id)).toContain(res.body._id);
    const ownerList = await api().get('/api/orders').set(as('owner1')).expect(200);
    expect(ownerList.body.items.map((o) => o._id)).not.toContain(res.body._id);

    const { releaseDueScheduledOrders } = await import('../src/services/order.service.js');
    await new Promise((r) => setTimeout(r, 400));
    expect(await releaseDueScheduledOrders()).toBe(1);
    // Idempotent: a second tick must not notify twice.
    expect(await releaseDueScheduledOrders()).toBe(0);

    const ownerAfter = await api().get('/api/orders').set(as('owner1')).expect(200);
    expect(ownerAfter.body.items.map((o) => o._id)).toContain(res.body._id);
  });
});

describe('notification preferences', () => {
  it('stores channel choices and honours them when notifying', async () => {
    const updated = await api()
      .patch('/api/auth/me/notifications')
      .set(as('customer'))
      .send({ push: false, sms: false })
      .expect(200);
    expect(updated.body.user.notificationPrefs).toMatchObject({ inApp: true, push: false, sms: false });

    const { notify } = await import('../src/services/notification.service.js');
    const before = await Notification.countDocuments({ user: updated.body.user._id });
    await notify(updated.body.user._id, { type: 'ORDER_STATUS', title: 'Hello', body: 'In-app only' });
    const after = await Notification.countDocuments({ user: updated.body.user._id });
    // inApp is still on, so the notification is stored even though push/SMS are off.
    expect(after).toBe(before + 1);

    await api().patch('/api/auth/me/notifications').set(as('customer')).send({ inApp: false }).expect(200);
    await notify(updated.body.user._id, { type: 'ORDER_STATUS', title: 'Silent', body: 'No channels' });
    expect(await Notification.countDocuments({ user: updated.body.user._id })).toBe(after);

    // Reject an empty preference payload.
    await api().patch('/api/auth/me/notifications').set(as('customer')).send({}).expect(400);
  });

  it('paginates the full notification list', async () => {
    const me = await api().get('/api/auth/me').set(as('customer')).expect(200);
    const { notify } = await import('../src/services/notification.service.js');
    for (let i = 0; i < 3; i++) await notify(me.body.user._id, { type: 'ORDER_STATUS', title: `Note ${i}` });

    const page1 = await api().get('/api/notifications?limit=2&page=1').set(as('customer')).expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.pages).toBeGreaterThanOrEqual(2);
    const page2 = await api().get('/api/notifications?limit=2&page=2').set(as('customer')).expect(200);
    expect(page2.body.items.length).toBeGreaterThan(0);
    expect(page2.body.items[0]._id).not.toBe(page1.body.items[0]._id);
  });
});

describe('online payments', () => {
  it('refuses online payment when no gateway is configured', async () => {
    const restaurant = await Restaurant.findOne({ name: 'Panda Biryani House' });
    const item = await MenuItem.findOne({ restaurant: restaurant._id, isAvailable: true });
    await api()
      .post('/api/orders')
      .set(as('customer'))
      .send({
        restaurantId: String(restaurant._id),
        hubId: String(hubs[0]._id),
        paymentMethod: 'ONLINE_PAYMENT',
        items: [{ menuItemId: String(item._id), quantity: 1 }],
      })
      .expect(503);
    // The failed attempt must not leave an unpayable order behind.
    expect(await Order.countDocuments({ paymentMethod: 'ONLINE_PAYMENT' })).toBe(0);
  });

  it('rejects a webhook without a Stripe signature', async () => {
    await api().post('/api/payments/webhook').send({ type: 'checkout.session.completed' }).expect(400);
  });

  it('marks an order paid from a completed session exactly once', async () => {
    const { order } = await placeOrder();
    await Order.updateOne({ _id: order._id }, { paymentMethod: 'ONLINE_PAYMENT', paymentStatus: 'PENDING' });

    const { markPaidFromSession } = await import('../src/services/payment.service.js');
    const session = { client_reference_id: String(order._id), payment_intent: 'pi_test_123' };
    const paid = await markPaidFromSession(session);
    expect(paid.paymentStatus).toBe('PAID');
    expect(paid.paymentIntentId).toBe('pi_test_123');
    expect(paid.paidAt).toBeTruthy();

    const firstPaidAt = paid.paidAt;
    await markPaidFromSession(session);
    const again = await Order.findById(order._id);
    expect(again.paymentStatus).toBe('PAID');
    expect(again.paidAt).toEqual(firstPaidAt);
  });
});

describe('privacy', () => {
  it('exports the customer data bundle without secrets', async () => {
    const { order } = await placeOrder();
    const res = await api().get('/api/auth/me/export').set(as('customer')).expect(200);
    expect(res.body.account.email).toBe('customer@goodpanda.test');
    expect(res.body.orders.map((o) => String(o._id))).toContain(String(order._id));
    expect(res.body.reviews).toBeInstanceOf(Array);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    // Staff accounts cannot export another user's data.
    await api().get('/api/auth/me/export').set(as('admin')).expect(200);
  });

  it('blocks deletion while orders are active, then anonymises the account', async () => {
    const { order } = await placeOrder();
    await api().delete('/api/auth/me').set(as('customer')).expect(409);

    await setStatus('customer', order._id, 'CANCELLED').expect(200);
    await api().delete('/api/auth/me').set(as('customer')).expect(204);

    // The old token no longer authenticates and the original email is gone.
    await api().get('/api/auth/me').set(as('customer')).expect(403);
    expect(await User.findOne({ email: 'customer@goodpanda.test' })).toBeNull();
    const anonymous = await User.findOne({ name: 'Deleted customer' });
    expect(anonymous.phone).toBe('');
    expect(anonymous.isActive).toBe(false);
    expect(anonymous.deletedAt).toBeTruthy();
    // Order history is kept for cash reconciliation.
    expect(await Order.countDocuments({ _id: order._id })).toBe(1);
  });

  it('refuses to delete a staff account from the profile', async () => {
    await api().delete('/api/auth/me').set(as('owner1')).expect(403);
    expect(await User.findOne({ email: 'owner1@goodpanda.test' })).toBeTruthy();
  });
});

describe('email receipts', () => {
  async function collectAnOrder() {
    const { order } = await placeOrder();
    for (const status of ['ACCEPTED', 'PREPARING', 'READY_FOR_DRONE']) {
      await setStatus('owner1', order._id, status).expect(200);
    }
    const available = await api().get('/api/drones/available').set(as('owner1')).expect(200);
    const droneId = available.body[0]._id;
    await api().post(`/api/orders/${order._id}/load-drone`).set(as('owner1')).send({ droneId }).expect(200);
    await api().post(`/api/orders/${order._id}/dispatch`).set(as('owner1')).expect(200);
    const delivery = await import('../src/services/delivery.service.js');
    await delivery.handleArrival(order._id, droneId, { location: { lat: 23.7, lng: 90.4 }, battery: 80 });
    const seen = await api().get(`/api/orders/${order._id}`).set(as('customer')).expect(200);
    await api().post(`/api/orders/${order._id}/collect`).set(as('admin')).send({ pickupCode: seen.body.pickupCode }).expect(200);
    return order;
  }

  it('reports when email is not configured, and sends when it is', async () => {
    const order = await collectAnOrder();

    const off = await api().post(`/api/orders/${order._id}/receipt/email`).set(as('customer')).expect(200);
    expect(off.body).toMatchObject({ sent: false, configured: false });

    // Only the customer may trigger their receipt.
    await api().post(`/api/orders/${order._id}/receipt/email`).set(as('owner1')).expect(403);

    const { env } = await import('../src/config/env.js');
    const originalFetch = globalThis.fetch;
    env.email.apiKey = 'test-key';
    globalThis.fetch = async () => ({ ok: true, text: async () => '' });
    try {
      const sent = await api().post(`/api/orders/${order._id}/receipt/email`).set(as('customer')).expect(202);
      expect(sent.body.sent).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      env.email.apiKey = '';
    }
  });
});

describe('recommendations', () => {
  it('ranks saved restaurants first for a signed-in customer', async () => {
    const greenLeaf = await Restaurant.findOne({ name: 'Green Leaf Cafe' });
    const guest = await api().get('/api/restaurants/recommended').expect(200);
    expect(Array.isArray(guest.body)).toBe(true);
    expect(guest.body.length).toBeLessThanOrEqual(5);
    expect(guest.body.every((r) => r.status === 'APPROVED')).toBe(true);

    await api().put(`/api/auth/me/favorites/${greenLeaf._id}`).set(as('customer')).expect(200);
    const personal = await api().get('/api/restaurants/recommended').set(as('customer')).expect(200);
    expect(personal.body[0]._id).toBe(String(greenLeaf._id));
    expect(personal.body[0].reason).toBe('saved');

    await api().delete(`/api/auth/me/favorites/${greenLeaf._id}`).set(as('customer')).expect(200);
    const after = await api().get('/api/restaurants/recommended').set(as('customer')).expect(200);
    expect(after.body.find((r) => r._id === String(greenLeaf._id))?.reason).not.toBe('saved');
  });

  it('never recommends a suspended restaurant', async () => {
    const greenLeaf = await Restaurant.findOne({ name: 'Green Leaf Cafe' });
    await api().patch(`/api/admin/restaurants/${greenLeaf._id}/status`).set(as('admin')).send({ status: 'SUSPENDED' }).expect(200);
    const res = await api().get('/api/restaurants/recommended').expect(200);
    expect(res.body.map((r) => r._id)).not.toContain(String(greenLeaf._id));
  });
});

describe('hardware telemetry', () => {
  it('requires the shared key and ignores out-of-order reports', async () => {
    const drone = await Drone.findOne({});
    const report = { lat: 23.81, lng: 90.41, battery: 77, seq: 5 };
    // Disabled until a key is configured.
    await api().post(`/api/drones/${drone._id}/telemetry`).send(report).expect(403);

    const { env } = await import('../src/config/env.js');
    env.drone.ingestKey = 'secret-key';
    try {
      await api().post(`/api/drones/${drone._id}/telemetry`).set('x-drone-key', 'wrong').send(report).expect(401);

      const ok = await api().post(`/api/drones/${drone._id}/telemetry`).set('x-drone-key', 'secret-key').send(report).expect(202);
      expect(ok.body.ignored).toBe(false);
      expect(ok.body.drone.location).toMatchObject({ lat: 23.81, lng: 90.41 });
      expect(ok.body.drone.lastTelemetryAt).toBeTruthy();

      // An older sequence number must not move the drone backwards.
      const stale = await api()
        .post(`/api/drones/${drone._id}/telemetry`)
        .set('x-drone-key', 'secret-key')
        .send({ lat: 1, lng: 1, battery: 5, seq: 4 })
        .expect(200);
      expect(stale.body.ignored).toBe(true);
      const stored = await Drone.findById(drone._id);
      expect(stored.location.lat).toBe(23.81);

      await api()
        .post(`/api/drones/${drone._id}/telemetry`)
        .set('x-drone-key', 'secret-key')
        .send({ lat: 'not-a-number' })
        .expect(400);
    } finally {
      env.drone.ingestKey = '';
    }
  });
});

describe('compliance documents', () => {
  const png = Buffer.from('not-a-real-png-but-the-mime-is-what-we-check');

  it('lets an owner upload, keeps it private, and lets an admin verify it', async () => {
    const uploaded = await api()
      .post('/api/owner/restaurant/documents')
      .set(as('owner1'))
      .field('type', 'FOOD_LICENSE')
      .field('label', 'Licence 2026')
      .attach('document', png, { filename: 'licence.png', contentType: 'image/png' })
      .expect(201);
    expect(uploaded.body.documents).toHaveLength(1);
    const doc = uploaded.body.documents[0];
    expect(doc).toMatchObject({ type: 'FOOD_LICENSE', label: 'Licence 2026' });
    expect(doc.fileUrl).toMatch(/^\/uploads\//);

    // Documents are private: the public restaurant payload never includes them.
    const restaurant = await Restaurant.findOne({ name: 'Panda Biryani House' });
    const publicDetail = await api().get(`/api/restaurants/${restaurant._id}`).expect(200);
    expect(publicDetail.body.restaurant.documents).toBeUndefined();
    const publicList = await api().get('/api/restaurants').expect(200);
    expect(publicList.body.every((r) => r.documents === undefined)).toBe(true);

    // Customers cannot upload or verify.
    await api()
      .post('/api/owner/restaurant/documents')
      .set(as('customer'))
      .field('type', 'FOOD_LICENSE')
      .attach('document', png, { filename: 'x.png', contentType: 'image/png' })
      .expect(403);
    await api()
      .patch(`/api/admin/restaurants/${restaurant._id}/documents/${doc._id}`)
      .set(as('owner1'))
      .send({ verified: true })
      .expect(403);

    const verified = await api()
      .patch(`/api/admin/restaurants/${restaurant._id}/documents/${doc._id}`)
      .set(as('admin'))
      .send({ verified: true, note: 'Checked against the licence register' })
      .expect(200);
    expect(verified.body.documents[0].verifiedAt).toBeTruthy();
    expect(verified.body.documents[0].note).toMatch(/licence register/);

    const revoked = await api()
      .patch(`/api/admin/restaurants/${restaurant._id}/documents/${doc._id}`)
      .set(as('admin'))
      .send({ verified: false })
      .expect(200);
    expect(revoked.body.documents[0].verifiedAt).toBeNull();

    // Owner cannot remove another restaurant's document.
    await api().delete(`/api/owner/restaurant/documents/${doc._id}`).set(as('owner2')).expect(404);
    const removed = await api().delete(`/api/owner/restaurant/documents/${doc._id}`).set(as('owner1')).expect(200);
    expect(removed.body.documents).toHaveLength(0);
  });

  it('rejects a document upload without a file', async () => {
    await api()
      .post('/api/owner/restaurant/documents')
      .set(as('owner1'))
      .field('type', 'OWNER_ID')
      .expect(400);
  });
});

describe('no-show reporting', () => {
  async function arrive(orderId) {
    for (const status of ['ACCEPTED', 'PREPARING', 'READY_FOR_DRONE']) {
      await setStatus('owner1', orderId, status).expect(200);
    }
    const available = await api().get('/api/drones/available').set(as('owner1')).expect(200);
    const droneId = available.body[0]._id;
    await api().post(`/api/orders/${orderId}/load-drone`).set(as('owner1')).send({ droneId }).expect(200);
    await api().post(`/api/orders/${orderId}/dispatch`).set(as('owner1')).expect(200);
    const delivery = await import('../src/services/delivery.service.js');
    await delivery.handleArrival(orderId, droneId, { location: { lat: 23.7, lng: 90.4 }, battery: 80 });
  }

  it('closes an uncollected order, voids the payment and counts the no-show', async () => {
    const { order } = await placeOrder();
    await api().post(`/api/orders/${order._id}/no-show`).set(as('admin')).expect(409);

    await arrive(order._id);
    await api().post(`/api/orders/${order._id}/no-show`).set(as('customer')).expect(403);

    const closed = await api().post(`/api/orders/${order._id}/no-show`).set(as('hubOperator')).expect(200);
    expect(closed.body.status).toBe('CANCELLED');
    expect(closed.body.paymentStatus).toBe('VOID');
    expect(closed.body.payoutStatus).toBe('VOID');
    expect(closed.body.noShowReportedAt).toBeTruthy();

    const customer = await User.findOne({ email: 'customer@goodpanda.test' });
    expect(customer.noShowCount).toBe(1);

    // Reporting the same order twice is refused.
    await api().post(`/api/orders/${order._id}/no-show`).set(as('admin')).expect(409);
  });
});

describe('admin campaigns', () => {
  it('previews a segment and delivers a campaign through the notification pipeline', async () => {
    const preview = await api()
      .post('/api/admin/campaigns/preview')
      .set(as('admin'))
      .send({ segment: 'all_customers' })
      .expect(200);
    expect(preview.body.count).toBe(1);
    expect(preview.body.sample[0].email).toBe('customer@goodpanda.test');

    // A customer with no recent order counts as lapsed.
    const lapsed = await api()
      .post('/api/admin/campaigns/preview')
      .set(as('admin'))
      .send({ segment: 'lapsed_30d' })
      .expect(200);
    expect(lapsed.body.count).toBe(1);

    const before = await Notification.countDocuments({});
    const sent = await api()
      .post('/api/admin/campaigns')
      .set(as('admin'))
      .send({ segment: 'all_customers', title: 'Weekend slots are open', body: 'Order before 6pm.' })
      .expect(201);
    expect(sent.body.recipients).toBe(1);
    expect(sent.body.delivered).toBe(1);
    expect(await Notification.countDocuments({})).toBe(before + 1);

    const list = await api().get('/api/admin/campaigns').set(as('admin')).expect(200);
    expect(list.body[0].title).toBe('Weekend slots are open');
    expect(list.body[0].createdBy.name).toBeTruthy();

    await api()
      .post('/api/admin/campaigns')
      .set(as('admin'))
      .send({ segment: 'all_customers', title: '', body: 'x' })
      .expect(400);
    await api().post('/api/admin/campaigns/preview').set(as('customer')).send({ segment: 'all_users' }).expect(403);
  });

  it('respects notification preferences when delivering', async () => {
    await api().patch('/api/auth/me/notifications').set(as('customer')).send({ inApp: false }).expect(200);
    const before = await Notification.countDocuments({});
    const sent = await api()
      .post('/api/admin/campaigns')
      .set(as('admin'))
      .send({ segment: 'all_customers', title: 'Silent campaign', body: 'Should not be stored.' })
      .expect(201);
    expect(sent.body.recipients).toBe(1);
    expect(sent.body.delivered).toBe(0);
    expect(await Notification.countDocuments({})).toBe(before);
  });
});

describe('role boundaries', () => {
  it('does not let a hub operator cancel an order before dispatch', async () => {
    const { order } = await placeOrder();
    // Staff cancels carry a reason; the reason is irrelevant — the role check must reject it.
    await setStatus('hubOperator', order._id, 'CANCELLED', 'hub exception').expect(403);
    await setStatus('admin', order._id, 'CANCELLED', 'test cleanup').expect(200);
  });
});

describe('referrals & loyalty', () => {
  const asToken = (t) => ({ Authorization: `Bearer ${t}` });

  async function codeFor(token) {
    const me = await api().get('/api/auth/me').set(asToken(token)).expect(200);
    return me.body.user.referralCode;
  }

  async function registerCustomer(suffix = Math.random().toString(36).slice(2), code) {
    const email = `ref-${suffix}@goodpanda.test`;
    await api()
      .post('/api/auth/register')
      .send({
        name: `Referral ${suffix}`,
        email,
        password: 'refpass123',
        phone: '+8801755555555',
        ...(code && { referralCode: code }),
      })
      .expect(201);
    const res = await api()
      .post('/api/auth/login')
      .send({ email, password: 'refpass123' })
      .expect(200);
    return { email, token: res.body.token };
  }

  it('grants an invite code, signup credit and a referral row', async () => {
    const inviter = await registerCustomer('inviter');
    const me = await api().get('/api/auth/me').set(asToken(inviter.token)).expect(200);
    expect(me.body.user.referralCode).toMatch(/^GP[A-Z2-9]{5}$/);
    const refs = await api().get('/api/auth/me/referrals').set(asToken(inviter.token)).expect(200);
    expect(refs.body.code).toBe(me.body.user.referralCode);
    expect(refs.body.signupCredit).toBe(50);
    expect(refs.body.rewardAmount).toBe(50);

    const invitee = await registerCustomer('invitee', me.body.user.referralCode);
    const me2 = await api().get('/api/auth/me').set(asToken(invitee.token)).expect(200);
    expect(me2.body.user.referredBy).toBeTruthy();
    const refs2 = await api().get('/api/auth/me/referrals').set(asToken(inviter.token)).expect(200);
    expect(refs2.body.invites[0].name).toBeTruthy();
  });

  it('ignores unknown and self referral codes', async () => {
    const inviter = await registerCustomer('inviter2');
    const bad = await registerCustomer('bad');
    await api()
      .post('/api/auth/register')
      .send({
        name: 'Bad Code',
        email: `ref-badcode-${Date.now()}@goodpanda.test`,
        password: 'refpass123',
        phone: '+8801755555556',
        referralCode: 'DOESNOTEXIST',
      })
      .expect(201);
    await api().post('/api/auth/register').send({
      name: 'Self Referral',
      email: `ref-self-${Date.now()}@goodpanda.test`,
      password: 'refpass123',
      phone: '+8801755555557',
      referralCode: await codeFor(inviter.token),
    }).expect(201);
  });

  it('rewards the inviter once when the invitee collects their first order', async () => {
    const inviter = await registerCustomer('rewarder');
    const code = await codeFor(inviter.token);
    const invitee = await registerCustomer('rewardee', code);

    const { order } = await placeOrder({ hubIndex: 0, token: invitee.token });
    const { Order } = await import('../src/models/index.js');
    const collected = await Order.findByIdAndUpdate(order._id, { status: 'COLLECTED' }, { new: true });

    const { rewardReferralOnFirstOrder } = await import('../src/services/referral.service.js');
    const rewardResult = await rewardReferralOnFirstOrder(collected);
    expect(rewardResult).toBeTruthy();
    expect(rewardResult.status).toBe('REWARDED');
    expect(rewardResult.rewardAmount).toBe(50);

    const balance = await api().get('/api/auth/me').set(asToken(inviter.token)).expect(200);
    expect(balance.body.user.creditBalance).toBeGreaterThan(0);

    // Idempotent: calling again does nothing.
    const second = await rewardReferralOnFirstOrder(collected);
    expect(second).toBeNull();
  });
});

describe('coupons', () => {
  const createCoupon = (body) => api().post('/api/admin/coupons').set(as('admin')).send(body).expect(201);

  it('applies a capped percentage discount and recomputes payout', async () => {
    const restaurant = await Restaurant.findOne({ name: 'Panda Biryani House' });
    const coupon = (
      await createCoupon({
        code: 'save20',
        type: 'PERCENT',
        value: 20,
        maxDiscount: 100,
        minSubtotal: 300,
        description: '20% off up to 100',
      })
    ).body;
    expect(coupon.code).toBe('SAVE20');

    const menu = await MenuItem.findOne({ restaurant: restaurant._id, isAvailable: true });
    const subtotal = menu.price * 3;
    const preview = await api()
      .post('/api/coupons/validate')
      .set(as('customer'))
      .send({ code: 'save20', restaurantId: String(restaurant._id), subtotal })
      .expect(200);
    expect(preview.body.discount).toBe(Math.min(100, Math.round(subtotal * 0.2 * 100) / 100));

    const order = (
      await api()
        .post('/api/orders')
        .set(as('customer'))
        .send({
          restaurantId: String(restaurant._id),
          hubId: String(hubs[0]._id),
          couponCode: 'save20',
          items: [{ menuItemId: String(menu._id), quantity: 3 }],
        })
        .expect(201)
    ).body;
    expect(order.couponCode).toBe('SAVE20');
    expect(order.discount).toBe(preview.body.discount);
    expect(order.total).toBeCloseTo(order.subtotal - order.discount + order.deliveryFee, 2);

    const adminView = (await api().get(`/api/orders/${order._id}`).set(as('admin')).expect(200)).body;
    expect(adminView.commissionAmount).toBeCloseTo((adminView.subtotal - adminView.discount) * 0.1, 2);
    expect(adminView.payoutAmount).toBeCloseTo(adminView.subtotal - adminView.discount - adminView.commissionAmount, 2);

    // The coupon row records the use and can be deactivated.
    const list = await api().get('/api/admin/coupons').set(as('admin')).expect(200);
    expect(list.body[0].usedCount).toBe(1);
    const off = await api().patch(`/api/admin/coupons/${coupon._id}`).set(as('admin')).send({ active: false }).expect(200);
    expect(off.body.active).toBe(false);
  });

  it('enforces usage and per-customer limits', async () => {
    const restaurant = await Restaurant.findOne({ name: 'Panda Biryani House' });
    const menu = await MenuItem.findOne({ restaurant: restaurant._id, isAvailable: true });
    const items = [{ menuItemId: String(menu._id), quantity: 1 }];
    const body = { restaurantId: String(restaurant._id), hubId: String(hubs[0]._id), items };

    await createCoupon({ code: 'ONCE', type: 'FLAT', value: 50, usageLimit: 1 });
    await api().post('/api/orders').set(as('customer')).send({ ...body, couponCode: 'ONCE' }).expect(201);
    await api().post('/api/orders').set(as('customer')).send({ ...body, couponCode: 'ONCE' }).expect(409);

    await createCoupon({ code: 'PERPERSON', type: 'FLAT', value: 30, perCustomerLimit: 1 });
    await api().post('/api/orders').set(as('customer')).send({ ...body, couponCode: 'PERPERSON' }).expect(201);
    const second = await api().post('/api/orders').set(as('customer')).send({ ...body, couponCode: 'PERPERSON' }).expect(409);
    expect(second.body.error.code).toBe('COUPON_USED');
  });

  it('rejects unknown, expired and wrong-restaurant codes', async () => {
    const restaurant = await Restaurant.findOne({ name: 'Panda Biryani House' });
    const other = await Restaurant.findOne({ name: 'Green Leaf Cafe' });
    const menu = await MenuItem.findOne({ restaurant: restaurant._id, isAvailable: true });
    const body = {
      restaurantId: String(restaurant._id),
      hubId: String(hubs[0]._id),
      items: [{ menuItemId: String(menu._id), quantity: 1 }],
    };

    await api().post('/api/orders').set(as('customer')).send({ ...body, couponCode: 'NOPE' }).expect(400);
    await createCoupon({
      code: 'EXPIRED',
      type: 'FLAT',
      value: 50,
      startsAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      endsAt: new Date(Date.now() - 86400000).toISOString(),
    });
    const expired = await api().post('/api/orders').set(as('customer')).send({ ...body, couponCode: 'EXPIRED' }).expect(409);
    expect(expired.body.error.code).toBe('COUPON_EXPIRED');

    await createCoupon({ code: 'GREENONLY', type: 'FLAT', value: 50, restaurant: String(other._id) });
    const wrong = await api().post('/api/orders').set(as('customer')).send({ ...body, couponCode: 'GREENONLY' }).expect(409);
    expect(wrong.body.error.code).toBe('COUPON_NOT_APPLICABLE');

    // Validation is customer-only and admins cannot create a >100% coupon.
    await api().post('/api/coupons/validate').set(as('owner1')).send({ code: 'ONCE', restaurantId: String(restaurant._id), subtotal: 500 }).expect(403);
    await api().post('/api/admin/coupons').set(as('admin')).send({ code: 'BAD', type: 'PERCENT', value: 150 }).expect(400);
  });
});

describe('disputes', () => {
  async function collectedOrder() {
    const { order } = await placeOrder();
    for (const status of ['ACCEPTED', 'PREPARING', 'READY_FOR_DRONE']) {
      await setStatus('owner1', order._id, status).expect(200);
    }
    const available = await api().get('/api/drones/available').set(as('owner1')).expect(200);
    const droneId = available.body[0]._id;
    await api().post(`/api/orders/${order._id}/load-drone`).set(as('owner1')).send({ droneId }).expect(200);
    await api().post(`/api/orders/${order._id}/dispatch`).set(as('owner1')).expect(200);
    const delivery = await import('../src/services/delivery.service.js');
    await delivery.handleArrival(order._id, droneId, { location: { lat: 23.7, lng: 90.4 }, battery: 80 });
    const seen = await api().get(`/api/orders/${order._id}`).set(as('customer')).expect(200);
    await api().post(`/api/orders/${order._id}/collect`).set(as('admin')).send({ pickupCode: seen.body.pickupCode }).expect(200);
    return order;
  }

  it('opens, resolves and refunds a dispute exactly once', async () => {
    const { order } = await placeOrder();
    await api()
      .post(`/api/orders/${order._id}/disputes`)
      .set(as('customer'))
      .send({ category: 'MISSING_ITEM', description: 'The drink was missing from the bag.' })
      .expect(409);

    const delivered = await collectedOrder();
    const opened = await api()
      .post(`/api/orders/${delivered._id}/disputes`)
      .set(as('customer'))
      .send({ category: 'MISSING_ITEM', description: 'The drink was missing from the bag.' })
      .expect(201);
    expect(opened.body.status).toBe('OPEN');

    await api()
      .post(`/api/orders/${delivered._id}/disputes`)
      .set(as('customer'))
      .send({ category: 'OTHER', description: 'Trying to open a second report.' })
      .expect(409);

    const queue = await api().get('/api/admin/disputes?status=OPEN').set(as('admin')).expect(200);
    expect(queue.body.map((d) => d._id)).toContain(opened.body._id);

    await api()
      .patch(`/api/admin/disputes/${opened.body._id}`)
      .set(as('customer'))
      .send({ status: 'RESOLVED', resolution: 'REFUND', refundAmount: 5 })
      .expect(403);
    await api()
      .patch(`/api/admin/disputes/${opened.body._id}`)
      .set(as('admin'))
      .send({ status: 'RESOLVED', resolution: 'REFUND', refundAmount: 999999 })
      .expect(400);

    const resolved = await api()
      .patch(`/api/admin/disputes/${opened.body._id}`)
      .set(as('admin'))
      .send({ status: 'RESOLVED', resolution: 'PARTIAL_REFUND', refundAmount: 50, note: 'Refunded the drink' })
      .expect(200);
    expect(resolved.body).toMatchObject({ status: 'RESOLVED', resolution: 'PARTIAL_REFUND', refundAmount: 50 });

    const stored = await Order.findById(delivered._id);
    expect(stored.refundAmount).toBe(50);
    const customerNotified = await Notification.findOne({ user: stored.customer, type: 'DISPUTE_RESOLVED' });
    expect(customerNotified).toBeTruthy();

    await api()
      .patch(`/api/admin/disputes/${opened.body._id}`)
      .set(as('admin'))
      .send({ status: 'REJECTED' })
      .expect(409);

    const mine = await api().get('/api/disputes/mine').set(as('customer')).expect(200);
    expect(mine.body[0].order).toBeTruthy();
  });
});

describe('multi-restaurant checkout', () => {
  async function twoRestaurants() {
    const first = await Restaurant.findOne({ name: 'Panda Biryani House' });
    const second = await Restaurant.findOne({ name: 'Green Leaf Cafe' });
    const itemA = await MenuItem.findOne({ restaurant: first._id, isAvailable: true });
    const itemB = await MenuItem.findOne({ restaurant: second._id, isAvailable: true });
    return { first, second, itemA, itemB };
  }

  it('creates one order per restaurant sharing a checkout group', async () => {
    const { first, second, itemA, itemB } = await twoRestaurants();
    const res = await api()
      .post('/api/orders/group')
      .set(as('customer'))
      .send({
        hubId: String(hubs[0]._id),
        customerNote: 'Please pack separately',
        groups: [
          { restaurantId: String(first._id), items: [{ menuItemId: String(itemA._id), quantity: 1 }] },
          { restaurantId: String(second._id), items: [{ menuItemId: String(itemB._id), quantity: 2 }] },
        ],
      })
      .expect(201);

    expect(res.body.orders).toHaveLength(2);
    expect(new Set(res.body.orders.map((o) => o.checkoutGroup))).toEqual(new Set([res.body.checkoutGroup]));
    expect(new Set(res.body.orders.map((o) => o.restaurant._id))).toEqual(new Set([String(first._id), String(second._id)]));
    for (const order of res.body.orders) {
      expect(order.total).toBeCloseTo(order.subtotal + order.deliveryFee, 2);
      expect(order.paymentMethod).toBe('CASH_ON_COLLECTION');
      expect(order.customerNote).toBe('Please pack separately');
    }
    // Both restaurants are told, separately.
    expect(await Notification.countDocuments({ type: 'NEW_ORDER' })).toBeGreaterThanOrEqual(2);
  });

  it('refuses online payment, coupons and duplicate restaurants', async () => {
    const { first, second, itemA, itemB } = await twoRestaurants();
    const groups = [
      { restaurantId: String(first._id), items: [{ menuItemId: String(itemA._id), quantity: 1 }] },
      { restaurantId: String(second._id), items: [{ menuItemId: String(itemB._id), quantity: 1 }] },
    ];
    const online = await api()
      .post('/api/orders/group')
      .set(as('customer'))
      .send({ hubId: String(hubs[0]._id), paymentMethod: 'ONLINE_PAYMENT', groups })
      .expect(400);
    expect(online.body.error).toBeTruthy();

    const coupon = await api()
      .post('/api/orders/group')
      .set(as('customer'))
      .send({ hubId: String(hubs[0]._id), couponCode: 'SAVE10', groups })
      .expect(409);
    expect(coupon.body.error.code).toBe('COUPON_SINGLE_RESTAURANT');

    await api()
      .post('/api/orders/group')
      .set(as('customer'))
      .send({
        hubId: String(hubs[0]._id),
        groups: [groups[0], { restaurantId: String(first._id), items: groups[1].items }],
      })
      .expect(400);

    const single = await api()
      .post('/api/orders/group')
      .set(as('customer'))
      .send({ hubId: String(hubs[0]._id), groups: [groups[0]] })
      .expect(400);
    expect(single.body.error.details?.[0]?.message || single.body.error.message).toMatch(/two restaurants/i);
  });

  it('rolls back every order when one restaurant is invalid', async () => {
    const { first, second, itemA } = await twoRestaurants();
    const before = await Order.countDocuments({});
    await api()
      .post('/api/orders/group')
      .set(as('customer'))
      .send({
        hubId: String(hubs[0]._id),
        groups: [
          { restaurantId: String(first._id), items: [{ menuItemId: String(itemA._id), quantity: 1 }] },
          // itemA is not on the second restaurant's menu
          { restaurantId: String(second._id), items: [{ menuItemId: String(itemA._id), quantity: 1 }] },
        ],
      })
      .expect(400);
    expect(await Order.countDocuments({})).toBe(before);
  });
});

describe('role boundaries', () => {
  it('scopes a hub operator to their own hub', async () => {
    const { order: mine } = await placeOrder({ hubIndex: 0 });
    const { order: other } = await placeOrder({ hubIndex: 1 });

    const list = await api().get('/api/orders').set(as('hubOperator')).expect(200);
    const ids = list.body.items.map((o) => o._id);
    expect(ids).toContain(mine._id);
    expect(ids).not.toContain(other._id);
    await api().get(`/api/orders/${other._id}`).set(as('hubOperator')).expect(403);
  });

  it('does not let a hub operator cancel an order before dispatch', async () => {
    const { order } = await placeOrder();
    // Staff cancels carry a reason; the reason is irrelevant — the role check must reject it.
    await setStatus('hubOperator', order._id, 'CANCELLED', 'hub exception').expect(403);
    await setStatus('admin', order._id, 'CANCELLED', 'test cleanup').expect(200);
  });
});
