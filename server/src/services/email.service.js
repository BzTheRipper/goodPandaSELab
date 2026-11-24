import { env } from '../config/env.js';
import { User } from '../models/index.js';

/**
 * Transactional email behind a tiny seam. Any Resend-compatible HTTP endpoint works
 * (`POST {apiUrl}` with `{from,to,subject,text,html}`). Without a key every send is a no-op,
 * so local development and tests never touch the network.
 */
export const emailEnabled = () => Boolean(env.email.apiKey);

export async function sendEmail({ to, subject, text, html }) {
  if (!emailEnabled() || !to) return false;
  const res = await fetch(env.email.apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.email.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.email.from, to, subject, text, html }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Email provider responded ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  return true;
}

const money = (n) => `৳${Number(n || 0).toFixed(2)}`;

/** Plain-text + minimal HTML receipt body for a collected order. */
export function buildReceiptEmail(order) {
  const items = order.items.filter((i) => !i.removed);
  const lines = items.map((i) => `${i.quantity} × ${i.name} — ${money(i.price * i.quantity)}`);
  const text = [
    `Thanks for ordering with GoodPanda, ${order.customer?.name || 'there'}.`,
    '',
    `Order #${String(order._id).slice(-6).toUpperCase()}`,
    `${order.restaurant?.name || 'Restaurant'} → ${order.hub?.name || 'Hub'}`,
    ...lines,
    '',
    `Subtotal: ${money(order.subtotal)}`,
    `Delivery: ${money(order.deliveryFee)}`,
    `Total: ${money(order.total)} (${order.paymentStatus === 'PAID' ? 'paid' : 'due in cash'})`,
    '',
    'Order history and your pickup code stay available in your GoodPanda account.',
  ].join('\n');

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
      <h2 style="margin:0 0 8px">GoodPanda receipt</h2>
      <p style="margin:0 0 16px;color:#525b56">Order #${String(order._id).slice(-6).toUpperCase()} · ${order.restaurant?.name || 'Restaurant'} → ${order.hub?.name || 'Hub'}</p>
      <table style="width:100%;border-collapse:collapse">
        ${items
          .map(
            (i) =>
              `<tr><td style="padding:6px 0;border-bottom:1px solid #e6e9e7">${i.quantity} × ${i.name}</td><td align="right" style="padding:6px 0;border-bottom:1px solid #e6e9e7">${money(i.price * i.quantity)}</td></tr>`
          )
          .join('')}
      </table>
      <p style="margin:16px 0 0">Subtotal ${money(order.subtotal)}<br>Delivery ${money(order.deliveryFee)}<br><strong>Total ${money(order.total)}</strong></p>
      <p style="color:#525b56;font-size:13px">${order.paymentStatus === 'PAID' ? 'Paid' : 'Pay cash at the hub'} · Thanks for ordering.</p>
    </div>`;

  return { subject: `Your GoodPanda receipt for order #${String(order._id).slice(-6).toUpperCase()}`, text, html };
}

/**
 * Emails a receipt to the order's customer. Never throws: email is a convenience, not part of
 * the collection transaction. Returns { sent, configured } so callers can tell the user.
 */
export async function emailReceipt(order) {
  if (!emailEnabled()) return { sent: false, configured: false };
  const customer = await User.findById(order.customer).select('email').lean();
  const to = customer?.email;
  // Deleted accounts use the reserved .invalid domain.
  if (!to || to.endsWith('@goodpanda.invalid')) return { sent: false, configured: true };
  try {
    await sendEmail({ to, ...buildReceiptEmail(order) });
    return { sent: true, configured: true };
  } catch (err) {
    console.error('[email] receipt failed:', err.message);
    return { sent: false, configured: true, error: err.message };
  }
}
