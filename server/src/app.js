import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { listActiveHubs } from './controllers/admin.controller.js';
import * as nc from './controllers/notification.controller.js';
import { availableDrones } from './controllers/order.controller.js';
import { authenticate, authorize } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import adminRoutes from './routes/admin.routes.js';
import authRoutes from './routes/auth.routes.js';
import orderRoutes from './routes/order.routes.js';
import { ownerRoutes, publicRestaurants } from './routes/restaurant.routes.js';
import { asyncHandler as h } from './utils/asyncHandler.js';

export function createApp() {
  const app = express();
  // Allow the client (different origin in dev) to render uploaded images.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/uploads', express.static(path.resolve(env.uploadDir)));

  app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'GoodPanda' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/restaurants', publicRestaurants);
  app.use('/api/owner', ownerRoutes);
  app.get('/api/hubs', h(listActiveHubs));
  app.get('/api/drones/available', authenticate, authorize('owner'), h(availableDrones));
  app.use('/api/orders', orderRoutes);
  app.use('/api/admin', adminRoutes);

  app.get('/api/notifications', authenticate, h(nc.list));
  app.post('/api/notifications/read-all', authenticate, h(nc.markAllRead));
  app.patch('/api/notifications/:id/read', authenticate, h(nc.markRead));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
