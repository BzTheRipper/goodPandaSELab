import { connectDb, disconnectDb } from '../config/db.js';
import { env } from '../config/env.js';
import { SEED_CREDENTIALS } from './seedData.js';
import { seedDemoData } from './seedDemo.js';

try {
  await connectDb(env.mongoUri);
  const result = await seedDemoData();
  console.log(`Demo seed complete: ${result.orders} orders, ${result.reviews} reviews, ${result.notifications} notifications.`);
  console.log(`One order is waiting at Banani Drone Hub with pickup code ${'246810'}.`);
  console.log('Credentials:');
  console.table(SEED_CREDENTIALS);
} catch (err) {
  console.error('Demo seed failed:', err.message);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
