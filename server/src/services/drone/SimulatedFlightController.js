import { straightLinePlanner } from './routing.js';

/**
 * Flight controller contract (implemented here by a simulation; a real drone API adapter would match it):
 *   startFlight({ droneId, from, to, battery, onProgress, onArrive }) -> { distanceMeters, etaSeconds }
 *   abort(droneId), isFlying(droneId), stopAll()
 * The drone decides its own route; callers only supply the destination.
 */
export class SimulatedFlightController {
  constructor({ tickMs, speedMps, batteryPerKm, planner = straightLinePlanner }) {
    this.tickMs = tickMs;
    this.speedMps = speedMps;
    this.batteryPerKm = batteryPerKm;
    this.planner = planner;
    this.flights = new Map();
  }

  estimateBattery(from, to) {
    const { distanceMeters } = this.planner.plan(from, to, Number.MAX_SAFE_INTEGER);
    return (distanceMeters / 1000) * this.batteryPerKm;
  }

  startFlight({ droneId, from, to, battery, onProgress, onArrive }) {
    this.abort(droneId);
    const stepMeters = (this.speedMps * this.tickMs) / 1000;
    const { waypoints, distanceMeters } = this.planner.plan(from, to, stepMeters);
    const lastIndex = waypoints.length - 1;
    const drainPerStep = (distanceMeters / 1000 / lastIndex) * this.batteryPerKm;
    let index = 0;
    let level = battery;

    const timer = setInterval(async () => {
      index += 1;
      level = Math.max(0, Math.round((level - drainPerStep) * 10) / 10);
      try {
        if (index >= lastIndex) {
          this.abort(droneId);
          await onArrive({ location: to, battery: level });
        } else {
          await onProgress({
            location: waypoints[index],
            battery: level,
            progress: index / lastIndex,
            etaSeconds: Math.round(((lastIndex - index) * this.tickMs) / 1000),
          });
        }
      } catch (err) {
        console.error(`[drone ${droneId}] flight update failed`, err);
      }
    }, this.tickMs);

    this.flights.set(droneId, timer);
    return { distanceMeters, etaSeconds: Math.round((lastIndex * this.tickMs) / 1000) };
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
