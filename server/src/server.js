import http from 'node:http';
import { createApp } from './app.js';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';
import { resumeFlights } from './services/delivery.service.js';
import { releaseDueScheduledOrders } from './services/order.service.js';
import { initSocket } from './socket/index.js';

const SCHEDULE_TICK_MS = 30_000;

/** Releases scheduled orders whose time has come; runs on boot and then on a timer. */
function startOrderScheduler() {
  const tick = () =>
    releaseDueScheduledOrders().catch((err) => console.error('[scheduler] scheduled orders failed:', err.message));
  tick();
  const timer = setInterval(tick, SCHEDULE_TICK_MS);
  // Never hold the process open just for the scheduler.
  timer.unref();
  return timer;
}

export async function startServer({ mongoUri = env.mongoUri, port = env.port } = {}) {
  await connectDb(mongoUri);
  const server = http.createServer(createApp());
  initSocket(server);
  await new Promise((resolve) => server.listen(port, resolve));
  console.log(`GoodPanda API listening on http://localhost:${port}`);
  await resumeFlights();
  startOrderScheduler();
  return server;
}
