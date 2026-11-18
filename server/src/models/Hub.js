import mongoose from 'mongoose';

const hubSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Hub = mongoose.model('Hub', hubSchema);
