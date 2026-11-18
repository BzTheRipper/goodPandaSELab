import mongoose from 'mongoose';
import { ROLES } from '../constants.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, required: true, trim: true },
    address: { type: String, default: '', trim: true },
    role: { type: String, enum: [ROLES.CUSTOMER, ROLES.OWNER, ROLES.ADMIN], required: true },
    isActive: { type: Boolean, default: true },
    avatarUrl: String,
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' }],
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
