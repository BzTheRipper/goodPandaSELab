import mongoose from 'mongoose';
import { ORDER_STATUS, PAYMENT_METHODS, PAYMENT_STATUS } from '../constants.js';

const { ObjectId } = mongoose.Schema.Types;

const orderItemSchema = new mongoose.Schema({
  menuItem: { type: ObjectId, ref: 'MenuItem', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  note: { type: String, default: '' },
  unavailable: { type: Boolean, default: false },
  removed: { type: Boolean, default: false },
});

const historySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    at: { type: Date, default: Date.now },
    actor: { type: ObjectId, ref: 'User' },
    actorRole: String,
    note: String,
  },
  { _id: false }
);

const confirmationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['ITEM_UNAVAILABLE', 'NOTE_UNMET'], required: true },
    message: { type: String, required: true },
    itemIds: [ObjectId],
    previousStatus: { type: String, required: true },
    requestedAt: { type: Date, default: Date.now },
    resolution: { type: String, enum: ['CONTINUED', 'CANCELLED', null], default: null },
    resolvedAt: Date,
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    customer: { type: ObjectId, ref: 'User', required: true, index: true },
    restaurant: { type: ObjectId, ref: 'Restaurant', required: true, index: true },
    hub: { type: ObjectId, ref: 'Hub', required: true },
    drone: { type: ObjectId, ref: 'Drone', default: null },
    items: { type: [orderItemSchema], validate: (v) => v.length > 0 },
    customerNote: { type: String, default: '' },
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, required: true },
    total: { type: Number, required: true },
    status: { type: String, enum: Object.values(ORDER_STATUS), default: ORDER_STATUS.PLACED, index: true },
    statusHistory: [historySchema],
    rejectionReason: String,
    cancellationReason: String,
    confirmationRequest: { type: confirmationSchema, default: null },
    pickupCode: { type: String, default: null },
    paymentMethod: { type: String, enum: Object.values(PAYMENT_METHODS), default: PAYMENT_METHODS.CASH_ON_COLLECTION },
    paymentStatus: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.PENDING },
    needsAdminIntervention: { type: Boolean, default: false },
    interventionReason: String,
    review: { type: ObjectId, ref: 'Review', default: null },
  },
  // optimisticConcurrency turns concurrent conflicting saves into a VersionError (mapped to 409).
  { timestamps: true, optimisticConcurrency: true }
);

export const Order = mongoose.model('Order', orderSchema);
