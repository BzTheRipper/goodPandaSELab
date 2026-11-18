import { Notification, User } from '../models/index.js';
import { emitToUser } from '../realtime.js';
import { notFound } from '../utils/errors.js';

export async function notify(userIds, { type, title, body = '', order }) {
  const ids = [...new Set([].concat(userIds).filter(Boolean).map(String))];
  const docs = await Notification.insertMany(ids.map((user) => ({ user, type, title, body, order })));
  docs.forEach((n) => emitToUser(n.user, 'notification', n.toJSON()));
  return docs;
}

export async function notifyAdmins(payload) {
  const admins = await User.find({ role: 'admin', isActive: true }).select('_id');
  return notify(admins.map((a) => a._id), payload);
}

export async function listForUser(userId) {
  const [items, unread] = await Promise.all([
    Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(50),
    Notification.countDocuments({ user: userId, read: false }),
  ]);
  return { items, unread };
}

export async function markRead(userId, id) {
  const n = await Notification.findOneAndUpdate({ _id: id, user: userId }, { read: true }, { new: true });
  if (!n) throw notFound('Notification');
  return n;
}

export const markAllRead = (userId) => Notification.updateMany({ user: userId, read: false }, { read: true });
