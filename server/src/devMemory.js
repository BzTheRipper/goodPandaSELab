// Runs the API against a throw-away in-memory MongoDB, seeded on every start. Handy when MongoDB isn't installed.
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SEED_CREDENTIALS, seedDatabase } from './seed/seedData.js';
import { startServer } from './server.js';

const mongo = await MongoMemoryServer.create();
await startServer({ mongoUri: mongo.getUri('goodpanda') });
await seedDatabase();
console.log('In-memory database seeded (data is lost on exit). Credentials:');
console.table(SEED_CREDENTIALS);

const shutdown = async () => {
  await mongo.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
