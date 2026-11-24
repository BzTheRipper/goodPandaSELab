import { constructWebhookEvent, handleStripeEvent } from '../services/payment.service.js';

/**
 * Stripe webhook. Mounted with `express.raw` before the JSON body parser, because signature
 * verification needs the exact bytes Stripe signed.
 */
export async function webhook(req, res) {
  const signature = req.headers['stripe-signature'];
  if (!signature) return res.status(400).json({ error: { message: 'Missing Stripe signature', code: 'BAD_REQUEST' } });

  let event;
  try {
    event = await constructWebhookEvent(req.body, signature);
  } catch (err) {
    // Includes signature failures (400 from Stripe) and "webhook not configured" (503).
    const status = err.status || 400;
    return res.status(status).json({ error: { message: err.message || 'Invalid webhook payload', code: err.code || 'BAD_REQUEST' } });
  }

  await handleStripeEvent(event);
  // Stripe only needs a 2xx to stop retrying.
  res.json({ received: true });
}
