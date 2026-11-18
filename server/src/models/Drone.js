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
    currentOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    destination: {
      lat: Number,
      lng: Number,
    },
    lastFailureAt: Date,
  },
  { timestamps: true }
);

export const Drone = mongoose.model('Drone', droneSchema);
