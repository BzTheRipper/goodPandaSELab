import { DRONE_STATUS } from '../../constants.js';
import { Drone } from '../../models/index.js';
import { emitToAdmins } from '../../realtime.js';

/**
 * Simulated charging dock. A landed drone below the "ready" charge tops itself up on a timer and
 * flips back to IDLE when full. A real fleet adapter would publish the same status changes.
 */
export class SimulatedChargingController {
  constructor({ chargingTickMs, chargePercentPerTick, readyCharge }) {
    const positive = (value, fallback) => (Number.isFinite(value) && value > 0 ? value : fallback);
    this.tickMs = positive(chargingTickMs, 2000);
    this.percentPerTick = positive(chargePercentPerTick, 10);
    this.readyAt = positive(readyCharge, 60);
    this.docks = new Map();
  }

  /** Starts (or restarts) charging for one drone. No-op when already docked. */
  start(droneId) {
    if (this.docks.has(droneId)) return;
    const timer = setInterval(async () => {
      try {
        // Atomic and CHARGING-scoped: a drone that was claimed while docked simply stops matching,
        // so the dock can never overwrite a LOADED/IN_FLIGHT status with a stale read.
        const drone = await Drone.findOneAndUpdate(
          { _id: droneId, status: DRONE_STATUS.CHARGING },
          [
            {
              $set: {
                battery: { $min: [100, { $round: [{ $add: ['$battery', this.percentPerTick] }, 1] }] },
              },
            },
          ],
          { new: true }
        );
        if (!drone) return this.stop(droneId);

        if (drone.battery >= this.readyAt) {
          const ready = await Drone.findOneAndUpdate(
            { _id: droneId, status: DRONE_STATUS.CHARGING },
            {
              $set: { status: DRONE_STATUS.IDLE },
              $push: {
                batteryHistory: { $each: [{ at: new Date(), level: drone.battery, event: 'CHARGED' }], $slice: -60 },
              },
            },
            { new: true }
          );
          if (ready) emitToAdmins('drone:updated', ready.toJSON());
          return this.stop(droneId);
        }

        emitToAdmins('drone:updated', drone.toJSON());
      } catch (err) {
        console.error(`[drone ${droneId}] charging update failed`, err);
        this.stop(droneId);
      }
    }, this.tickMs);
    this.docks.set(droneId, timer);
  }

  stop(droneId) {
    const timer = this.docks.get(droneId);
    if (timer) clearInterval(timer);
    this.docks.delete(droneId);
  }

  stopAll() {
    [...this.docks.keys()].forEach((id) => this.stop(id));
  }
}
