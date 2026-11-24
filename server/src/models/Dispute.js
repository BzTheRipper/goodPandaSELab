import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const disputeSchema = new mongoose.Schema(
  {
    order: { type: ObjectId, ref: 'Order', required: true, index: true },
    customer: { type: ObjectId, ref: 'User', required: true, index: true },
    restaurant: { type: ObjectId, ref: 'Restaurant', required: true },
    category: {
      type: String,
      enum: ['MISSING_ITEM', 'WRONG_ITEM', 'COLD_FOOD', 'NOT_COLLECTED', 'PAYMENT', 'OTHER'],
      required: true,
    },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: ['OPEN', 'RESOLVED', 'REJECTED'], default: 'OPEN', index: true },
    resolution: { type: String, enum: ['REFUND', 'PARTIAL_REFUND', 'NO_ACTION', null], default: null },
    refundAmount: { type: Number, default: 0, min: 0 },
    adminNote: { type: String, default: '', maxlength: 500 },
    resolvedBy: { type: ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    // Soft SLA marker shown in the admin queue.
    dueAt: { type: Date, default: () => new Date(Date.now() + 48 * 60 * 60 * 1000) },
  },
  { timestamps: true }
);

// One open report per order is enough; the service enforces it, this makes duplicates cheap to find.
disputeSchema.index({ order: 1, status: 1 });

export const Dispute = mongoose.model('Dispute', disputeSchema);
