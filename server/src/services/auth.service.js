import bcrypt from 'bcryptjs';
import { RESTAURANT_STATUS } from '../constants.js';
import { Restaurant, User } from '../models/index.js';
import { signToken } from '../middleware/auth.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../utils/errors.js';
import { storage } from './storage.service.js';

export const hashPassword = (pw) => bcrypt.hash(pw, 10);

export async function register(data) {
  if (await User.exists({ email: data.email.toLowerCase() })) throw conflict('Email is already registered');
  const user = await User.create({ ...data, passwordHash: await hashPassword(data.password) });
  return { token: signToken(user), user };
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
