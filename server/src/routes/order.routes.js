import { Router } from 'express';
import * as oc from '../controllers/order.controller.js';
import * as rv from '../controllers/review.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import {
  collectSchema,
  confirmationRequestSchema,
  confirmationResponseSchema,
  createOrderSchema,
  loadDroneSchema,
  messageSchema,
  orderQuerySchema,
  reviewSchema,
  statusUpdateSchema,
} from '../validators/schemas.js';

const router = Router();
router.use(authenticate);

router.post('/', authorize('customer'), validate(createOrderSchema), h(oc.create));
router.get('/', validate(orderQuerySchema, 'query'), h(oc.list));
router.get('/:id', h(oc.detail));
router.patch('/:id/status', validate(statusUpdateSchema), h(oc.updateStatus));

router.post('/:id/confirmation-request', authorize('owner'), validate(confirmationRequestSchema), h(oc.requestConfirmation));
router.post('/:id/confirmation-response', authorize('customer'), validate(confirmationResponseSchema), h(oc.respondConfirmation));

router.get('/:id/messages', h(oc.messages));
router.post('/:id/messages', validate(messageSchema), h(oc.sendMessage));

router.post('/:id/load-drone', authorize('owner'), validate(loadDroneSchema), h(oc.loadDrone));
router.post('/:id/unload-drone', authorize('owner'), h(oc.unloadDrone));
router.post('/:id/dispatch', authorize('owner'), h(oc.dispatch));
router.post('/:id/review', authorize('customer'), validate(reviewSchema), h(rv.createForOrder));
router.post('/:id/collect', authorize('admin'), validate(collectSchema), h(oc.collect));

export default router;
