import { AVAILABLE_DRONE_STATUSES, DRONE_STATUS, ORDER_STATUS as S, ROLES, STAFF_ROLES } from '../constants.js';
import { env } from '../config/env.js';
import { Drone, Order, recordBatteryEvent } from '../models/index.js';
import { emitToAdmins, emitToHub, emitToUser } from '../realtime.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { audit } from './audit.service.js';
import { chargingController, flightController } from './drone/index.js';
import { routeDistanceMeters } from './drone/routing.js';
import { emailReceipt } from './email.service.js';
import { notify, notifyAdmins, notifyHubStaff } from './notification.service.js';
import { rewardReferralOnFirstOrder, stampLoyalty } from './referral.service.js';
import {
  announce,
  customerIdOf,
  etaPhrase,
  generatePickupCode,
  generatePickupToken,
  loadOrder,
  ownerIdOf,
  releaseDrone,
  transition,
} from './order.service.js';
import { settleOnCollection } from './payment.service.js';

const { IDLE, CHARGING, LOADED, IN_FLIGHT, MAINTENANCE } = DRONE_STATUS;

/** Units of food a drone must be able to carry for an order. */
export const orderUnits = (order) => order.items.filter((i) => !i.removed).reduce((n, i) => n + i.quantity, 0);

/** Route a drone would fly: where it is now → the restaurant → the customer's hub, plus the empty return leg. */
export function planLegs(order, from) {
  const restaurant = order.restaurant.location;
  const hub = order.hub.location;
  const legs = [
    { from, to: restaurant },
    { from: restaurant, to: hub },
  ];
  if (env.drone.returnToBase) legs.push({ from: hub, to: restaurant, phase: 'RETURN' });
  return legs;
}

/** Battery needed to complete the full routed trip plus the reserve. */
export function tripBatteryNeeded(order, from) {
  return flightController.estimateBattery(planLegs(order, from)) + env.drone.batteryReserve;
}

async function ownerOrder(user, orderId) {
  const order = await loadOrder(orderId);
  if (user.role !== ROLES.OWNER || ownerIdOf(order) !== String(user._id)) throw forbidden('This order does not belong to your restaurant');
  return order;
}

const emitDrone = (drone) => emitToAdmins('drone:updated', drone.toJSON());

export const listAvailableDrones = () =>
  Drone.find({ status: { $in: AVAILABLE_DRONE_STATUSES }, currentOrder: null, battery: { $gte: env.drone.minBattery } }).sort({
    battery: -1,
  });

/**
 * Owner confirms the food is attached to a chosen drone. Atomic so two owners can't grab the same drone.
 * Battery is checked against the full routed trip, and the drone's capacity against the order size.
 */
export async function loadDrone(user, orderId, droneId) {
  const order = await ownerOrder(user, orderId);
  if (order.status !== S.READY_FOR_DRONE) throw conflict('The order must be READY_FOR_DRONE before loading a drone', 'INVALID_TRANSITION');
  if (order.drone) throw conflict('A drone is already loaded for this order');

  const units = orderUnits(order);
  const candidates = await Drone.find({ _id: droneId, status: { $in: AVAILABLE_DRONE_STATUSES }, currentOrder: null });
  const candidate = candidates[0];
  if (!candidate) throw conflict('That drone is no longer available. Pick another one.', 'DRONE_UNAVAILABLE');
  if (candidate.capacityUnits < units) {
    throw conflict(
      `That drone carries ${candidate.capacityUnits} item(s) but this order has ${units}. Pick a larger drone.`,
      'DRONE_CAPACITY'
    );
  }
  const needed = tripBatteryNeeded(order, candidate.location);
  if (candidate.battery < Math.max(env.drone.minBattery, needed)) {
    throw conflict(
      `That drone needs ${Math.ceil(needed)}% battery for this trip (it has ${Math.round(candidate.battery)}%). Pick another one.`,
      'DRONE_BATTERY'
    );
  }

  // The drone flies from wherever it is, so its location is left alone.
  const drone = await Drone.findOneAndUpdate(
    { _id: droneId, status: { $in: AVAILABLE_DRONE_STATUSES }, currentOrder: null },
    { status: LOADED, currentOrder: order._id },
    { new: true }
  );
  if (!drone) throw conflict('That drone is no longer available. Pick another one.', 'DRONE_UNAVAILABLE');
  chargingController.stop(String(drone._id));

  try {
    order.drone = drone._id;
    await order.save();
  } catch (err) {
    await Drone.updateOne({ _id: drone._id }, { status: IDLE, currentOrder: null });
    throw err;
  }
  emitDrone(drone);
  const fresh = await loadOrder(order._id);
  await announce(fresh, { actorId: user._id, title: `Drone ${drone.identifier} loaded` });
  return fresh;
}

