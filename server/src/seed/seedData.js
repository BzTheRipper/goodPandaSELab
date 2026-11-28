import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { AuditLog, Campaign, Coupon, Dispute, Drone, Hub, MenuItem, Message, Notification, Order, PushSubscription, Restaurant, Review, Setting, User } from '../models/index.js';
import { hashPassword } from '../services/auth.service.js';

// Dummy images hosted on ImgBB (i.ibb.co). Run src/scripts/upload-dummy-images.js
// to regenerate image-urls.json with fresh uploads.
const IMAGE_URLS = JSON.parse(
  await fs.readFile(path.resolve(process.cwd(), 'image-urls.json'), 'utf8'),
);

const img = (key) => IMAGE_URLS[key] || '';

export const SEED_CREDENTIALS = {
  admin: { email: 'admin@goodpanda.test', password: 'admin123' },
  owner1: { email: 'owner1@goodpanda.test', password: 'owner123' },
  owner2: { email: 'owner2@goodpanda.test', password: 'owner123' },
  customer: { email: 'customer@goodpanda.test', password: 'customer123' },
  hubOperator: { email: 'hub@goodpanda.test', password: 'hub123' },
};

const user = async (key, name, role, phone, address = '') => ({
  name,
  role,
  phone,
  address,
  email: SEED_CREDENTIALS[key].email,
  passwordHash: await hashPassword(SEED_CREDENTIALS[key].password),
});

/** Wipes all GoodPanda collections and inserts demo data. */
export async function seedDatabase() {
  await Promise.all(
    [User, Restaurant, MenuItem, Order, Hub, Drone, Message, Notification, Setting, Review, AuditLog, PushSubscription, Coupon, Dispute, Campaign].map((m) => m.deleteMany({}))
  );

  const [, owner1, owner2] = await User.insertMany([
    await user('admin', 'Platform Admin', 'admin', '+8801700000000'),
    await user('owner1', 'Rahim Uddin', 'owner', '+8801711111111'),
    await user('owner2', 'Nadia Karim', 'owner', '+8801722222222'),
    await user('customer', 'Sadia Customer', 'customer', '+8801733333333', 'House 12, Road 5, Banani, Dhaka'),
  ]);

  const [biryani, greenLeaf] = await Restaurant.insertMany([
    {
      owner: owner1._id,
      name: 'Panda Biryani House',
      description: 'Slow-cooked kacchi biryani and Bangladeshi classics.',
      phone: '+8801711111111',
      address: 'Road 27, Dhanmondi, Dhaka',
      location: { lat: 23.7461, lng: 90.3742 },
      categories: ['Biryani', 'Bangladeshi'],
      logoUrl: img('biryani-logo'),
      coverUrl: img('biryani-cover'),
      isOpen: true,
      status: 'APPROVED',
    },
    {
      owner: owner2._id,
      name: 'Green Leaf Cafe',
      description: 'Fresh salads, wraps, juices and healthy bowls.',
      phone: '+8801722222222',
      address: 'Gulshan Avenue, Gulshan 1, Dhaka',
      location: { lat: 23.7808, lng: 90.4167 },
      categories: ['Healthy', 'Cafe'],
      logoUrl: img('greenleaf-logo'),
      coverUrl: img('greenleaf-cover'),
      isOpen: true,
      status: 'APPROVED',
    },
  ]);

  await MenuItem.insertMany([
    { restaurant: biryani._id, name: 'Kacchi Biryani', description: 'Mutton, aromatic rice, potato', price: 350, category: 'Biryani', imageUrl: img('kacchi-biryani') },
    { restaurant: biryani._id, name: 'Chicken Tehari', description: 'Spiced chicken and rice', price: 220, category: 'Biryani', imageUrl: img('chicken-tehari') },
    { restaurant: biryani._id, name: 'Beef Bhuna', description: 'Slow-cooked beef curry', price: 280, category: 'Curry', imageUrl: img('beef-bhuna') },
    { restaurant: biryani._id, name: 'Borhani', description: 'Spiced yogurt drink', price: 60, category: 'Drinks', imageUrl: img('borhani') },
    { restaurant: biryani._id, name: 'Firni', description: 'Rice pudding', price: 80, category: 'Dessert', isAvailable: false, imageUrl: img('firni') },
    { restaurant: greenLeaf._id, name: 'Caesar Salad', description: 'Romaine, parmesan, croutons', price: 320, category: 'Salads', imageUrl: img('caesar-salad') },
    { restaurant: greenLeaf._id, name: 'Chicken Wrap', description: 'Grilled chicken, veggies, garlic sauce', price: 260, category: 'Wraps', imageUrl: img('chicken-wrap') },
    { restaurant: greenLeaf._id, name: 'Quinoa Bowl', description: 'Quinoa, avocado, chickpeas', price: 390, category: 'Bowls', imageUrl: img('quinoa-bowl') },
    { restaurant: greenLeaf._id, name: 'Iced Lemon Tea', description: 'Can be made with 0-calorie sugar', price: 120, category: 'Drinks', imageUrl: img('iced-lemon-tea') },
    { restaurant: greenLeaf._id, name: 'Fresh Orange Juice', description: 'No added sugar', price: 150, category: 'Drinks', imageUrl: img('orange-juice') },
  ]);

  const hubs = await Hub.insertMany([
    { name: 'Banani Drone Hub', address: 'Road 11, Banani, Dhaka', location: { lat: 23.7937, lng: 90.4066 } },
    { name: 'Motijheel Drone Hub', address: 'Shapla Chattar, Motijheel, Dhaka', location: { lat: 23.733, lng: 90.4172 } },
    { name: 'Mirpur Drone Hub', address: 'Mirpur 10 Circle, Dhaka', location: { lat: 23.8069, lng: 90.3687 } },
  ]);

  await User.create({
    ...(await user('hubOperator', 'Hub Operator', 'hub_operator', '+8801744444444')),
    hub: hubs[0]._id,
  });

  await Drone.insertMany([
    { identifier: 'GP-DR-01', battery: 100, capacityUnits: 12, location: biryani.location },
    { identifier: 'GP-DR-02', battery: 90, capacityUnits: 12, location: greenLeaf.location },
    { identifier: 'GP-DR-03', battery: 75, capacityUnits: 24, location: hubs[0].location },
    { identifier: 'GP-DR-04', battery: 15, capacityUnits: 6, location: hubs[1].location },
  ]);

  await Setting.create({ key: 'deliveryFee', value: env.defaultDeliveryFee });
  return { hubs };
}
