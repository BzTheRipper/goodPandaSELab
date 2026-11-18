import { MenuItem } from '../models/index.js';
import { notFound } from '../utils/errors.js';
import { getOwned } from './restaurant.service.js';
import { storage } from './storage.service.js';

async function ownedItem(ownerId, itemId) {
  const restaurant = await getOwned(ownerId);
  const item = await MenuItem.findOne({ _id: itemId, restaurant: restaurant._id });
  if (!item) throw notFound('Menu item');
  return item;
}

export async function listOwned(ownerId) {
  const restaurant = await getOwned(ownerId);
  return MenuItem.find({ restaurant: restaurant._id }).sort({ category: 1, name: 1 });
}

export async function create(ownerId, data, file) {
  const restaurant = await getOwned(ownerId);
  const item = new MenuItem({ ...data, restaurant: restaurant._id });
  if (file) item.imageUrl = await storage.save(file);
  return item.save();
}

export async function update(ownerId, itemId, data, file) {
  const item = await ownedItem(ownerId, itemId);
  Object.assign(item, data);
  if (file) {
    await storage.remove(item.imageUrl);
    item.imageUrl = await storage.save(file);
  }
  return item.save();
}

export async function setAvailability(ownerId, itemId, isAvailable) {
  const item = await ownedItem(ownerId, itemId);
  item.isAvailable = isAvailable;
  return item.save();
}

export async function remove(ownerId, itemId) {
  const item = await ownedItem(ownerId, itemId);
  await storage.remove(item.imageUrl);
  await item.deleteOne();
}
