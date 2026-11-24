import { Dispute, Order } from '../models/index.js';
import { ORDER_STATUS, ROLES } from '../constants.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { audit } from './audit.service.js';
import { notify, notifyAdmins } from './notification.service.js';

const resolvableStatuses = [ORDER_STATUS.COLLECTED, ORDER_STATUS.CANCELLED];

/** Customer opens a report about a completed or cancelled order. */
export async function openDispute(user, orderId, { category, description }) {
  const order = await Order.findById(orderId).populate('restaurant', 'name owner');
  if (!order) throw notFound('Order');
  if (String(order.customer) !== String(user._id)) throw forbidden('This order does not belong to you');
  if (!resolvableStatuses.includes(order.status)) {
    throw conflict('You can report a problem once the order is collected or cancelled', 'ORDER_NOT_COMPLETE');
  }
  if (await Dispute.exists({ order: order._id, status: 'OPEN' })) {
    throw conflict('You already have an open report for this order', 'DUPLICATE');
  }

  const dispute = await Dispute.create({
    order: order._id,
    customer: user._id,
    restaurant: order.restaurant._id,
    category,
    description,
  });
  await notify(order.restaurant.owner, {
    type: 'DISPUTE_OPENED',
    title: `A customer reported a problem with order #${String(order._id).slice(-6)}`,
    body: description.slice(0, 140),
    order: order._id,
  }).catch(() => {});
  await notifyAdmins({
    type: 'DISPUTE_OPENED',
    title: `Dispute opened on order #${String(order._id).slice(-6)}`,
    body: `${category.replaceAll('_', ' ').toLowerCase()} — ${order.restaurant.name}`,
    order: order._id,
  }).catch(() => {});
  await audit({ actor: user, action: 'DISPUTE_OPENED', targetType: 'order', target: order._id, summary: category });
  return dispute;
}

export const listMine = (userId) =>
  Dispute.find({ customer: userId }).sort({ createdAt: -1 }).limit(50).populate('order', 'status total couponCode');

export const listForOrder = (orderId) => Dispute.find({ order: orderId }).sort({ createdAt: -1 });

export async function listAll({ status } = {}) {
  return Dispute.find(status ? { status } : {})
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('order', 'status total createdAt')
    .populate('customer', 'name email phone')
    .populate('restaurant', 'name');
}

/**
 * Admin resolution. A refund is recorded on the dispute and on the order; gateway refunds stay a
 * manual finance step so the API can never double-refund by retry.
 */
export async function resolveDispute(user, id, { status, resolution, refundAmount = 0, note = '' }) {
  if (![ROLES.ADMIN].includes(user.role)) throw forbidden('Only an admin can resolve a dispute');
  const dispute = await Dispute.findById(id);
  if (!dispute) throw notFound('Dispute');
  if (dispute.status !== 'OPEN') throw conflict('This dispute is already closed', 'ALREADY_RESOLVED');

  if (status === 'REJECTED' && refundAmount > 0) throw badRequest('A rejected dispute cannot carry a refund');
  if (resolution === 'REFUND' || resolution === 'PARTIAL_REFUND') {
    const order = await Order.findById(dispute.order);
    if (!order) throw notFound('Order');
    if (!(refundAmount > 0)) throw badRequest('Enter the refund amount');
    if (refundAmount > order.total) throw badRequest(`The refund cannot exceed the order total (৳${order.total.toFixed(2)})`);
    await Order.updateOne({ _id: order._id }, { refundAmount });
  }

  dispute.status = status;
  dispute.resolution = status === 'REJECTED' ? 'NO_ACTION' : resolution || 'NO_ACTION';
  dispute.refundAmount = refundAmount > 0 ? refundAmount : 0;
  dispute.adminNote = note;
  dispute.resolvedBy = user._id;
  dispute.resolvedAt = new Date();
  await dispute.save();

  await notify(dispute.customer, {
    type: 'DISPUTE_RESOLVED',
    title: status === 'REJECTED' ? 'Your report was reviewed' : 'Your report was resolved',
    body:
      dispute.refundAmount > 0
        ? `A refund of ৳${dispute.refundAmount.toFixed(2)} was approved.${note ? ` Note: ${note}` : ''}`
        : note || 'Thanks for helping us improve.',
    order: dispute.order,
  }).catch(() => {});
  await audit({
    actor: user,
    action: 'DISPUTE_RESOLVED',
    targetType: 'dispute',
    target: dispute._id,
    summary: `${status}${dispute.refundAmount ? ` ৳${dispute.refundAmount}` : ''}`,
  });
  return dispute;
}
