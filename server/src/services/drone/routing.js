const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

export function distanceMeters(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return 0;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** Total ground distance of a multi-leg route, e.g. hub → restaurant → destination hub. */
export const routeDistanceMeters = (legs) => legs.reduce((sum, leg) => sum + distanceMeters(leg.from, leg.to), 0);

/**
 * Route planner contract: planRoute(legs, stepMeters) -> { waypoints: [{lat,lng,at,legIndex}], distanceMeters }.
 * `at` is the cumulative distance travelled, so progress stays proportional even when legs differ in length.
 * The straight-line planner can be replaced by real pathfinding (no-fly zones, wind, etc.).
 */
export const straightLinePlanner = {
  planRoute(legs, stepMeters) {
    const waypoints = [];
    let travelled = 0;
    legs.forEach((leg, legIndex) => {
      const distance = distanceMeters(leg.from, leg.to);
      const steps = Math.max(1, Math.ceil(distance / Math.max(1, stepMeters)));
      for (let k = 0; k <= steps; k++) {
        // The end of one leg is the start of the next; keep a single waypoint at the junction.
        if (legIndex > 0 && k === 0) continue;
        const t = k / steps;
        waypoints.push({
          lat: leg.from.lat + (leg.to.lat - leg.from.lat) * t,
          lng: leg.from.lng + (leg.to.lng - leg.from.lng) * t,
          at: travelled + distance * t,
          legIndex,
        });
      }
      travelled += distance;
    });
    return { waypoints, distanceMeters: travelled };
  },
};
