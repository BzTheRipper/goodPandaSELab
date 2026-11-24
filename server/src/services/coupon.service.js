import { Coupon, Order } from '../models/index.js';
import { ORDER_STATUS } from '../constants.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { audit } from './audit.service.js';

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Validates a code against the cart and returns the authoritative discount.
 * Throws 400/409 with a stable code so the client can show a precise message.
 */
export async function quoteCoupon({ code, restaurantId, subtotal }, customerId) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) throw badRequest('Enter a coupon code', 'COUPON_INVALID');
  const coupon = await Coupon.findOne({ code: normalized });
  if (!coupon) throw badRequest('That coupon code does not exist', 'COUPON_INVALID');
  if (!coupon.active) throw conflict('This coupon is no longer active', 'COUPON_INACTIVE');

  const now = Date.now();
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) {
    throw conflict('This coupon is not active yet', 'COUPON_NOT_STARTED');
  }
  if (coupon.endsAt && new Date(coupon.endsAt).getTime() < now) {
    throw conflict('This coupon has expired', 'COUPON_EXPIRED');
  }
  if (coupon.restaurant && String(coupon.restaurant) !== String(restaurantId)) {
    throw conflict('This coupon is not valid for this restaurant', 'COUPON_NOT_APPLICABLE');
  }
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    throw conflict('This coupon has reached its usage limit', 'COUPON_EXHAUSTED');
  }
  if (Number(subtotal) < coupon.minSubtotal) {
    throw conflict(`Spend at least ৳${coupon.minSubtotal} to use this coupon`, 'COUPON_MIN_SUBTOTAL');
  }
  if (customerId && coupon.perCustomerLimit != null) {
    const used = await Order.countDocuments({
      customer: customerId,
      couponId: coupon._id,
      status: { $nin: [ORDER_STATUS.CANCELLED, ORDER_STATUS.REJECTED] },
    });
    if (used >= coupon.perCustomerLimit) {
      throw conflict('You have already used this coupon', 'COUPON_USED');
    }
  }

  const raw = coupon.type === 'PERCENT' ? (Number(subtotal) * coupon.value) / 100 : coupon.value;
  const capped = coupon.type === 'PERCENT' && coupon.maxDiscount != null ? Math.min(raw, coupon.maxDiscount) : raw;
  const discount = round2(Math.min(capped, Number(subtotal)));
  if (discount <= 0) throw badRequest('This coupon gives no discount on this order', 'COUPON_INVALID');

  return { coupon, discount, code: coupon.code };
}

/** Atomically reserves one use. Fails with 409 if the coupon ran out between quote and save. */
export async function redeemCoupon(coupon) {
  const updated = await Coupon.findOneAndUpdate(
    {
      _id: coupon._id,
      active: true,
      $or: [{ usageLimit: null }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }],
    },
    { $inc: { usedCount: 1 } },
    { new: true }
  );
  if (!updated) throw conflict('This coupon is no longer available', 'COUPON_EXHAUSTED');
  return updated;
}

/** Best-effort rollback when the order could not be saved after redeeming. */
export async function releaseCoupon(couponId) {
  await Coupon.updateOne({ _id: couponId, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }).catch(() => {});
}

// ---- admin ----

export const listCoupons = () => Coupon.find().sort({ createdAt: -1 }).populate('restaurant', 'name');

export async function createCoupon(data, actor) {
  const code = String(data.code).trim().toUpperCase();
  if (await Coupon.exists({ code })) throw conflict('That coupon code already exists', 'DUPLICATE');
  const coupon = await Coupon.create({ ...data, code, createdBy: actor._id });
  await audit({ actor, action: 'COUPON_CREATED', targetType: 'coupon', target: coupon._id, summary: `${code} (${coupon.type} ${coupon.value})` });
  return coupon;
}

export async function updateCoupon(id, patch, actor) {
  const coupon = await Coupon.findById(id);
  if (!coupon) throw notFound('Coupon');
  const allowed = ['description', 'active', 'endsAt', 'startsAt', 'usageLimit', 'perCustomerLimit', 'minSubtotal', 'maxDiscount', 'value'];
  for (const key of allowed) {
    if (patch[key] !== undefined) coupon[key] = patch[key];
  }
  if (patch.active === true && coupon.endsAt && new Date(coupon.endsAt).getTime() < Date.now()) {
    throw conflict('Extend the end date before reactivating an expired coupon', 'COUPON_EXPIRED');
  }
  await coupon.save();
  await audit({
    actor,
    action: 'COUPON_UPDATED',
    targetType: 'coupon',
    target: coupon._id,
    summary: `${coupon.code}${patch.active === undefined ? '' : patch.active ? ' activated' : ' deactivated'}`,
  });
  return coupon;
}
