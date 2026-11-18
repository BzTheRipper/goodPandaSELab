import { connectDb, disconnectDb } from '../config/db.js';
import { env } from '../config/env.js';
import { SEED_CREDENTIALS, seedDatabase } from './seedData.js';

try {
  await connectDb(env.mongoUri);
  await seedDatabase();
  console.log('Seed complete. Credentials:');
  console.table(SEED_CREDENTIALS);
} catch (err) {
  console.error('Seed failed:', err.message);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
