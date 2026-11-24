import * as coupons from '../services/coupon.service.js';

/** Customer-facing preview: what this code would save on the current cart. */
export async function validate(req, res) {
  const { code, restaurantId, subtotal } = req.body;
  const quote = await coupons.quoteCoupon({ code, restaurantId, subtotal }, req.user._id);
  res.json({
    code: quote.code,
    discount: quote.discount,
    type: quote.coupon.type,
    value: quote.coupon.value,
    description: quote.coupon.description,
  });
}

// ---- admin ----
export const list = async (_req, res) => res.json(await coupons.listCoupons());
export const create = async (req, res) => res.status(201).json(await coupons.createCoupon(req.body, req.user));
export const update = async (req, res) => res.json(await coupons.updateCoupon(req.params.id, req.body, req.user));
