import bcrypt from 'bcryptjs';
import { ORDER_STATUS, RESTAURANT_STATUS, ROLES } from '../constants.js';
import { Notification, Order, PushSubscription, Restaurant, Review, User } from '../models/index.js';
import { signToken } from '../middleware/auth.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../utils/errors.js';
import { audit } from './audit.service.js';
import { applyInvite, ensureReferralCode } from './referral.service.js';
import { storage } from './storage.service.js';

export const hashPassword = (pw) => bcrypt.hash(pw, 10);

export async function register(data) {
  if (await User.exists({ email: data.email.toLowerCase() })) throw conflict('Email is already registered');
  const { referralCode, ...fields } = data;
  const user = await User.create({ ...fields, passwordHash: await hashPassword(data.password) });
  // Customers get their own invite code immediately; owners do not participate in referrals.
  if (user.role === 'customer') {
    await ensureReferralCode(user);
    if (referralCode) await applyInvite(user, referralCode).catch(() => {});
  }
  const fresh = await User.findById(user._id);
  return { token: signToken(fresh), user: fresh };
}

export async function login({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw unauthorized('Invalid email or password');
  if (!user.isActive) throw forbidden('Account is deactivated');
  return { token: signToken(user), user };
}

export async function updateProfile(user, data) {
  Object.assign(user, data);
  await user.save();
  return user;
}

export async function updateNotificationPrefs(user, prefs) {
  user.notificationPrefs = { ...(user.notificationPrefs?.toObject?.() ?? {}), ...prefs };
  await user.save();
  return user;
}

export async function changePassword(user, { currentPassword, newPassword }) {
  const withHash = await User.findById(user._id).select('+passwordHash');
  if (!(await bcrypt.compare(currentPassword, withHash.passwordHash))) {
    throw badRequest('Your current password is incorrect.');
  }
  withHash.passwordHash = await hashPassword(newPassword);
  await withHash.save();
}

export async function setAvatar(user, file) {
  if (!file) throw badRequest('Choose an image to upload');
  const previous = user.avatarUrl;
  user.avatarUrl = await storage.save(file);
  await user.save();
  await storage.remove(previous);
  return user;
}

export async function removeAvatar(user) {
  await storage.remove(user.avatarUrl);
  user.avatarUrl = undefined;
  await user.save();
  return user;
}

// ---- favourites ----
export async function listFavorites(user) {
  return Restaurant.find({ _id: { $in: user.favorites }, status: RESTAURANT_STATUS.APPROVED }).sort({ isOpen: -1, name: 1 });
}

export async function addFavorite(user, restaurantId) {
  if (!(await Restaurant.exists({ _id: restaurantId, status: RESTAURANT_STATUS.APPROVED }))) throw notFound('Restaurant');
  await User.updateOne({ _id: user._id }, { $addToSet: { favorites: restaurantId } });
  return (await User.findById(user._id)).favorites;
}

export async function removeFavorite(user, restaurantId) {
  await User.updateOne({ _id: user._id }, { $pull: { favorites: restaurantId } });
  return (await User.findById(user._id)).favorites;
}

// ---- privacy: export & delete ----

const ACTIVE_ORDER_STATUSES = [
  ORDER_STATUS.PLACED,
  ORDER_STATUS.ACCEPTED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY_FOR_DRONE,
  ORDER_STATUS.IN_FLIGHT,
  ORDER_STATUS.ARRIVED_AT_HUB,
  ORDER_STATUS.NEEDS_CUSTOMER_CONFIRMATION,
];

/** Everything GoodPanda holds about the caller, in one JSON document. */
export async function exportData(user) {
  const [orders, reviews, notifications] = await Promise.all([
    Order.find({ customer: user._id }).sort({ createdAt: -1 }).limit(500).lean(),
    Review.find({ customer: user._id }).lean(),
    Notification.find({ user: user._id }).sort({ createdAt: -1 }).limit(200).lean(),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      role: user.role,
      favoriteRestaurants: (user.favorites || []).map(String),
      notificationPrefs: user.notificationPrefs,
      createdAt: user.createdAt,
    },
    orders,
    reviews,
    notifications,
  };
}

/**
 * Soft-deletes a customer: personal fields are anonymised in place, order history keeps pointing
 * at the (now anonymous) row so restaurants and admins can still reconcile cash.
 */
export async function deleteAccount(user) {
  if (user.role !== ROLES.CUSTOMER) {
    throw forbidden('Only customer accounts can be deleted from here. Contact an admin for staff accounts.');
  }
  const active = await Order.countDocuments({ customer: user._id, status: { $in: ACTIVE_ORDER_STATUSES } });
  if (active > 0) throw conflict('Finish or cancel your active orders before deleting your account', 'ACTIVE_ORDERS');

  await storage.remove(user.avatarUrl);
  await Promise.all([
    PushSubscription.deleteMany({ user: user._id }),
    Notification.deleteMany({ user: user._id }),
    User.updateOne(
      { _id: user._id },
      {
        $set: {
          name: 'Deleted customer',
          email: `deleted+${user._id}@goodpanda.invalid`,
          phone: '',
          address: '',
          avatarUrl: null,
          favorites: [],
          isActive: false,
          deletedAt: new Date(),
        },
      }
    ),
  ]);
  await audit({
    actor: user,
    action: 'ACCOUNT_DELETED',
    targetType: 'user',
    target: user._id,
    summary: 'Customer account anonymised',
  });
}
