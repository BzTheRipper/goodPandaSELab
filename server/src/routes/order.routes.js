import { Router } from 'express';
import * as oc from '../controllers/order.controller.js';
import * as rv from '../controllers/review.controller.js';
import * as dc from '../controllers/dispute.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { messageLimiter, orderLimiter, pickupLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import {
  cancelRequestSchema,
  cancelResponseSchema,
  checkoutGroupSchema,
  collectSchema,
  confirmationRequestSchema,
  confirmationResponseSchema,
  createOrderSchema,
  disputeSchema,
  loadDroneSchema,
  messageSchema,
  modifyOrderSchema,
  orderQuerySchema,
  reviewSchema,
  statusUpdateSchema,
} from '../validators/schemas.js';

const router = Router();
router.use(authenticate);

router.post('/', authorize('customer'), orderLimiter, validate(createOrderSchema), h(oc.create));
router.post('/group', authorize('customer'), orderLimiter, validate(checkoutGroupSchema), h(oc.createGroup));
router.get('/', validate(orderQuerySchema, 'query'), h(oc.list));
router.get('/:id', h(oc.detail));
router.patch('/:id/status', validate(statusUpdateSchema), h(oc.updateStatus));
router.patch('/:id', authorize('customer'), orderLimiter, validate(modifyOrderSchema), h(oc.modifyOrder));
router.post('/:id/payment-link', authorize('customer'), h(oc.paymentLink));

router.post('/:id/confirmation-request', authorize('owner'), messageLimiter, validate(confirmationRequestSchema), h(oc.requestConfirmation));
router.post('/:id/confirmation-response', authorize('customer'), validate(confirmationResponseSchema), h(oc.respondConfirmation));
router.post('/:id/cancel-request', authorize('customer'), messageLimiter, validate(cancelRequestSchema), h(oc.requestCancellation));
router.post('/:id/cancel-response', authorize('owner'), validate(cancelResponseSchema), h(oc.respondCancellation));

router.get('/:id/messages', h(oc.messages));
router.post('/:id/messages', messageLimiter, validate(messageSchema), h(oc.sendMessage));

router.post('/:id/load-drone', authorize('owner'), validate(loadDroneSchema), h(oc.loadDrone));
router.post('/:id/unload-drone', authorize('owner'), h(oc.unloadDrone));
router.post('/:id/dispatch', authorize('owner'), h(oc.dispatch));
router.post('/:id/review', authorize('customer'), validate(reviewSchema), h(rv.createForOrder));
router.post('/:id/disputes', authorize('customer'), validate(disputeSchema), h(dc.open));
router.get('/:id/disputes', h(dc.forOrder));
router.post('/:id/collect', authorize('admin', 'hub_operator'), pickupLimiter, validate(collectSchema), h(oc.collect));
router.post('/:id/no-show', authorize('admin', 'hub_operator'), h(oc.reportNoShow));
router.get('/:id/receipt', h(oc.receipt));
router.post('/:id/receipt/email', authorize('customer'), h(oc.sendReceipt));

export default router;
