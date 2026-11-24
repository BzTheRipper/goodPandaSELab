import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/** One invite: the inviter is rewarded when the invitee's first order is collected. */
const referralSchema = new mongoose.Schema(
  {
    inviter: { type: ObjectId, ref: 'User', required: true, index: true },
    invitee: { type: ObjectId, ref: 'User', required: true, unique: true },
    code: { type: String, required: true },
    status: { type: String, enum: ['PENDING', 'REWARDED'], default: 'PENDING', index: true },
    rewardAmount: { type: Number, default: 0 },
    rewardedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Referral = mongoose.model('Referral', referralSchema);
