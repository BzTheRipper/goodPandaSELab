import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/** A browser Web Push subscription. One row per device endpoint per user. */
const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
  { timestamps: true }
);

export const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);