export async function unloadDrone(user, orderId) {
  const order = await ownerOrder(user, orderId);
  if (order.status !== S.READY_FOR_DRONE || !order.drone) throw conflict('No loaded drone to unload');
  const droneId = String(order.drone._id);
  await releaseDrone(order);
  await order.save();
  // A drone that was charged enough to be offered goes back on the dock.
  await maybeDock(droneId);
  const fresh = await loadOrder(order._id);
  await announce(fresh, { actorId: user._id, title: 'Drone unloaded' });
  return fresh;
}

/** Puts a landed drone on the charging dock unless it is already healthy enough to fly again. */
async function maybeDock(droneId) {
  const drone = await Drone.findById(droneId);
  if (!drone || drone.status !== IDLE) return drone;
  if (drone.battery < env.drone.readyCharge) {
    drone.status = CHARGING;
    recordBatteryEvent(drone, 'DOCKED', drone.battery);
    await drone.save();
    chargingController.start(String(drone._id));
    emitDrone(drone);
  }
  return drone;
}

function startFlight(order, drone) {
  const customerId = customerIdOf(order);
  const ownerId = ownerIdOf(order);
  const droneId = String(drone._id);
  const orderId = String(order._id);
  const legs = planLegs(order, drone.location);

  const tripKm = routeDistanceMeters(legs) / 1000;

  return flightController.startFlight({
    droneId,
    legs,
    battery: drone.battery,
    minBattery: env.drone.minBattery,
    onBatteryDead: async ({ location, battery }) => {
      // Drone ran out of charge mid-flight: ground it, flag the order for admin intervention.
      await Drone.updateOne(
        { _id: droneId },
        {
          status: MAINTENANCE,
          lastFailureAt: new Date(),
          currentOrder: null,
          destination: null,
          location,
          battery,
        }
      );
      const grounded = await Drone.findById(droneId);
      if (grounded) {
        recordBatteryEvent(grounded, 'BATTERY_DEAD', battery);
        await grounded.save();
        emitDrone(grounded);
      }
      await Order.updateOne({ _id: orderId }, { needsAdminIntervention: true, interventionReason: `Drone ${drone.identifier} ran out of battery mid-flight` });
      await notifyAdmins({
        type: 'DRONE_FAILED',
        title: `Drone ${drone.identifier} ran out of battery`,
        body: `Order #${String(orderId).slice(-6)} needs intervention — drone grounded mid-flight.`,
        order: orderId,
      });
    },
    onProgress: async ({ location, battery, progress, etaSeconds }) => {
      await Drone.updateOne({ _id: droneId }, { location, battery });
      const payload = { orderId, droneId, identifier: drone.identifier, location, battery, progress, etaSeconds };
      emitToUser(customerId, 'drone:location', payload);
      emitToUser(ownerId, 'drone:location', payload);
      emitToAdmins('drone:location', payload);

      // One-shot "about 5 minutes away" nudge, based on live progress rather than a wall-clock timer.
      // Use the drop-off ETA, not the whole round trip: the empty return leg must not trigger it.
      const arrivalEtaSeconds = deliveryEtaSeconds(order, location);
      if (arrivalEtaSeconds > 0 && arrivalEtaSeconds <= env.drone.approachingEtaSeconds) {
        const fresh = await Order.findById(orderId).select('approachingNotifiedAt');
        if (fresh && !fresh.approachingNotifiedAt) {
          await Order.updateOne({ _id: orderId, approachingNotifiedAt: null }, { approachingNotifiedAt: new Date() });
          await notify([customerId], {
            type: 'APPROACHING',
            title: `Almost there — arriving in about ${Math.max(1, Math.ceil(arrivalEtaSeconds / 60))} min`,
            body: `Get ready to meet the drone at ${order.hub.name}. Show your pickup code to collect.`,
            order: orderId,
          });
        }
      }
    },
    // Fires when the food is dropped at the hub, before the empty return leg begins.
    onDelivered: (payload) => handleArrival(orderId, droneId, payload),
    // End of the whole trip: the drone has landed and can be docked or left idle.
    onArrive: async ({ location, battery }) => {
      const droneAfter = await Drone.findById(droneId);
      if (env.drone.serviceEveryTrips > 0 && droneAfter && droneAfter.tripsCompleted + 1 >= env.drone.serviceEveryTrips) {
        await Drone.updateOne(
          { _id: droneId },
          {
            status: MAINTENANCE,
            maintenanceDueAt: new Date(),
            maintenanceNote: 'Scheduled service due after maximum trips',
            currentOrder: null,
            destination: null,
            location,
            battery,
          }
        );
        const serviced = await Drone.findById(droneId);
        if (serviced) {
          recordBatteryEvent(serviced, 'SERVICE_DUE', battery);
          await serviced.save();
          emitDrone(serviced);
        }
        await notifyAdmins({ type: 'DRONE_SERVICE_DUE', title: `${serviced.identifier} is due for service`, body: 'Scheduled maintenance threshold reached' });
        return;
      }
      await Drone.updateOne(
        { _id: droneId },
        {
          status: IDLE,
          currentOrder: null,
          destination: null,
          location,
          battery,
          $inc: { tripsCompleted: 1, distanceKm: Math.round(tripKm * 100) / 100 },
        }
      );
      const landed = await Drone.findById(droneId);
      if (landed) {
        recordBatteryEvent(landed, 'LANDED', battery);
        await landed.save();
      }
      await maybeDock(droneId);
    },
  });
}

