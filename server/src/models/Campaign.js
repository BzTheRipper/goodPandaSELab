import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/** One admin broadcast. Individual deliveries are ordinary Notification rows. */
const campaignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 500 },
    segment: {
      type: String,
      enum: ['all_customers', 'active_customers', 'lapsed_30d', 'all_owners', 'all_users'],
      required: true,
    },
    recipients: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    createdBy: { type: ObjectId, ref: 'User', required: true },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

campaignSchema.index({ sentAt: -1 });

export const Campaign = mongoose.model('Campaign', campaignSchema);
