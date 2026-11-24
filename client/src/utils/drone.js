/**
 * Client-side guidance for the owner's drone picker. The server remains authoritative:
 * it re-checks battery and capacity when the food is loaded. These numbers only explain why a
 * drone is disabled and help the owner pick one that is likely to make the trip.
 *
 * The trip has two legs: current drone position → restaurant → hub. Disabling a drone that can't
 * finish that round trip is what stops the fleet from being stranded at hubs.
 */
const BATTERY_PER_KM = 2;
const BATTERY_RESERVE = 5;
const MIN_BATTERY = 20;
const EARTH_RADIUS_KM = 6371;

const toRad = (deg) => (Number(deg) * Math.PI) / 180;

/** Straight-line distance between two points, in kilometres. */
export function routeKm(from, to) {
  if (!from || !to || from.lat == null || from.lng == null || to.lat == null || to.lng == null) return null;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Mirrors the server's pricing formula for display only; the server recalculates at checkout. */
export function priceDeliveryFee(config, distanceKm) {
  if (!config) return null;
  const base = Number(config.deliveryFee) || 0;
  if (config.mode !== 'distance' || distanceKm == null) return Math.round(base * 100) / 100;
  const raw = base + Math.max(0, distanceKm) * (Number(config.perKm) || 0);
  return Math.round(Math.min(raw, Number(config.max) || raw) * 100) / 100;
}

/** Full routed distance the drone must fly for this order: its position → restaurant → hub. */
export function tripKm(drone, order) {
  const restaurant = order?.restaurant?.location;
  const hub = order?.hub?.location;
  if (!restaurant || !hub) return null;
  const toRestaurant = routeKm(drone?.location, restaurant);
  const toHub = routeKm(restaurant, hub);
  if (toRestaurant == null || toHub == null) return null;
  return toRestaurant + toHub;
}

/** The charge the dispatcher needs for the whole route, including the safety reserve. */
export function tripBatteryEstimate(drone, order) {
  const km = tripKm(drone, order);
  if (km == null) return null;
  return Math.ceil(Math.max(MIN_BATTERY, km * BATTERY_PER_KM + BATTERY_RESERVE));
}

/** Items the order needs carried. */
export const orderUnits = (order) =>
  (order?.items || []).filter((i) => !i.removed).reduce((n, i) => n + (i.quantity || 0), 0);

/** Suitability for one drone on one order. Always returns a human-readable reason. */
export function droneSuitability(drone, order) {
  const battery = Math.round(Number(drone?.battery ?? 0));
  const needed = tripBatteryEstimate(drone, order);
  const units = orderUnits(order);

  if (drone?.status && !['IDLE', 'CHARGING'].includes(drone.status)) {
    return { ok: false, reason: 'This drone is not available right now.' };
  }
  if (drone?.currentOrder) {
    return { ok: false, reason: 'This drone is already assigned to another order.' };
  }
  if (drone?.capacityUnits != null && units > drone.capacityUnits) {
    return {
      ok: false,
      reason: `Carries ${drone.capacityUnits} item(s) but this order has ${units}. Pick a larger drone.`,
    };
  }
  if (battery < MIN_BATTERY) {
    return { ok: false, reason: `Battery ${battery}% is below the ${MIN_BATTERY}% minimum.` };
  }
  if (needed != null && battery < needed) {
    return {
      ok: false,
      reason: `Battery ${battery}% may not cover the trip to ${order?.hub?.name || 'the hub'} — about ${needed}% is needed.`,
    };
  }
  return { ok: true, reason: needed != null ? `Enough charge for this route (about ${needed}% needed).` : 'Ready for this order.' };
}