/**
 * Accepts a position/battery report from real drone hardware and fans it out like simulated
 * telemetry. `seq` is monotonic per drone: older or duplicate reports are ignored.
 */
export async function ingestTelemetry(droneId, { lat, lng, battery, status, seq }) {
  const drone = await Drone.findById(droneId);
  if (!drone) throw notFound('Drone');
  if (seq !== undefined && drone.telemetrySeq && seq <= drone.telemetrySeq) {
    return { drone, ignored: true };
  }

  drone.location = { lat, lng };
  if (battery !== undefined) drone.battery = battery;
  if (status) drone.status = status;
  drone.lastTelemetryAt = new Date();
  if (seq !== undefined) drone.telemetrySeq = seq;
  await drone.save();

  const orderId = drone.currentOrder ? String(drone.currentOrder) : null;
  if (orderId) {
    const order = await Order.findById(orderId).select('customer hub');
    const payload = {
      orderId,
      droneId: String(drone._id),
      identifier: drone.identifier,
      location: drone.location,
      battery: drone.battery,
      source: 'hardware',
    };
    if (order) {
      emitToUser(order.customer, 'drone:location', payload);
      emitToHub(order.hub, 'drone:location', payload);
    }
    emitToAdmins('drone:location', payload);
  }
  emitToAdmins('drone:updated', drone.toJSON());
  return { drone, ignored: false };
}

/** Seconds until the drone reaches the hub drop-off, discounting any empty return leg. */export function deliveryEtaSeconds(order, from) {
  const legs = planLegs(order, from).filter((leg) => leg.phase !== 'RETURN');
  return Math.round(routeDistanceMeters(legs) / Math.max(1, env.drone.speedMps));
}

