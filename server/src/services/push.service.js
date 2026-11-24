import { env } from '../config/env.js';
import { PushSubscription } from '../models/index.js';
import { conflict } from '../utils/errors.js';

let webPush;
let configured = false;

/** Lazily loads web-push and wires the VAPID identity once. Push is a no-op without keys. */
async function ensureConfigured() {
  if (configured) return Boolean(webPush);
  configured = true;
  if (!env.push.vapidPublicKey || !env.push.vapidPrivateKey) return false;
  try {
    webPush = (await import('web-push')).default;
    webPush.setVapidDetails(env.push.subject, env.push.vapidPublicKey, env.push.vapidPrivateKey);
    return true;
  } catch (err) {
    console.error('[push] web-push unavailable:', err.message);
    webPush = null;
    return false;
  }
}

export const pushEnabled = () => Boolean(env.push.vapidPublicKey && env.push.vapidPrivateKey);
export const vapidPublicKey = () => env.push.vapidPublicKey;

export async function subscribe(userId, subscription) {
  const { endpoint, keys } = subscription;
  // An endpoint belongs to one device/account: never let another user claim a known endpoint.
  const existing = await PushSubscription.findOne({ endpoint }).select('user');
  if (existing && String(existing.user) !== String(userId)) {
    throw conflict('This device is already registered to another account', 'PUSH_ENDPOINT_TAKEN');
  }
  return PushSubscription.findOneAndUpdate(
    { endpoint, user: userId },
    { user: userId, endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export const unsubscribe = (userId, endpoint) => PushSubscription.deleteOne({ user: userId, endpoint });

/**
 * Best-effort Web Push to every device a user registered. Dead subscriptions (404/410) are
 * removed; failures never bubble into the calling flow.
 */
export async function pushToUsers(userIds, payload) {
  if (!(await ensureConfigured())) return;
  const ids = [...new Set([].concat(userIds).filter(Boolean).map(String))];
  if (!ids.length) return;
  const subs = await PushSubscription.find({ user: { $in: ids } });
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload),
          { TTL: 3600 }
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
        }
        // Other failures (offline device, rate limit) are transient; leave the subscription.
      }
    })
  );
}
