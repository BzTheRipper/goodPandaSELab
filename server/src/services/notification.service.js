import { Notification, User } from '../models/index.js';
import { emitToUser } from '../realtime.js';
import { notFound } from '../utils/errors.js';
import { pushToUsers } from './push.service.js';
import { sendSmsToUsers } from './sms.service.js';

/** Notification types that warrant an SMS to the customer's phone. */
const SMS_TYPES = new Set([
  'ORDER_STATUS',
  'CONFIRMATION_REQUESTED',
  'CANCEL_REQUESTED',
  'APPROACHING',
  'NEW_ORDER',
]);

export async function notify(userIds, { type, title, body = '', order }) {
  const ids = [...new Set([].concat(userIds).filter(Boolean).map(String))];
  if (!ids.length) return [];

  // Respect each user's channel preferences. Defaults are "on" for users created before this.
  const users = await User.find({ _id: { $in: ids } }).select('notificationPrefs').lean();
  const prefs = new Map(users.map((u) => [String(u._id), u.notificationPrefs || {}]));
  const wants = (id, channel) => prefs.get(id)?.[channel] !== false;
  const inAppIds = ids.filter((id) => wants(id, 'inApp'));
  const pushIds = ids.filter((id) => wants(id, 'push'));
  const smsIds = ids.filter((id) => wants(id, 'sms'));

  const docs = inAppIds.length
    ? await Notification.insertMany(inAppIds.map((user) => ({ user, type, title, body, order })))
    : [];
  docs.forEach((n) => emitToUser(n.user, 'notification', n.toJSON()));
  // Web Push reaches the customer even with the tab closed; no-op without VAPID keys.
  if (pushIds.length) {
    await pushToUsers(pushIds, { type, title, body, order: order ? String(order) : null }).catch(() => {});
  }
  // SMS reaches customers with the app closed; no-op without Twilio credentials.
  if (SMS_TYPES.has(type) && smsIds.length) {
    await sendSmsToUsers(smsIds, `${title}: ${body}`).catch(() => {});
  }
  return docs;
}

export async function notifyAdmins(payload) {
  const admins = await User.find({ role: 'admin', isActive: true }).select('_id');
  return notify(admins.map((a) => a._id), payload);
}

/** Hub staff only see alerts for the hub they are assigned to. */
export async function notifyHubStaff(hubId, payload) {
  if (!hubId) return [];
  const staff = await User.find({ role: 'hub_operator', hub: hubId, isActive: true }).select('_id');
  return notify(staff.map((s) => s._id), payload);
}

export async function listForUser(userId, { page = 1, limit = 20 } = {}) {
  const size = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const current = Math.max(Number(page) || 1, 1);
  const [items, unread, total] = await Promise.all([
    Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip((current - 1) * size)
      .limit(size),
    Notification.countDocuments({ user: userId, read: false }),
    Notification.countDocuments({ user: userId }),
  ]);
  return {
    items,
    unread,
    page: current,
    limit: size,
    total,
    pages: Math.max(1, Math.ceil(total / size)),
  };
}

export async function markRead(userId, id) {
  const n = await Notification.findOneAndUpdate({ _id: id, user: userId }, { read: true }, { new: true });
  if (!n) throw notFound('Notification');
  return n;
}

export const markAllRead = (userId) => Notification.updateMany({ user: userId, read: false }, { read: true });