/** The one command an owner can give: "dispatch to the customer's hub". Routing is up to the drone. */
export async function dispatch(user, orderId) {
  const order = await ownerOrder(user, orderId);
  if (!order.drone) throw badRequest('Load the food onto a drone first');
  if (!order.hub.isActive) throw conflict('The destination hub is inactive. Contact admin.');

  const drone = await Drone.findOneAndUpdate(
    { _id: order.drone._id, status: LOADED, currentOrder: order._id },
    { status: IN_FLIGHT, destination: order.hub.location },
    { new: true }
  );
  if (!drone) throw conflict('The loaded drone is not ready for dispatch', 'DRONE_UNAVAILABLE');

  const estimatedArrivalAt = new Date(Date.now() + deliveryEtaSeconds(order, drone.location) * 1000);

  try {
    await transition(order, S.IN_FLIGHT, user, {
      note: `Dispatched ${drone.identifier} to ${order.hub.name}`,
      mutate: (o) => {
        o.estimatedArrivalAt = estimatedArrivalAt;
        o.dispatchedAt = new Date();
      },
      announceOpts: { body: `Arriving at ${order.hub.name} ${etaPhrase(estimatedArrivalAt)}.` },
    });
  } catch (err) {
    await Drone.updateOne({ _id: drone._id }, { status: LOADED, destination: null });
    throw err;
  }
  emitDrone(drone);
  startFlight(order, drone);
  return loadOrder(order._id);
}

export async function handleArrival(orderId, droneId, { location, battery }) {
  const order = await loadOrder(orderId);
  if (order.status !== S.IN_FLIGHT) return null;

  const code = generatePickupCode();
  const token = generatePickupToken();
  const arrived = await transition(order, S.ARRIVED_AT_HUB, null, {
    note: `Arrived at ${order.hub.name}`,
    mutate: (o) => {
      o.pickupCode = code;
      o.pickupToken = token;
      o.arrivedAt = new Date();
      // The promised time is now in the past; keep a ground-truth arrival for the record.
      o.estimatedArrivalAt = o.estimatedArrivalAt || new Date();
    },
    announceOpts: { body: `Collect it at ${order.hub.name}. Your pickup code is on the order page.` },
  });

  // The drone is free of this order as soon as the food is dropped. It keeps flying the empty
  // return leg (still IN_FLIGHT) and only becomes IDLE when it lands.
  await Drone.updateOne(
    { _id: droneId, status: IN_FLIGHT },
    { currentOrder: null, destination: null, location, battery }
  );
  const drone = await Drone.findById(droneId);
  if (drone) emitDrone(drone);

  // The hub's own staff need to know food is on the counter waiting for its code.
  await notifyHubStaff(order.hub._id, {
    type: 'PICKUP_READY',
    title: `Order #${String(order._id).slice(-6)} is waiting at ${order.hub.name}`,
    body: `৳${order.total} to collect. Verify the customer's pickup code when they arrive.`,
    order: order._id,
  }).catch(() => {});

  return arrived;
}

/** Hub staff verifies the code the customer shows, or scans the customer's QR token. */
export async function collect(user, orderId, { pickupCode, pickupToken } = {}) {
  const order = await loadOrder(orderId);
  if (order.status !== S.ARRIVED_AT_HUB) throw conflict('Order has not arrived at the hub yet', 'INVALID_TRANSITION');
  // Staff role required; a customer can't collect their own order without the operator.
  if (!STAFF_ROLES.includes(user.role)) throw forbidden('Only hub staff can verify a pickup');
  if (user.role === ROLES.HUB_OPERATOR && String(user.hub || '') !== String(order.hub._id)) {
    throw forbidden('This order belongs to a different hub');
  }
  const byCode = pickupCode && order.pickupCode && order.pickupCode === pickupCode;
  const byToken = pickupToken && order.pickupToken && order.pickupToken === pickupToken;
  if (!byCode && !byToken) throw badRequest('Incorrect pickup code or QR token');
  const done = await transition(order, S.COLLECTED, user, {
    note: byToken ? 'QR code scanned at hub' : 'Pickup code verified',
    mutate: (o) => {
      settleOnCollection(o);
      // Invalidate the pickup secret so it cannot be reused after collection.
      o.pickupCode = null;
      o.pickupToken = null;
    },
  });
  await audit({ actor: user, action: 'ORDER_COLLECTED', targetType: 'order', target: order._id, summary: `৳${order.total}` });
  // Referral payout (first collected order) and the loyalty stamp run after the order is closed.
  await rewardReferralOnFirstOrder(done).catch(() => {});
  await stampLoyalty(done).catch(() => {});
  // Best-effort receipt email; collection never waits on it.
  emailReceipt(done).catch(() => {});
  return done;
}

