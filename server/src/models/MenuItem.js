import mongoose from 'mongoose';

const menuItemSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, default: 'General', trim: true },
    imageUrl: String,
    isAvailable: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const MenuItem = mongoose.model('MenuItem', menuItemSchema);
