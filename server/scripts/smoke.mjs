const BASE = process.env.SMOKE_BASE || 'http://localhost:5173/api';

async function call(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}
const login = async (email, password) => (await call('POST', '/auth/login', null, { email, password })).token;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (msg) => console.log('✓', msg);

const customer = await login('customer@goodpanda.test', 'customer123');
const owner = await login('owner1@goodpanda.test', 'owner123');
const admin = await login('admin@goodpanda.test', 'admin123');
step('logged in as customer, owner1, admin');

const restaurants = await call('GET', '/restaurants');
const panda = restaurants.find((r) => r.name === 'Panda Biryani House');
const detail = await call('GET', `/restaurants/${panda._id}`);
const item = detail.menu.find((m) => m.isAvailable);
const hubs = await call('GET', '/hubs');
step(`browsed ${restaurants.length} restaurants, ${hubs.length} hubs`);

let order = await call('POST', '/orders', customer, {
  restaurantId: panda._id,
  hubId: hubs[0]._id,
  items: [{ menuItemId: item._id, quantity: 2, note: 'extra spicy' }],
  customerNote: 'smoke test',
});
step(`order placed, total ৳${order.total} (${order.status})`);

for (const status of ['ACCEPTED', 'PREPARING']) {
  order = await call('PATCH', `/orders/${order._id}/status`, owner, { status });
}
await call('POST', `/orders/${order._id}/confirmation-request`, owner, { type: 'NOTE_UNMET', message: 'No extra spice left' });
order = await call('POST', `/orders/${order._id}/confirmation-response`, customer, { decision: 'CONTINUE' });
step(`confirmation flow resolved, back to ${order.status}`);

await call('POST', `/orders/${order._id}/messages`, customer, { text: 'Thanks!' });
const messages = await call('GET', `/orders/${order._id}/messages`, owner);
step(`chat has ${messages.length} messages`);

order = await call('PATCH', `/orders/${order._id}/status`, owner, { status: 'READY_FOR_DRONE' });
const drones = await call('GET', '/drones/available', owner);
await call('POST', `/orders/${order._id}/load-drone`, owner, { droneId: drones[0]._id });
await call('POST', `/orders/${order._id}/dispatch`, owner);
step(`dispatched drone ${drones[0].identifier}`);

for (let i = 0; i < 240; i++) {
  order = await call('GET', `/orders/${order._id}`, customer);
  if (order.status === 'ARRIVED_AT_HUB') break;
  await sleep(1000);
}
if (order.status !== 'ARRIVED_AT_HUB') throw new Error(`drone never arrived (${order.status})`);
step(`drone arrived at hub, pickup code ${order.pickupCode}`);

order = await call('POST', `/orders/${order._id}/collect`, admin, { pickupCode: order.pickupCode });
step(`collected: status ${order.status}, payment ${order.paymentStatus}`);

const dash = await call('GET', '/admin/dashboard', admin);
step(`admin dashboard: ${JSON.stringify(dash).slice(0, 120)}...`);
