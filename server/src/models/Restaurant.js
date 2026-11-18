import mongoose from 'mongoose';
import { RESTAURANT_STATUS } from '../constants.js';

const pointSchema = new mongoose.Schema({ lat: Number, lng: Number }, { _id: false });

const restaurantSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    // Drone pick-up point; used as the start of every flight from this restaurant.
    location: { type: pointSchema, default: () => ({ lat: 23.8103, lng: 90.4125 }) },
    categories: [{ type: String, trim: true }],
    logoUrl: String,
    coverUrl: String,
    isOpen: { type: Boolean, default: false },
    status: { type: String, enum: Object.values(RESTAURANT_STATUS), default: RESTAURANT_STATUS.PENDING },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Restaurant = mongoose.model('Restaurant', restaurantSchema);
