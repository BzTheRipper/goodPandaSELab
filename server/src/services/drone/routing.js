const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

export function distanceMeters(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Route planner contract: plan(from, to, stepMeters) -> { waypoints: [{lat,lng}], distanceMeters }.
 * The straight-line planner can be replaced by real pathfinding (no-fly zones, wind, etc.).
 */
export const straightLinePlanner = {
  plan(from, to, stepMeters) {
    const distance = distanceMeters(from, to);
    const steps = Math.max(1, Math.ceil(distance / stepMeters));
    const waypoints = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      waypoints.push({ lat: from.lat + (to.lat - from.lat) * t, lng: from.lng + (to.lng - from.lng) * t });
    }
    return { waypoints, distanceMeters: distance };
  },
};
