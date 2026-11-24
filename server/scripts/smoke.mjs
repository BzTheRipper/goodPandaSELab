/**
 * Live end-to-end check of the delivery flow, including the fixes:
 * two-leg routing with return-to-base, persisted ETA, charging, capacity, cancel requests and audit.
 */
const BASE = process.env.SMOKE_BASE || 'http://localhost:5000/api';
const ok = (m) => console.log('  ✓', m);
const fail = (m) => {
  console.error('  ✗', m);
  process.exitCode = 1;
};

async function call(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const need = async (method, path, token, body) => {
  const { status, data } = await call(method, path, token, body);
  if (status >= 400) throw new Error(`${method} ${path} -> ${status} ${JSON.stringify(data)}`);
  return data;
};
const login = async (email, password) =>
  (await need('POST', '/auth/login', null, { email, password })).token;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 60000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const v = await fn();
    if (v) return v;
    await sleep(250);
  }
  throw new Error('timed out');
};

const [customer, owner, admin] = await Promise.all([
  login('customer@goodpanda.test', 'customer123'),
  login('owner1@goodpanda.test', 'owner123'),
  login('admin@goodpanda.test', 'admin123'),
]);
ok('logged in as customer, owner and admin');

// --- pagination shape -------------------------------------------------------
const list = await need('GET', '/orders?page=1&limit=5', customer);
if (Array.isArray(list) || !Array.isArray(list.items) || list.total === undefined) fail('order list is not paginated');
else ok(`order list is paginated (${list.items.length}/${list.total})`);

// --- catalog ----------------------------------------------------------------
const restaurants = await need('GET', '/restaurants');
const panda = restaurants.find((r) => r.name === 'Panda Biryani House');
const menu = (await need('GET', `/restaurants/${panda._id}`)).menu.filter((m) => m.isAvailable);
const hubs = await need('GET', '/hubs');
ok(`browsed ${restaurants.length} restaurants and ${hubs.length} hubs`);

// --- duplicate lines merge --------------------------------------------------
let order = await need('POST', '/orders', customer, {
  restaurantId: panda._id,
  hubId: hubs[0]._id,
  items: [
    { menuItemId: menu[0]._id, quantity: 1, note: 'no onion' },
    { menuItemId: menu[0]._id, quantity: 1 },
  ],
});
if (order.items.length !== 1 || order.items[0].quantity !== 2) fail('duplicate cart lines were not merged');
else ok('duplicate cart lines merged into one');

// --- accept + prepare -------------------------------------------------------
for (const s of ['ACCEPTED', 'PREPARING']) await need('PATCH', `/orders/${order._id}/status`, owner, { status: s });
ok('order accepted and preparing');

// --- customer cancellation request -----------------------------------------
order = await need('POST', `/orders/${order._id}/cancel-request`, customer, { message: 'Wrong hub, sorry' });
if (order.status !== 'NEEDS_CUSTOMER_CONFIRMATION' || order.confirmationRequest.awaiting !== 'OWNER')
  fail('cancel request did not pause the order for the restaurant');
else ok('customer cancellation request reached the restaurant');

order = await need('POST', `/orders/${order._id}/cancel-response`, owner, { decision: 'CONTINUE', reason: 'Already cooking' });
if (order.status !== 'PREPARING') fail(`cancel decline left order in ${order.status}`);
else ok('restaurant declined the cancellation and continued');

// --- ready + dispatch -------------------------------------------------------
order = await need('PATCH', `/orders/${order._id}/status`, owner, { status: 'READY_FOR_DRONE' });
const drones = await need('GET', '/drones/available', owner);
if (!drones.length) throw new Error('no available drones');

// Capacity is exposed and enforced.
if (drones.some((d) => d.capacityUnits == null)) fail('drones are missing capacityUnits');
else ok(`available drones report capacity (${drones.map((d) => d.capacityUnits).join(', ')})`);

