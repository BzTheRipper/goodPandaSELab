import mongoose from 'mongoose';
import { DRONE_STATUS } from '../constants.js';

const droneSchema = new mongoose.Schema(
  {
    identifier: { type: String, required: true, unique: true, trim: true },
    status: { type: String, enum: Object.values(DRONE_STATUS), default: DRONE_STATUS.IDLE, index: true },
    location: {
      lat: { type: Number, default: 23.8103 },
      lng: { type: Number, default: 90.4125 },
    },
    battery: { type: Number, default: 100, min: 0, max: 100 },
    // Whole item units the cargo bay can carry in one trip (a practical stand-in for payload weight).
    capacityUnits: { type: Number, default: 12, min: 1 },
    currentOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    destination: {
      lat: Number,
      lng: Number,
    },
    lastFailureAt: Date,
    // Hardware telemetry: last position report + monotonic sequence for out-of-order rejection.
    lastTelemetryAt: Date,
    telemetrySeq: { type: Number, default: 0 },
    // Maintenance scheduling and battery health, maintained by the fleet services.
    maintenanceDueAt: Date,
    maintenanceNote: { type: String, default: '' },
    lastServiceAt: Date,
    tripsCompleted: { type: Number, default: 0 },
    distanceKm: { type: Number, default: 0 },
    // Ring buffer of notable battery events (landing level, dock, full charge, failure).
    batteryHistory: {
      type: [
        new mongoose.Schema(
          { at: { type: Date, default: Date.now }, level: Number, event: String },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

/** Appends a battery event, keeping only the most recent 60 so the document stays small. */
export function recordBatteryEvent(drone, event, level = drone.battery) {
  drone.batteryHistory.push({ at: new Date(), level: Math.round(level * 10) / 10, event });
  if (drone.batteryHistory.length > 60) drone.batteryHistory.splice(0, drone.batteryHistory.length - 60);
}

export const Drone = mongoose.model('Drone', droneSchema);
