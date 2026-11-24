import mongoose from 'mongoose';
import { ROLES } from '../constants.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, required: true, trim: true },
    address: { type: String, default: '', trim: true },
    role: { type: String, enum: [ROLES.CUSTOMER, ROLES.OWNER, ROLES.ADMIN, ROLES.HUB_OPERATOR], required: true },
    isActive: { type: Boolean, default: true },
    avatarUrl: String,
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' }],
    // Hub operators only verify pickups for their assigned hub.
    hub: { type: mongoose.Schema.Types.ObjectId, ref: 'Hub', default: null },
    // Per-channel delivery preferences. A disabled channel is skipped, but the event still exists.
    notificationPrefs: {
      inApp: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
    },
    // Set when the customer deletes their account; the row stays so order history remains valid.
    deletedAt: { type: Date, default: null },
    // Cash-on-collection reliability signal, incremented by hub staff.
    noShowCount: { type: Number, default: 0 },
    // Referral programme: own code, who invited them, spendable credit and loyalty stamps.
    referralCode: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    creditBalance: { type: Number, default: 0, min: 0 },
    loyaltyStamps: { type: Number, default: 0, min: 0 },
    loyaltyRewards: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
