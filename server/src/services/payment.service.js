import { PAYMENT_METHODS, PAYMENT_STATUS } from '../constants.js';
import { env } from '../config/env.js';
import { Order } from '../models/index.js';
import { emitToUser } from '../realtime.js';
import { AppError, badRequest } from '../utils/errors.js';
import { notify } from './notification.service.js';

/**
 * Payment sits behind this module so the method can grow without touching the order flow.
 * Cash-on-collection is settled at the hub. Online payment uses a Stripe Checkout Session:
 * the customer is redirected to Stripe, and a signed webhook is the only thing that marks the
 * order PAID (never the browser redirect).
 */
const methods = {
  [PAYMENT_METHODS.CASH_ON_COLLECTION]: {
    initiate: () => ({ paymentStatus: PAYMENT_STATUS.PENDING }),
    onCollected: () => ({ paymentStatus: PAYMENT_STATUS.PAID }),
    onCancelled: () => ({ paymentStatus: PAYMENT_STATUS.VOID }),
  },
  [PAYMENT_METHODS.ONLINE_PAYMENT]: {
    // The session is created after the order is saved (it needs an id for the redirect URLs).
    initiate: () => ({ paymentStatus: PAYMENT_STATUS.PENDING }),
    onCollected: () => ({ paymentStatus: PAYMENT_STATUS.PAID }),
    onCancelled: () => ({ paymentStatus: PAYMENT_STATUS.VOID }),
  },
};

let stripe;
let configured = false;

export const onlinePaymentEnabled = () => Boolean(env.payment.stripeSecretKey);

async function ensureStripe() {
  if (configured) return stripe;
  configured = true;
  if (!env.payment.stripeSecretKey) return null;
  try {
    // Lazy import keeps the API booting when the optional SDK is unavailable.
    const stripePkg = await import('stripe');
    stripe = stripePkg.default(env.payment.stripeSecretKey);
  } catch (err) {
    console.error('[payment] stripe unavailable:', err.message);
    stripe = null;
  }
  return stripe;
}

function method(name) {
  const m = methods[name];
  if (!m) throw badRequest(`Unsupported payment method ${name}`);
  return m;
}

export const initiatePayment = (order) => Object.assign(order, method(order.paymentMethod).initiate(order));
export const settleOnCollection = (order) => Object.assign(order, method(order.paymentMethod).onCollected(order));
export const voidPayment = (order) => Object.assign(order, method(order.paymentMethod).onCancelled(order));

const money = (n) => Math.round(Number(n || 0) * 100);

/** Creates (or reuses) a Stripe Checkout Session for an order and stores its URL on the order. */
export async function createCheckoutSession(order) {
  const s = await ensureStripe();
  if (!s) throw new AppError(503, 'Online payment is not configured', 'PAYMENT_UNAVAILABLE');

  const session = await s.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: String(order._id),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'bdt',
          unit_amount: money(order.total),
          product_data: { name: `GoodPanda order #${String(order._id).slice(-6).toUpperCase()}` },
        },
      },
    ],
    metadata: { orderId: String(order._id) },
    success_url: `${env.clientOrigin}/orders/${order._id}?payment=success`,
    cancel_url: `${env.clientOrigin}/orders/${order._id}?payment=cancelled`,
  });

  order.paymentSessionId = session.id;
  order.paymentUrl = session.url;
  order.paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? order.paymentIntentId;
  await order.save();
  return session;
}

/** Best-effort cancellation of an unpaid session when the order is cancelled. */
export async function expireCheckoutSession(order) {
  if (!order.paymentSessionId || order.paymentStatus === PAYMENT_STATUS.PAID) return;
  const s = await ensureStripe();
  if (!s) return;
  await s.checkout.sessions.expire(order.paymentSessionId).catch((err) => {
    console.error('[payment] could not expire session:', err.message);
  });
}

/** Verifies the Stripe signature over the raw request body. */
export async function constructWebhookEvent(rawBody, signature) {
  const s = await ensureStripe();
  if (!s || !env.payment.stripeWebhookSecret) {
    throw new AppError(503, 'Payment webhook is not configured', 'WEBHOOK_UNAVAILABLE');
  }
  return s.webhooks.constructEvent(rawBody, signature, env.payment.stripeWebhookSecret);
}

/**
 * Marks an order paid from a completed Checkout Session. Idempotent: Stripe retries webhooks.
 * Returns the updated order, or null when the referenced order does not exist.
 */
export async function markPaidFromSession(session) {
  const orderId = session?.client_reference_id || session?.metadata?.orderId;
  if (!orderId) return null;
  const order = await Order.findById(orderId);
  if (!order || order.paymentStatus === PAYMENT_STATUS.PAID) return order;

  order.paymentStatus = PAYMENT_STATUS.PAID;
  order.paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? order.paymentIntentId;
  order.paidAt = new Date();
  order.paymentUrl = null;
  await order.save();

  emitToUser(order.customer, 'payment:updated', { orderId: String(order._id), paymentStatus: order.paymentStatus });
  await notify(order.customer, {
    type: 'ORDER_STATUS',
    title: 'Payment received',
    body: `We received ৳${Number(order.total).toFixed(2)} for order #${String(order._id).slice(-6)}.`,
    order: order._id,
  }).catch(() => {});
  return order;
}

/** Stripe webhook fan-out. Unknown event types are acknowledged and ignored. */
export async function handleStripeEvent(event) {
  if (event.type === 'checkout.session.completed') return markPaidFromSession(event.data.object);
  if (event.type === 'checkout.session.expired') {
    const orderId = event.data.object?.client_reference_id || event.data.object?.metadata?.orderId;
    if (orderId) {
      // The customer never paid; let them start a fresh session from the order page.
      await Order.updateOne({ _id: orderId, paymentStatus: { $ne: PAYMENT_STATUS.PAID } }, { paymentUrl: null });
    }
    return null;
  }
  return null;
}
