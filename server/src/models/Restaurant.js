import mongoose from 'mongoose';
import { RESTAURANT_STATUS } from '../constants.js';

const pointSchema = new mongoose.Schema({ lat: Number, lng: Number }, { _id: false });

// Compliance paperwork the owner uploads and an admin verifies. Never exposed publicly.
const documentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['FOOD_LICENSE', 'TRADE_LICENSE', 'OWNER_ID', 'OTHER'], required: true },
    label: { type: String, default: '', trim: true, maxlength: 80 },
    fileUrl: { type: String, required: true },
    expiresAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: true }
);

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
    documents: { type: [documentSchema], default: [] },
  },
  { timestamps: true }
);

export const Restaurant = mongoose.model('Restaurant', restaurantSchema);
