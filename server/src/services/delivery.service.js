import { DRONE_STATUS, ORDER_STATUS as S, ROLES } from '../constants.js';
import { env } from '../config/env.js';
import { Drone, Order } from '../models/index.js';
import { emitToAdmins, emitToUser } from '../realtime.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { flightController } from './drone/index.js';
import { notifyAdmins } from './notification.service.js';
import {
  announce,
  customerIdOf,
  generatePickupCode,
  loadOrder,
  ownerIdOf,
  releaseDrone,
  transition,
} from './order.service.js';
import { settleOnCollection } from './payment.service.js';

const BATTERY_RESERVE = 5;

async function ownerOrder(user, orderId) {
  const order = await loadOrder(orderId);
  if (user.role !== ROLES.OWNER || ownerIdOf(order) !== String(user._id)) throw forbidden('This order does not belong to your restaurant');
  return order;
}

const emitDrone = (drone) => emitToAdmins('drone:updated', drone.toJSON());

export const listAvailableDrones = () =>
  Drone.find({ status: DRONE_STATUS.IDLE, currentOrder: null, battery: { $gte: env.drone.minBattery } }).sort({ battery: -1 });

/** Owner confirms the food is attached to a chosen idle drone. Atomic so two owners can't grab the same drone. */
export async function loadDrone(user, orderId, droneId) {
  const order = await ownerOrder(user, orderId);
  if (order.status !== S.READY_FOR_DRONE) throw conflict('The order must be READY_FOR_DRONE before loading a drone', 'INVALID_TRANSITION');
  if (order.drone) throw conflict('A drone is already loaded for this order');

  const needed = flightController.estimateBattery(order.restaurant.location, order.hub.location) + BATTERY_RESERVE;
  const drone = await Drone.findOneAndUpdate(
    {
      _id: droneId,
      status: DRONE_STATUS.IDLE,
      currentOrder: null,
      battery: { $gte: Math.max(env.drone.minBattery, needed) },
    },
    // Assumption: the drone is at the restaurant when the owner loads it.
    { status: DRONE_STATUS.LOADED, currentOrder: order._id, location: order.restaurant.location },
    { new: true }
  );
  if (!drone) throw conflict('That drone is no longer available (or its battery is too low). Pick another one.', 'DRONE_UNAVAILABLE');

  try {
    order.drone = drone._id;
    await order.save();
  } catch (err) {
    await Drone.updateOne({ _id: drone._id }, { status: DRONE_STATUS.IDLE, currentOrder: null });
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
  await releaseDrone(order);
  order.drone = null;
  await order.save();
  const fresh = await loadOrder(order._id);
  await announce(fresh, { actorId: user._id, title: 'Drone unloaded' });
  return fresh;
}

function startFlight(order, drone) {
  const customerId = customerIdOf(order);
  const ownerId = ownerIdOf(order);
  const droneId = String(drone._id);
  const orderId = String(order._id);

  return flightController.startFlight({
    droneId,
    from: drone.location,
    to: order.hub.location,
    battery: drone.battery,
    onProgress: async ({ location, battery, progress, etaSeconds }) => {
      await Drone.updateOne({ _id: droneId }, { location, battery });
      const payload = { orderId, droneId, identifier: drone.identifier, location, battery, progress, etaSeconds };
      emitToUser(customerId, 'drone:location', payload);
      emitToUser(ownerId, 'drone:location', payload);
      emitToAdmins('drone:location', payload);
    },
    onArrive: ({ location, battery }) => handleArrival(orderId, droneId, { location, battery }),
  });
}

/** The one command an owner can give: "dispatch to the customer's hub". Routing is up to the drone. */
export async function dispatch(user, orderId) {
  const order = await ownerOrder(user, orderId);
  if (!order.drone) throw badRequest('Load the food onto a drone first');
  if (!order.hub.isActive) throw conflict('The destination hub is inactive. Contact admin.');

  const drone = await Drone.findOneAndUpdate(
    { _id: order.drone._id, status: DRONE_STATUS.LOADED, currentOrder: order._id },
    { status: DRONE_STATUS.IN_FLIGHT, destination: order.hub.location },
    { new: true }
  );
  if (!drone) throw conflict('The loaded drone is not ready for dispatch', 'DRONE_UNAVAILABLE');

  try {
    await transition(order, S.IN_FLIGHT, user, { note: `Dispatched ${drone.identifier} to ${order.hub.name}` });
  } catch (err) {
    await Drone.updateOne({ _id: drone._id }, { status: DRONE_STATUS.LOADED, destination: null });
    throw err;
  }
  emitDrone(drone);
  startFlight(order, drone);
  return loadOrder(order._id);
}

export async function handleArrival(orderId, droneId, { location, battery }) {
  const drone = await Drone.findOneAndUpdate(
    { _id: droneId, currentOrder: orderId },
    { status: DRONE_STATUS.IDLE, currentOrder: null, destination: null, location, battery },
    { new: true }
  );
  if (drone) emitDrone(drone);

  const order = await loadOrder(orderId);
  if (order.status !== S.IN_FLIGHT) return;
  const code = generatePickupCode();
  await transition(order, S.ARRIVED_AT_HUB, null, {
    note: `Arrived at ${order.hub.name}`,
    mutate: (o) => {
      o.pickupCode = code;
    },
    announceOpts: { body: `Collect it at ${order.hub.name}. Your pickup code is on the order page.` },
  });
}

/** Hub operator (admin) verifies the code the customer shows at the hub. */
export async function collect(user, orderId, { pickupCode }) {
  const order = await loadOrder(orderId);
  if (order.status !== S.ARRIVED_AT_HUB) throw conflict('Order has not arrived at the hub yet', 'INVALID_TRANSITION');
  if (order.pickupCode !== pickupCode) throw badRequest('Incorrect pickup code');
  return transition(order, S.COLLECTED, user, { note: 'Pickup code verified', mutate: settleOnCollection });
}

/** Admin marks a drone as failed: it goes to maintenance and any order it carried is flagged. */
export async function markDroneFailed(droneId) {
  const drone = await Drone.findById(droneId);
  if (!drone) throw notFound('Drone');
  flightController.abort(String(drone._id));
  const orderId = drone.currentOrder;
  drone.status = DRONE_STATUS.MAINTENANCE;
  drone.lastFailureAt = new Date();
  drone.destination = null;
  await drone.save();
  emitDrone(drone);
  if (!orderId) return drone;

  const order = await Order.findById(orderId);
  if (order?.status === S.READY_FOR_DRONE) {
    // Food never left: just detach the drone so the owner can load another one.
    drone.currentOrder = null;
    await drone.save();
    order.drone = null;
    await order.save();
    await announce(await loadOrder(orderId), { title: `Drone ${drone.identifier} failed. Please load another drone.` });
  } else if (order?.status === S.IN_FLIGHT) {
    order.needsAdminIntervention = true;
    order.interventionReason = `Drone ${drone.identifier} failed mid-flight`;
    await order.save();
    const full = await loadOrder(orderId);
    await announce(full, { title: 'Delivery delayed: drone issue, our team is on it' });
    await notifyAdmins({ type: 'DRONE_FAILED', title: `Drone ${drone.identifier} failed`, body: `Order #${String(orderId).slice(-6)} needs intervention`, order: orderId });
  }
  return drone;
}

/** Restarts simulated flights after a server restart. */
export async function resumeFlights() {
  const drones = await Drone.find({ status: DRONE_STATUS.IN_FLIGHT });
  for (const drone of drones) {
    const order = drone.currentOrder ? await loadOrder(drone.currentOrder).catch(() => null) : null;
    if (order?.status === S.IN_FLIGHT && !order.needsAdminIntervention) {
      startFlight(order, drone);
    } else {
      drone.status = DRONE_STATUS.IDLE;
      drone.currentOrder = null;
      await drone.save();
    }
  }
  if (drones.length) console.log(`Resumed ${drones.length} drone flight(s)`);
}
