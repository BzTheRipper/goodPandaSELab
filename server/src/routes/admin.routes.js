import { Router } from 'express';
import * as ac from '../controllers/admin.controller.js';
import * as cc from '../controllers/coupon.controller.js';
import * as dc from '../controllers/dispute.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import {
  auditQuerySchema,
  campaignPreviewSchema,
  campaignSchema,
  couponSchema,
  couponUpdateSchema,
  disputeQuerySchema,
  disputeResolveSchema,
  documentVerifySchema,
  droneSchema,
  droneUpdateSchema,
  hubOperatorSchema,
  hubSchema,
  hubUpdateSchema,
  payoutQuerySchema,
  restaurantStatusSchema,
  settingsSchema,
  userActiveSchema,
} from '../validators/schemas.js';

const router = Router();
router.use(authenticate, authorize('admin'));

router.get('/dashboard', h(ac.dashboard));

router.get('/restaurants', h(ac.listRestaurants));
router.patch('/restaurants/:id/status', validate(restaurantStatusSchema), h(ac.setRestaurantStatus));
router.patch('/restaurants/:id/documents/:docId', validate(documentVerifySchema), h(ac.verifyDocument));

router.get('/users', h(ac.listUsers));
router.post('/users/hub-operator', validate(hubOperatorSchema), h(ac.createHubOperator));
router.patch('/users/:id/active', validate(userActiveSchema), h(ac.setUserActive));

router.get('/hubs', h(ac.listHubs));
router.post('/hubs', validate(hubSchema), h(ac.createHub));
router.patch('/hubs/:id', validate(hubUpdateSchema), h(ac.updateHub));
router.delete('/hubs/:id', h(ac.deleteHub));

router.get('/drones', h(ac.listDrones));
router.post('/drones', validate(droneSchema), h(ac.createDrone));
router.patch('/drones/:id', validate(droneUpdateSchema), h(ac.updateDrone));
router.delete('/drones/:id', h(ac.deleteDrone));
router.post('/drones/:id/fail', h(ac.failDrone));
router.get('/drones/health', h(ac.fleetHealth));

router.get('/settings', h(ac.getSettings));
router.put('/settings', validate(settingsSchema), h(ac.updateSettings));

router.get('/payouts', validate(payoutQuerySchema, 'query'), h(ac.listPayouts));
router.patch('/payouts/:id/paid', h(ac.markPayoutPaid));

router.get('/audit-logs', validate(auditQuerySchema, 'query'), h(ac.auditLogs));

router.get('/campaigns', h(ac.listCampaigns));
router.post('/campaigns/preview', validate(campaignPreviewSchema), h(ac.previewCampaign));
router.post('/campaigns', validate(campaignSchema), h(ac.sendCampaign));

router.get('/coupons', h(cc.list));
router.post('/coupons', validate(couponSchema), h(cc.create));
router.patch('/coupons/:id', validate(couponUpdateSchema), h(cc.update));

router.get('/disputes', validate(disputeQuerySchema, 'query'), h(dc.list));
router.patch('/disputes/:id', validate(disputeResolveSchema), h(dc.resolve));

export default router;
