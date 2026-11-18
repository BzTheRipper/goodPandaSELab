/**
 * Client-side guidance for the owner's drone picker. The server remains authoritative:
 * it re-checks battery when the food is loaded. These numbers only explain why a drone
 * is disabled and help the owner pick one that is likely to make the trip.
 */
const BATTERY_PER_KM = 2;
const BATTERY_RESERVE = 5;
const MIN_BATTERY = 20;
const EARTH_RADIUS_KM = 6371;

const toRad = (deg) => (Number(deg) * Math.PI) / 180;

/** Straight-line distance between restaurant and hub, in kilometres. */
export function routeKm(from, to) {
  if (!from || !to || from.lat == null || from.lng == null || to.lat == null || to.lng == null) return null;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The charge the dispatcher needs for this route, including the safety reserve. */
export function tripBatteryEstimate(from, to) {
  const km = routeKm(from, to);
  if (km == null) return null;
  return Math.ceil(Math.max(MIN_BATTERY, km * BATTERY_PER_KM + BATTERY_RESERVE));
}

/** Suitability for one loaded drone on one order. Always returns a human-readable reason. */
export function droneSuitability(drone, order) {
  const battery = Math.round(Number(drone?.battery ?? 0));
  const needed = tripBatteryEstimate(order?.restaurant?.location, order?.hub?.location);

  if (drone?.status && drone.status !== 'IDLE') {
    return { ok: false, reason: 'This drone is not idle right now.' };
  }
  if (drone?.currentOrder) {
    return { ok: false, reason: 'This drone is already assigned to another order.' };
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
