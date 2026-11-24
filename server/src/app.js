import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { getSettings } from './services/setting.service.js';
import { listActiveHubs } from './controllers/admin.controller.js';
import * as nc from './controllers/notification.controller.js';
import { availableDrones } from './controllers/order.controller.js';
import * as couponCtl from './controllers/coupon.controller.js';
import * as disputeCtl from './controllers/dispute.controller.js';
import * as payment from './controllers/payment.controller.js';
import { onlinePaymentEnabled } from './services/payment.service.js';
import { authenticate, authorize, droneKeyAuth } from './middleware/auth.js';
import * as droneCtl from './controllers/drone.controller.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { requestLogger } from './middleware/logger.js';
import { validate } from './middleware/validate.js';
import adminRoutes from './routes/admin.routes.js';
import authRoutes from './routes/auth.routes.js';
import orderRoutes from './routes/order.routes.js';
import { ownerRoutes, publicRestaurants } from './routes/restaurant.routes.js';
import { asyncHandler as h } from './utils/asyncHandler.js';
import { notificationQuerySchema, telemetrySchema } from './validators/schemas.js';
import { couponValidateSchema } from './validators/schemas.js';

export function createApp() {
  const app = express();
  app.use(requestLogger);
  // Allow the client (different origin in dev) to render uploaded images.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  // Stripe signs the exact bytes it sends, so this route must read the raw body and be mounted
  // before the JSON parser.
  app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), h(payment.webhook));
  app.use(express.json({ limit: '100kb' }));
  app.use('/uploads', express.static(path.resolve(env.uploadDir)));

  app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'GoodPanda' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/restaurants', publicRestaurants);
  app.use('/api/owner', ownerRoutes);
  app.get('/api/hubs', h(listActiveHubs));
  // Public, read-only pricing so customers can see an estimate before ordering.
  // Only customer-facing fields: the platform's commission rate is not public.
  app.get(
    '/api/settings/public',
    h(async (_req, res) => {
      const { deliveryFee, mode, perKm, max, announcement } = await getSettings();
      res.json({
        deliveryFee,
        mode,
        perKm,
        max,
        onlinePaymentEnabled: onlinePaymentEnabled(),
        announcement: announcement?.active === false ? null : announcement,
      });
    })
  );
  app.get('/api/drones/available', authenticate, authorize('owner'), h(availableDrones));
  // Coupon preview for the checkout page; the order endpoint revalidates authoritatively.
  app.post(
    '/api/coupons/validate',
    authenticate,
    authorize('customer'),
    validate(couponValidateSchema),
    h(couponCtl.validate)
  );
  // Hardware drones report position/battery here with a shared key instead of a user JWT.
  app.post('/api/drones/:id/telemetry', droneKeyAuth, validate(telemetrySchema), h(droneCtl.telemetry));
  app.use('/api/orders', orderRoutes);
  app.use('/api/admin', adminRoutes);

  app.get('/api/notifications', authenticate, validate(notificationQuerySchema, 'query'), h(nc.list));
  app.get('/api/disputes/mine', authenticate, authorize('customer'), h(disputeCtl.mine));
  app.post('/api/notifications/read-all', authenticate, h(nc.markAllRead));
  app.patch('/api/notifications/:id/read', authenticate, h(nc.markRead));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
