import mongoose from 'mongoose';
import { CONFIRMATION_TYPES, ORDER_STATUS, PAYMENT_METHODS, PAYMENT_STATUS } from '../constants.js';

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
    type: { type: String, enum: Object.values(CONFIRMATION_TYPES), required: true },
    message: { type: String, required: true },
    itemIds: [ObjectId],
    previousStatus: { type: String, required: true },
    requestedAt: { type: Date, default: Date.now },
    // Who the order is waiting on: the customer (restaurant's question) or the restaurant (customer's cancel request).
    awaiting: { type: String, enum: ['CUSTOMER', 'OWNER'], default: 'CUSTOMER' },
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
    // Orders placed together from several restaurants share a checkout group id.
    checkoutGroup: { type: ObjectId, default: null, index: true },
    drone: { type: ObjectId, ref: 'Drone', default: null },
    items: { type: [orderItemSchema], validate: (v) => v.length > 0 },
    customerNote: { type: String, default: '' },
    subtotal: { type: Number, required: true },
    // Coupon snapshot; `discount` is already included in `total`.
    couponId: { type: ObjectId, ref: 'Coupon', default: null },
    couponCode: { type: String, default: null },
    discount: { type: Number, default: 0, min: 0 },
    // Store credit spent on this order (referrals / loyalty rewards). Refunded on cancellation.
    creditApplied: { type: Number, default: 0, min: 0 },
    creditRefundedAt: { type: Date, default: null },
    deliveryFee: { type: Number, required: true },
    total: { type: Number, required: true },
    status: { type: String, enum: Object.values(ORDER_STATUS), default: ORDER_STATUS.PLACED, index: true },
    statusHistory: [historySchema],
    rejectionReason: String,
    cancellationReason: String,
    confirmationRequest: { type: confirmationSchema, default: null },
    pickupCode: { type: String, default: null },
    // Longer random secret encoded in the customer's QR; the hub scans it instead of typing.
    pickupToken: { type: String, default: null },
    // Set at dispatch and shown to the customer; the row keeps it after landing as the promised time.
    estimatedArrivalAt: { type: Date, default: null },
    // One-shot flag so the "5 minutes away" nudge fires exactly once per flight.
    approachingNotifiedAt: { type: Date, default: null },
    arrivedAt: { type: Date, default: null },
    // Ground truth for prep-time analytics and cash reconciliation.
    acceptedAt: { type: Date, default: null },
    preparedAt: { type: Date, default: null },
    dispatchedAt: { type: Date, default: null },
    collectedAt: { type: Date, default: null },
    // Distance the fee was priced on (restaurant → hub, km), kept for the receipt.
    deliveryDistanceKm: { type: Number, default: null },
    paymentMethod: { type: String, enum: Object.values(PAYMENT_METHODS), default: PAYMENT_METHODS.CASH_ON_COLLECTION },
    paymentStatus: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.PENDING },
    // Online payment: Stripe Checkout session + the URL the customer must be sent to.
    paymentSessionId: { type: String, default: null },
    paymentUrl: { type: String, default: null },
    paymentIntentId: { type: String, default: null },
    paidAt: { type: Date, default: null },
    needsAdminIntervention: { type: Boolean, default: false },
    interventionReason: String,
    // Cash-on-collection risk: set when hub staff close an uncollected order.
    noShowReportedAt: { type: Date, default: null },
    noShowReportedBy: { type: ObjectId, ref: 'User', default: null },
    // When set, the order is scheduled for a future time and should not be shown to the
    // restaurant or progressed until this time has passed.
    scheduledFor: { type: Date, default: null, index: true },
    // Set once the scheduler has told the restaurant a scheduled order is due.
    scheduledNotifiedAt: { type: Date, default: null },
    // Platform commission and payout tracking.
    commissionPercent: { type: Number, default: 0, min: 0, max: 100 },
    commissionAmount: { type: Number, default: 0, min: 0 },
    payoutAmount: { type: Number, default: 0, min: 0 },
    payoutStatus: { type: String, enum: ['PENDING', 'PAID', 'VOID'], default: 'PENDING' },
    payoutAt: { type: Date, default: null },
    // Total refunded through a resolved dispute (manual/settlement record, not an automatic gateway refund).
    refundAmount: { type: Number, default: 0, min: 0 },
    review: { type: ObjectId, ref: 'Review', default: null },
  },
  // optimisticConcurrency turns concurrent conflicting saves into a VersionError (mapped to 409).
  { timestamps: true, optimisticConcurrency: true }
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ restaurant: 1, createdAt: -1 });
orderSchema.index({ customer: 1, createdAt: -1 });

export const Order = mongoose.model('Order', orderSchema);
