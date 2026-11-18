import { DRONE_STATUS, FINAL_STATUSES, ORDER_STATUS, RESTAURANT_STATUS, ROLES } from '../constants.js';
import { Drone, Hub, Order, Restaurant, User } from '../models/index.js';
import { emitToAdmins } from '../realtime.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';

export async function dashboard() {
  const [byStatus, activeDrones, droneCounts, pendingRestaurants, interventions, sales] = await Promise.all([
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Drone.countDocuments({ status: { $in: [DRONE_STATUS.LOADED, DRONE_STATUS.IN_FLIGHT] } }),
    Drone.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Restaurant.countDocuments({ status: RESTAURANT_STATUS.PENDING }),
    Order.countDocuments({ needsAdminIntervention: true }),
    Order.aggregate([
      { $match: { status: ORDER_STATUS.COLLECTED } },
      { $group: { _id: null, gross: { $sum: '$total' }, deliveryFees: { $sum: '$deliveryFee' } } },
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
  };
}

// ---- users ----
export const listUsers = (role) => User.find(role ? { role } : {}).sort({ createdAt: -1 });

export async function setUserActive(admin, id, isActive) {
  if (String(admin._id) === String(id)) throw badRequest('You cannot change your own account status');
  const user = await User.findByIdAndUpdate(id, { isActive }, { new: true });
  if (!user) throw notFound('User');
  if (!isActive && user.role === ROLES.OWNER) await Restaurant.updateOne({ owner: user._id }, { isOpen: false });
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

export const createHub = (data) => Hub.create(hubDoc(data));

export async function updateHub(id, data) {
  const hub = await Hub.findById(id);
  if (!hub) throw notFound('Hub');
  hub.set(hubDoc(data, hub));
  return hub.save();
}

export async function deleteHub(id) {
  if (await Order.exists({ hub: id, status: { $nin: FINAL_STATUSES } })) {
    throw conflict('This hub has active orders. Deactivate it instead.');
  }
  const hub = await Hub.findByIdAndDelete(id);
  if (!hub) throw notFound('Hub');
}

// ---- drones ----
export const listDrones = () => Drone.find().populate('currentOrder', 'status hub').sort({ identifier: 1 });

export async function createDrone({ identifier, lat, lng, battery }) {
  const drone = await Drone.create({
    identifier,
    battery: battery ?? 100,
    ...(lat !== undefined && lng !== undefined && { location: { lat, lng } }),
  });
  emitToAdmins('drone:updated', drone.toJSON());
  return drone;
}

export async function updateDrone(id, { identifier, lat, lng, battery, status }) {
  const drone = await Drone.findById(id);
  if (!drone) throw notFound('Drone');
  const busy = [DRONE_STATUS.LOADED, DRONE_STATUS.IN_FLIGHT].includes(drone.status);
  if (status && busy) throw conflict('Drone is on a delivery. Use "mark failed" to take it out of service.');
  if (status === DRONE_STATUS.IDLE && drone.currentOrder) throw conflict('Resolve the drone\'s current order first');
  if (identifier !== undefined) drone.identifier = identifier;
  if (battery !== undefined) drone.battery = battery;
  if (lat !== undefined && lng !== undefined && !busy) drone.location = { lat, lng };
  if (status) drone.status = status;
  await drone.save();
  emitToAdmins('drone:updated', drone.toJSON());
  return drone;
}

export async function deleteDrone(id) {
  const drone = await Drone.findById(id);
  if (!drone) throw notFound('Drone');
  if (drone.currentOrder) throw conflict('Drone is assigned to an order');
  await drone.deleteOne();
}
