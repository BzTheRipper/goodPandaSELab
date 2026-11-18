import { startServer } from './server.js';

startServer().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