/**
 * Admin marks a drone as failed: it goes to maintenance and any order it carried is handed back.
 * The drone's order link is always cleared so it can be returned to service afterwards.
 */
export async function markDroneFailed(droneId, actor) {
  const drone = await Drone.findById(droneId);
  if (!drone) throw notFound('Drone');
  flightController.abort(String(drone._id));
  chargingController.stop(String(drone._id));
  const orderId = drone.currentOrder;
  drone.status = MAINTENANCE;
  drone.lastFailureAt = new Date();
  recordBatteryEvent(drone, 'FAILED', drone.battery);
  drone.destination = null;
  drone.currentOrder = null;
  await drone.save();
  emitDrone(drone);
  await audit({ actor, action: 'DRONE_FAILED', targetType: 'drone', target: drone._id, summary: drone.identifier });
  if (!orderId) return drone;

  const order = await Order.findById(orderId);
  if (order?.status === S.READY_FOR_DRONE) {
    // Food never left: just detach the drone so the owner can load another one.
    order.drone = null;
    await order.save();
    await announce(await loadOrder(orderId), { title: `Drone ${drone.identifier} failed. Please load another drone.` });
  } else if (order?.status === S.IN_FLIGHT) {
    order.needsAdminIntervention = true;
    order.interventionReason = `Drone ${drone.identifier} failed mid-flight`;
    await order.save();
    const full = await loadOrder(orderId);
    await announce(full, { title: 'Delivery delayed: drone issue, our team is on it' });
    await notifyAdmins({
      type: 'DRONE_FAILED',
      title: `Drone ${drone.identifier} failed`,
      body: `Order #${String(orderId).slice(-6)} needs intervention`,
      order: orderId,
    });
  } else if (order?.status === S.ARRIVED_AT_HUB) {
    // Drone grounded after drop-off but before collection: food is at the hub, needs staff to verify.
    order.needsAdminIntervention = true;
    order.interventionReason = `Drone ${drone.identifier} grounded after drop-off at ${order.hub?.name}`;
    await order.save();
    const full = await loadOrder(orderId);
    await announce(full, { title: 'Drone grounded after delivery — verify pickup at hub' });
    await notifyAdmins({
      type: 'DRONE_FAILED',
      title: `Drone ${drone.identifier} grounded`,
      body: `Order #${String(orderId).slice(-6)} is at ${order.hub?.name} awaiting collection`,
      order: orderId,
    });
  }
  return drone;
}

/**
 * Docks every idle drone below the ready charge. Called at startup and after seeding so a flat
 * drone is never left sitting in the fleet unable to take a delivery.
 */
export async function dockStrandedDrones() {
  const stranded = await Drone.find({ status: IDLE, battery: { $lt: env.drone.readyCharge } });
  for (const drone of stranded) await maybeDock(String(drone._id));
  if (stranded.length) console.log(`Docked ${stranded.length} low-battery drone(s)`);
  return stranded.length;
}

/** Restarts simulated flights and charging after a server restart. */
export async function resumeFlights() {
  const [flying, docking] = await Promise.all([
    Drone.find({ status: IN_FLIGHT }),
    Drone.find({ status: CHARGING }),
  ]);

  for (const drone of docking) chargingController.start(String(drone._id));

  for (const drone of flying) {
    const order = drone.currentOrder ? await loadOrder(drone.currentOrder).catch(() => null) : null;
    if (order?.status === S.IN_FLIGHT && !order.needsAdminIntervention) {
      startFlight(order, drone);
    } else {
      // The order is gone or already landed: stop pretending the drone is in the air.
      drone.status = IDLE;
      drone.currentOrder = null;
      await drone.save();
      await maybeDock(String(drone._id));
    }
  }
  // An idle drone below the ready charge was stranded by a restart; put it on the dock.
  await dockStrandedDrones();
  if (flying.length) console.log(`Resumed ${flying.length} drone flight(s)`);
}

export { etaPhrase };
