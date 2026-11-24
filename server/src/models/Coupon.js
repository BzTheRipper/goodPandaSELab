import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 24 },
    description: { type: String, default: '', trim: true, maxlength: 120 },
    type: { type: String, enum: ['PERCENT', 'FLAT'], required: true },
    // Percent (0-100) or a flat BDT amount, depending on `type`.
    value: { type: Number, required: true, min: 0 },
    minSubtotal: { type: Number, default: 0, min: 0 },
    // Percent coupons can be capped; null means no cap.
    maxDiscount: { type: Number, default: null, min: 0 },
    // null = valid at every restaurant.
    restaurant: { type: ObjectId, ref: 'Restaurant', default: null },
    active: { type: Boolean, default: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    usageLimit: { type: Number, default: null, min: 1 },
    perCustomerLimit: { type: Number, default: 1, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    createdBy: { type: ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

couponSchema.index({ active: 1, endsAt: 1 });

export const Coupon = mongoose.model('Coupon', couponSchema);
