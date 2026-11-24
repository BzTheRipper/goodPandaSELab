import { startServer } from './server.js';

process.on('unhandledRejection', (reason) => {
  console.error(JSON.stringify({ level: 'error', msg: 'unhandledRejection', error: String(reason) }));
});

startServer().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