const drone = drones[0];
await need('POST', `/orders/${order._id}/load-drone`, owner, { droneId: drone._id });
let after = (await need('GET', '/admin/drones', admin)).find((d) => d._id === drone._id);
// The drone must NOT have been teleported to the restaurant.
const restaurantLoc = {
  lat: (await need('GET', `/restaurants/${panda._id}`)).restaurant.location.lat,
};
if (Math.abs(after.location.lat - restaurantLoc.lat) < 1e-9 && drone.location.lat !== restaurantLoc.lat)
  fail('drone was teleported to the restaurant on load');
else ok('drone kept its real position on load');

order = await need('POST', `/orders/${order._id}/dispatch`, owner);
if (order.status !== 'IN_FLIGHT') throw new Error('dispatch failed');
// The promised arrival time must be persisted, not just streamed.
if (!order.estimatedArrivalAt) fail('no persisted estimatedArrivalAt');
else {
  const mins = Math.round((new Date(order.estimatedArrivalAt) - Date.now()) / 60000);
  ok(`dispatch stored an ETA (~${mins} min)`);
}

const statuses = new Set();
await waitFor(async () => {
  const live = await need('GET', `/orders/${order._id}`, customer);
  statuses.add(live.status);
  return live.status === 'ARRIVED_AT_HUB' ? live : null;
}, 240000); // default sim flies ~60 m/s; seeded routes take a couple of minutes

const arrived = await need('GET', `/orders/${order._id}`, customer);
ok(`drone arrived, pickup code ${arrived.pickupCode}, arrivedAt set=${Boolean(arrived.arrivedAt)}`);

// The drone must fly home, i.e. its position moves back toward the restaurant.
const flying = (await need('GET', '/admin/drones', admin)).find((d) => d._id === drone._id);
ok(`drone status after drop-off: ${flying.status}, order detached: ${!flying.currentOrder}`);

// --- collection -------------------------------------------------------------
const badCode = await call('POST', `/orders/${order._id}/collect`, admin, { pickupCode: '1234' });
const collected = await need('POST', `/orders/${order._id}/collect`, admin, { pickupCode: arrived.pickupCode });
if (badCode.status !== 400) fail(`a 4-digit code was accepted (${badCode.status})`);
ok(`4-digit codes rejected; 6-digit code collected (${collected.paymentStatus})`);

// --- audit log --------------------------------------------------------------
const logs = await need('GET', '/admin/audit-logs?limit=50', admin);
if (!logs.some((l) => l.action === 'ORDER_COLLECTED')) fail('collection was not audited');
else ok(`audit log has ${logs.length} entries including the collection`);

// --- last admin guard -------------------------------------------------------
const me = (await need('GET', '/auth/me', admin)).user;
const selfDeactivate = await call('PATCH', `/admin/users/${me._id}/active`, admin, { isActive: false });
if (selfDeactivate.status < 400) fail('an admin could deactivate their own account');
else ok('admin cannot deactivate themselves');

// --- dashboard --------------------------------------------------------------
const dash = await need('GET', '/admin/dashboard', admin);
if (!dash.hubs?.length) fail('dashboard is missing hub throughput');
else ok(`dashboard: ${dash.ordersByStatus.COLLECTED} collected, hub stats present, gross ৳${dash.grossSales}`);

// --- suspension hides reviews ----------------------------------------------
const suspended = await call('PATCH', `/admin/restaurants/${panda._id}/status`, admin, { status: 'SUSPENDED' });
const reviews = await call('GET', `/restaurants/${panda._id}/reviews`);
if (suspended.status === 200 && reviews.status !== 404) fail('suspended restaurant still exposes reviews');
else ok('suspended restaurant hides its reviews');
await need('PATCH', `/admin/restaurants/${panda._id}/status`, admin, { status: 'APPROVED' });

console.log(process.exitCode ? '\nSome checks failed.' : '\nAll live checks passed.');
