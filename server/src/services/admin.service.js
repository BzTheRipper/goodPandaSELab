import { DRONE_STATUS, FINAL_STATUSES, ORDER_STATUS, RESTAURANT_STATUS, ROLES } from '../constants.js';
import { env } from '../config/env.js';
import { Drone, Hub, Order, Restaurant, User, recordBatteryEvent } from '../models/index.js';
import { emitToAdmins, disconnectUser } from '../realtime.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { audit } from './audit.service.js';
import { chargingController } from './drone/index.js';

export async function dashboard() {
  const [byStatus, activeDrones, droneCounts, pendingRestaurants, interventions, sales, hubs] = await Promise.all([
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Drone.countDocuments({ status: { $in: [DRONE_STATUS.LOADED, DRONE_STATUS.IN_FLIGHT] } }),
    Drone.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Restaurant.countDocuments({ status: RESTAURANT_STATUS.PENDING }),
    Order.countDocuments({ needsAdminIntervention: true }),
    Order.aggregate([
      { $match: { status: ORDER_STATUS.COLLECTED } },
      { $group: { _id: null, gross: { $sum: '$total' }, deliveryFees: { $sum: '$deliveryFee' } } },
    ]),
    Hub.aggregate([
      {
        $lookup: {
          from: 'orders',
          let: { hubId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$hub', '$$hubId'] } } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ],
          as: 'counts',
        },
      },
      {
        $project: {
          name: 1,
          isActive: 1,
          totalOrders: { $sum: '$counts.count' },
          awaitingPickup: {
            $ifNull: [
              {
                $first: {
                  $map: {
                    input: { $filter: { input: '$counts', as: 'c', cond: { $eq: ['$$c._id', ORDER_STATUS.ARRIVED_AT_HUB] } } },
                    as: 'm',
                    in: '$$m.count',
                  },
                },
              },
              0,
            ],
          },
        },
      },
      { $sort: { awaitingPickup: -1, name: 1 } },
    ]),
  ]);
  const ordersByStatus = Object.fromEntries(Object.values(ORDER_STATUS).map((s) => [s, 0]));
  byStatus.forEach((r) => (ordersByStatus[r._id] = r.count));
  return {
    ordersByStatus,
    activeDrones,
    dronesByStatus: Object.fromEntries(droneCounts.map((r) => [r._id, r.count])),
    pendingRestaurants,
    ordersNeedingIntervention: interventions,
    grossSales: sales[0]?.gross || 0,
    deliveryFeeRevenue: sales[0]?.deliveryFees || 0,
    hubs,
  };
}

// ---- users ----
export const listUsers = (role) => User.find(role ? { role } : {}).populate('hub', 'name').sort({ createdAt: -1 });

export async function createHubOperator({ name, email, phone, password, hubId }, actor) {
  if (!await Hub.exists({ _id: hubId })) throw notFound('Hub');
  const { hashPassword } = await import('./auth.service.js');
  const user = await User.create({
    name,
    email: email.toLowerCase().trim(),
    passwordHash: await hashPassword(password),
    phone,
    role: ROLES.HUB_OPERATOR,
    hub: hubId,
  });
  await audit({ actor, action: 'HUB_OPERATOR_CREATED', targetType: 'user', target: user._id, summary: `${user.name} at ${hubId}` });
  return user;
}

export async function setUserActive(admin, id, isActive) {
  if (String(admin._id) === String(id)) throw badRequest('You cannot change your own account status');
  const user = await User.findById(id);
  if (!user) throw notFound('User');
  if (!isActive) {
    // Never let the platform be left without an active admin.
    if (user.role === ROLES.ADMIN) {
      const remaining = await User.countDocuments({ role: ROLES.ADMIN, isActive: true, _id: { $ne: user._id } });
      if (remaining === 0) throw conflict('The last active admin cannot be deactivated. Promote another admin first.', 'LAST_ADMIN');
    }
    if (user.role === ROLES.OWNER) await Restaurant.updateOne({ owner: user._id }, { isOpen: false });
  }
  user.isActive = isActive;
  await user.save();
  // A deactivated account must lose its live socket too, not just its HTTP access.
  if (!isActive) disconnectUser(user._id);
  await audit({
    actor: admin,
    action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
    targetType: 'user',
    target: user._id,
    summary: `${user.name} (${user.role})`,
  });
  return user;
}

// ---- hubs ----
export const listHubs = (activeOnly) => Hub.find(activeOnly ? { isActive: true } : {}).sort({ name: 1 });

const hubDoc = ({ lat, lng, ...rest }, existing) => {
  const doc = { ...rest };
  if (lat !== undefined || lng !== undefined) {
    doc.location = { lat: lat ?? existing?.location.lat, lng: lng ?? existing?.location.lng };
  }
  return doc;
};

export async function createHub(data, actor) {
  const hub = await Hub.create(hubDoc(data));
  await audit({ actor, action: 'HUB_CREATED', targetType: 'hub', target: hub._id, summary: hub.name });
  return hub;
}

export async function updateHub(id, data, actor) {
  const hub = await Hub.findById(id);
  if (!hub) throw notFound('Hub');
  const wasActive = hub.isActive;
  hub.set(hubDoc(data, hub));
  await hub.save();
  if (wasActive !== hub.isActive) {
    await audit({
      actor,
      action: hub.isActive ? 'HUB_ACTIVATED' : 'HUB_DEACTIVATED',
      targetType: 'hub',
      target: hub._id,
      summary: hub.name,
    });
  }
  return hub;
}

export async function deleteHub(id, actor) {
  if (await Order.exists({ hub: id, status: { $nin: FINAL_STATUSES } })) {
    throw conflict('This hub has active orders. Deactivate it instead.');
  }
  const hub = await Hub.findByIdAndDelete(id);
  if (!hub) throw notFound('Hub');
  await audit({ actor, action: 'HUB_DELETED', targetType: 'hub', target: hub._id, summary: hub.name });
}

// ---- drones ----
export const listDrones = () => Drone.find().populate('currentOrder', 'status hub').sort({ identifier: 1 });

export async function createDrone({ identifier, lat, lng, battery, capacityUnits }, actor) {
  const drone = await Drone.create({
    identifier,
    battery: battery ?? 100,
    ...(capacityUnits !== undefined && { capacityUnits }),
    ...(lat !== undefined && lng !== undefined && { location: { lat, lng } }),
  });
  await audit({ actor, action: 'DRONE_CREATED', targetType: 'drone', target: drone._id, summary: drone.identifier });
  emitToAdmins('drone:updated', drone.toJSON());
  return drone;
}

export async function updateDrone(
  id,
  { identifier, lat, lng, battery, status, capacityUnits, maintenanceDueAt, maintenanceNote, serviceNow },
  actor
) {
  const drone = await Drone.findById(id);
  if (!drone) throw notFound('Drone');
  const busy = [DRONE_STATUS.LOADED, DRONE_STATUS.IN_FLIGHT].includes(drone.status);
  if (status && busy) throw conflict('Drone is on a delivery. Use "mark failed" to take it out of service.');
  if (status === DRONE_STATUS.IDLE && drone.currentOrder) throw conflict('Resolve the drone\'s current order first');
  if (identifier !== undefined) drone.identifier = identifier;
  if (battery !== undefined) {
    recordBatteryEvent(drone, 'MANUAL_ADJUST', battery);
    drone.battery = battery;
  }
  if (capacityUnits !== undefined) drone.capacityUnits = capacityUnits;
  if (lat !== undefined && lng !== undefined && !busy) drone.location = { lat, lng };
  if (status) drone.status = status;
  if (maintenanceDueAt !== undefined) drone.maintenanceDueAt = maintenanceDueAt ? new Date(maintenanceDueAt) : null;
  if (maintenanceNote !== undefined) drone.maintenanceNote = maintenanceNote;
  // Completing service clears the due marker and stamps the service date.
  const completingService = serviceNow && [DRONE_STATUS.MAINTENANCE, DRONE_STATUS.CHARGING].includes(drone.status);
  if (completingService) {
    drone.maintenanceDueAt = null;
    drone.lastServiceAt = new Date();
    drone.maintenanceNote = '';
    // Reset the trip counter, otherwise the service threshold trips again on every flight.
    drone.tripsCompleted = 0;
    if (drone.status === DRONE_STATUS.MAINTENANCE) drone.status = DRONE_STATUS.IDLE;
    recordBatteryEvent(drone, 'SERVICED', drone.battery);
  }
  // Putting a flat drone back into service would just make it unusable again; dock it instead.
  const needsCharge = drone.status === DRONE_STATUS.IDLE && drone.battery < env.drone.readyCharge;
  if (needsCharge) drone.status = DRONE_STATUS.CHARGING;
  await drone.save();
  // Taking a drone out of the charging state also stops its dock timer.
  if (drone.status === DRONE_STATUS.CHARGING) chargingController.start(String(drone._id));
  else chargingController.stop(String(drone._id));

  if (status || completingService) {
    await audit({
      actor,
      action: completingService ? 'DRONE_SERVICED' : status === DRONE_STATUS.MAINTENANCE ? 'DRONE_MAINTENANCE' : 'DRONE_RETURNED',
      targetType: 'drone',
      target: drone._id,
      summary: drone.identifier,
    });
  }
  emitToAdmins('drone:updated', drone.toJSON());
  return drone;
}

/** Fleet health: upcoming service, battery trend and lifetime usage for the maintenance page. */
export async function fleetHealth() {
  const drones = await Drone.find().sort({ identifier: 1 });
  const now = Date.now();
  const staleAfterMs = env.drone.staleAfterSeconds * 1000;
  return drones.map((d) => ({
    id: d._id,
    identifier: d.identifier,
    status: d.status,
    battery: d.battery,
    capacityUnits: d.capacityUnits,
    tripsCompleted: d.tripsCompleted || 0,
    distanceKm: Math.round((d.distanceKm || 0) * 10) / 10,
    lastFailureAt: d.lastFailureAt,
    lastServiceAt: d.lastServiceAt,
    lastTelemetryAt: d.lastTelemetryAt,
    // Only meaningful once a drone has reported real hardware telemetry at least once.
    telemetryStale: Boolean(d.lastTelemetryAt && now - new Date(d.lastTelemetryAt).getTime() > staleAfterMs),
    maintenanceDueAt: d.maintenanceDueAt,
    maintenanceNote: d.maintenanceNote,
    serviceDue: Boolean(d.maintenanceDueAt && new Date(d.maintenanceDueAt).getTime() <= now),
    batteryHistory: (d.batteryHistory || []).slice(-30),
  }));
}

export async function deleteDrone(id, actor) {
  const drone = await Drone.findById(id);
  if (!drone) throw notFound('Drone');
  if (drone.currentOrder) throw conflict('Drone is assigned to an order');
  chargingController.stop(String(drone._id));
  await drone.deleteOne();
  await audit({ actor, action: 'DRONE_DELETED', targetType: 'drone', target: id, summary: drone.identifier });
}

// ---- payouts ----

export async function listPayouts({ status, restaurantId, page = 1, limit = 50 } = {}) {
  // Only collected orders owe the restaurant money; cancelled/rejected rows are VOID on transition.
  const filter = { status: ORDER_STATUS.COLLECTED, payoutStatus: status || { $ne: 'VOID' } };
  if (restaurantId) filter.restaurant = restaurantId;
  const size = Math.min(Number(limit) || 50, 200);
  const current = Math.max(1, Number(page) || 1);
  const [items, total] = await Promise.all([
    Order.find(filter)
      .populate('restaurant', 'name owner')
      .sort({ collectedAt: -1 })
      .skip((current - 1) * size)
      .limit(size),
    Order.countDocuments(filter),
  ]);
  const pendingTotal = items
    .filter((o) => o.payoutStatus === 'PENDING')
    .reduce((sum, o) => sum + (o.payoutAmount || 0), 0);
  return { items, page: current, limit: size, total, pages: Math.max(1, Math.ceil(total / size)), pendingTotal };
}

export async function markPayoutPaid(orderId, actor) {
  const order = await Order.findById(orderId).populate('restaurant', 'name');
  if (!order) throw notFound('Order');
  if (order.status !== ORDER_STATUS.COLLECTED) throw conflict('Only collected orders can be paid out');
  if (order.payoutStatus !== 'PENDING') throw conflict('Payout is not pending');
  order.payoutStatus = 'PAID';
  order.payoutAt = new Date();
  await order.save();
  await audit({
    actor,
    action: 'PAYOUT_PAID',
    targetType: 'order',
    target: order._id,
    summary: `৳${order.payoutAmount} to ${order.restaurant?.name || 'restaurant'}`,
  });
  return order;
}
