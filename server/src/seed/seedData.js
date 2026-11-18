import { env } from '../config/env.js';
import { Drone, Hub, MenuItem, Message, Notification, Order, Restaurant, Setting, User } from '../models/index.js';
import { hashPassword } from '../services/auth.service.js';

export const SEED_CREDENTIALS = {
  admin: { email: 'admin@goodpanda.test', password: 'admin123' },
  owner1: { email: 'owner1@goodpanda.test', password: 'owner123' },
  owner2: { email: 'owner2@goodpanda.test', password: 'owner123' },
  customer: { email: 'customer@goodpanda.test', password: 'customer123' },
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
  await Promise.all([User, Restaurant, MenuItem, Order, Hub, Drone, Message, Notification, Setting].map((m) => m.deleteMany({})));

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
      isOpen: true,
      status: 'APPROVED',
    },
  ]);

  await MenuItem.insertMany([
    { restaurant: biryani._id, name: 'Kacchi Biryani', description: 'Mutton, aromatic rice, potato', price: 350, category: 'Biryani' },
    { restaurant: biryani._id, name: 'Chicken Tehari', description: 'Spiced chicken and rice', price: 220, category: 'Biryani' },
    { restaurant: biryani._id, name: 'Beef Bhuna', description: 'Slow-cooked beef curry', price: 280, category: 'Curry' },
    { restaurant: biryani._id, name: 'Borhani', description: 'Spiced yogurt drink', price: 60, category: 'Drinks' },
    { restaurant: biryani._id, name: 'Firni', description: 'Rice pudding', price: 80, category: 'Dessert', isAvailable: false },
    { restaurant: greenLeaf._id, name: 'Caesar Salad', description: 'Romaine, parmesan, croutons', price: 320, category: 'Salads' },
    { restaurant: greenLeaf._id, name: 'Chicken Wrap', description: 'Grilled chicken, veggies, garlic sauce', price: 260, category: 'Wraps' },
    { restaurant: greenLeaf._id, name: 'Quinoa Bowl', description: 'Quinoa, avocado, chickpeas', price: 390, category: 'Bowls' },
    { restaurant: greenLeaf._id, name: 'Iced Lemon Tea', description: 'Can be made with 0-calorie sugar', price: 120, category: 'Drinks' },
    { restaurant: greenLeaf._id, name: 'Fresh Orange Juice', description: 'No added sugar', price: 150, category: 'Drinks' },
  ]);

  const hubs = await Hub.insertMany([
    { name: 'Banani Drone Hub', address: 'Road 11, Banani, Dhaka', location: { lat: 23.7937, lng: 90.4066 } },
    { name: 'Motijheel Drone Hub', address: 'Shapla Chattar, Motijheel, Dhaka', location: { lat: 23.733, lng: 90.4172 } },
    { name: 'Mirpur Drone Hub', address: 'Mirpur 10 Circle, Dhaka', location: { lat: 23.8069, lng: 90.3687 } },
  ]);

  await Drone.insertMany([
    { identifier: 'GP-DR-01', battery: 100, location: biryani.location },
    { identifier: 'GP-DR-02', battery: 90, location: greenLeaf.location },
    { identifier: 'GP-DR-03', battery: 75, location: hubs[0].location },
    { identifier: 'GP-DR-04', battery: 15, location: hubs[1].location },
  ]);

  await Setting.create({ key: 'deliveryFee', value: env.defaultDeliveryFee });
  return { hubs };
}
