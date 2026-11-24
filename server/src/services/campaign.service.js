import { Campaign, Order, User } from '../models/index.js';
import { ORDER_STATUS, ROLES } from '../constants.js';
import { audit } from './audit.service.js';
import { notify } from './notification.service.js';

const DAY = 24 * 60 * 60 * 1000;

/** Resolves a campaign segment to the active users it should reach. */
export async function segmentUsers(segment) {
  const active = { isActive: true, deletedAt: null };
  if (segment === 'all_users') return User.find(active).select('_id');
  if (segment === 'all_owners') return User.find({ ...active, role: ROLES.OWNER }).select('_id');
  if (segment === 'all_customers') return User.find({ ...active, role: ROLES.CUSTOMER }).select('_id');

  // Ordered recently (or never) — used by both customer segments.
  const since = new Date(Date.now() - 30 * DAY);
  const recent = await Order.distinct('customer', { createdAt: { $gte: since }, status: { $ne: ORDER_STATUS.REJECTED } });
  const recentIds = recent.map(String);
  const base = { ...active, role: ROLES.CUSTOMER };
  if (segment === 'active_customers') return User.find({ ...base, _id: { $in: recentIds } }).select('_id');
  // lapsed_30d: everybody else active (including customers who never ordered).
  return User.find({ ...base, _id: { $nin: recentIds } }).select('_id');
}

export async function previewCampaign(segment) {
  const users = await segmentUsers(segment);
  const sample = await User.find({ _id: { $in: users.slice(0, 3).map((u) => u._id) } }).select('name email');
  return { segment, count: users.length, sample: sample.map((u) => ({ name: u.name, email: u.email })) };
}

/** Creates the Campaign row and fans the message out through the normal notification pipeline. */
export async function sendCampaign({ title, body, segment }, actor) {
  const users = await segmentUsers(segment);
  let delivered = 0;
  // Chunk the fan-out: each notify() writes one Notification per user plus push/SMS side effects.
  for (let i = 0; i < users.length; i += 100) {
    const chunk = users.slice(i, i + 100).map((u) => u._id);
    const docs = await notify(chunk, { type: 'CAMPAIGN', title, body });
    delivered += docs.length;
  }
  const campaign = await Campaign.create({
    title,
    body,
    segment,
    recipients: users.length,
    delivered,
    createdBy: actor._id,
  });
  await audit({
    actor,
    action: 'CAMPAIGN_SENT',
    targetType: 'campaign',
    target: campaign._id,
    summary: `${title} → ${segment} (${delivered}/${users.length})`,
  });
  return campaign;
}

export const listCampaigns = (limit = 20) => Campaign.find().sort({ sentAt: -1 }).limit(limit).populate('createdBy', 'name');
