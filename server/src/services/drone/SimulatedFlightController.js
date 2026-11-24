import { routeDistanceMeters, straightLinePlanner } from './routing.js';

/**
 * Flight controller contract (implemented here by a simulation; a real drone API adapter would match it):
 *   startFlight({ droneId, legs, battery, minBattery, onProgress, onDelivered, onBatteryDead, onArrive }) -> { distanceMeters, etaSeconds }
 *   estimateBattery(legs) -> percent needed, abort(droneId), isFlying(droneId), stopAll()
 *
 * A trip is a list of legs, e.g. current position → restaurant → destination hub → back to base.
 * A leg may be tagged `phase: 'RETURN'`; the controller then fires `onDelivered` the first time the
 * drone reaches the junction where the cargo leg ends and the empty return leg starts.
 * The drone decides its own route; callers only supply the waypoints to visit.
 *
 * If battery drops to `minBattery` (or 0) mid-flight, the flight is aborted and `onBatteryDead` is fired
 * so the caller can mark the drone as failed and flag the order for admin intervention.
 */
export class SimulatedFlightController {
  constructor({ tickMs, speedMps, batteryPerKm, planner = straightLinePlanner }) {
    this.tickMs = tickMs;
    this.speedMps = speedMps;
    this.batteryPerKm = batteryPerKm;
    this.planner = planner;
    this.flights = new Map();
  }

  estimateBattery(legs) {
    return (routeDistanceMeters(legs) / 1000) * this.batteryPerKm;
  }

  startFlight({ droneId, legs, battery, minBattery = 0, onProgress, onDelivered, onBatteryDead, onArrive }) {
    this.abort(droneId);
    const stepMeters = Math.max(1, (this.speedMps * this.tickMs) / 1000);
    const { waypoints, distanceMeters } = this.planner.planRoute(legs, stepMeters);
    const total = distanceMeters;
    const lastIndex = waypoints.length - 1;
    const drainPerMeter = this.batteryPerKm / 1000;

    // Index of the first waypoint that belongs to the empty return leg, if there is one.
    const returnStartLeg = legs.findIndex((leg) => leg.phase === 'RETURN');
    const returnFromIndex = returnStartLeg === -1 ? -1 : waypoints.findIndex((w) => w.legIndex === returnStartLeg);

    let index = 0;
    let level = battery;
    let delivered = false;
    let dead = false;

    const finishDelivery = async (location) => {
      if (delivered) return;
      delivered = true;
      if (returnFromIndex > 0) await onDelivered?.({ location, battery: level });
    };

    const handleBatteryDead = async (location) => {
      if (dead) return;
      dead = true;
      this.abort(droneId);
      await onBatteryDead?.({ location, battery: level });
    };

    const timer = setInterval(async () => {
      index += 1;
      const point = waypoints[Math.min(index, lastIndex)];
      const previousAt = waypoints[Math.max(0, index - 1)]?.at ?? 0;
      level = Math.max(0, Math.round((level - (point.at - previousAt) * drainPerMeter) * 10) / 10);
      const location = { lat: point.lat, lng: point.lng };

      // Battery depletion mid-flight: abort and let the caller decide recovery.
      if (!dead && level <= minBattery) {
        await handleBatteryDead(location);
        return;
      }

      try {
        if (returnFromIndex > 0 && index >= returnFromIndex) await finishDelivery(location);

        if (index >= lastIndex) {
          this.abort(droneId);
          await finishDelivery(location);
          await onArrive({ location, battery: level, distanceMeters: total });
        } else {
          const remaining = Math.max(0, total - point.at);
          await onProgress({
            location,
            battery: level,
            progress: total > 0 ? Math.min(1, point.at / total) : 1,
            etaSeconds: Math.round(remaining / this.speedMps),
            distanceMeters: total,
          });
        }
      } catch (err) {
        console.error(`[drone ${droneId}] flight update failed`, err);
      }
    }, this.tickMs);

    this.flights.set(droneId, timer);
    return { distanceMeters: total, etaSeconds: Math.round(total / this.speedMps) };
  }

  abort(droneId) {
    const timer = this.flights.get(droneId);
    if (timer) clearInterval(timer);
    this.flights.delete(droneId);
  }

  isFlying(droneId) {
    return this.flights.has(droneId);
  }

  stopAll() {
    [...this.flights.keys()].forEach((id) => this.abort(id));
  }
}
