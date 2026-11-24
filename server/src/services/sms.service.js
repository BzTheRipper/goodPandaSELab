import { env } from '../config/env.js';

let twilio;
let configured = false;

/**
 * Lazily loads twilio and wires the credentials once. SMS is a no-op without keys.
 * `twilio` is an optional dependency (not in package.json): `npm i twilio` to enable it.
 */
async function ensureConfigured() {
  if (configured) return Boolean(twilio);
  configured = true;
  if (!env.sms.accountSid || !env.sms.authToken || !env.sms.fromNumber) return false;
  try {
    const twilioPkg = await import('twilio');
    twilio = twilioPkg.default(env.sms.accountSid, env.sms.authToken);
    return true;
  } catch (err) {
    console.error('[sms] twilio unavailable:', err.message);
    twilio = null;
    return false;
  }
}

export const smsEnabled = () => Boolean(env.sms.accountSid && env.sms.authToken && env.sms.fromNumber);

/**
 * Send an SMS to one phone number. Best-effort: failures never bubble into the calling flow.
 */
export async function sendSms(to, body) {
  if (!(await ensureConfigured())) return;
  try {
    await twilio.messages.create({ body, from: env.sms.fromNumber, to });
  } catch (err) {
    console.error('[sms] send failed:', err.message);
  }
}

/** Send SMS to multiple users by looking up their phone numbers. */
export async function sendSmsToUsers(userIds, body) {
  if (!(await smsEnabled())) return;
  const { User } = await import('../models/index.js');
  const users = await User.find({ _id: { $in: userIds }, phone: { $ne: null } }).select('_id phone');
  await Promise.all(
    users.map((u) => sendSms(u.phone, body).catch(() => {}))
  );
}
