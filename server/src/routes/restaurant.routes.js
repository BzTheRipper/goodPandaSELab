import { Router } from 'express';
import * as rc from '../controllers/restaurant.controller.js';
import * as rv from '../controllers/review.controller.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { upload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import {
  availabilitySchema,
  documentSchema,
  menuItemSchema,
  menuItemUpdateSchema,
  openStatusSchema,
  recommendedQuerySchema,
  restaurantQuerySchema,
  restaurantSchema,
  restaurantUpdateSchema,
  reviewReplySchema,
} from '../validators/schemas.js';

export const publicRestaurants = Router();
publicRestaurants.get('/', validate(restaurantQuerySchema, 'query'), h(rc.list));
publicRestaurants.get('/recommended', optionalAuth, validate(recommendedQuerySchema, 'query'), h(rc.recommended));
publicRestaurants.get('/:id', h(rc.detail));
publicRestaurants.get('/:id/reviews', h(rv.listForRestaurant));

export const ownerRoutes = Router();
ownerRoutes.use(authenticate, authorize('owner'));

const images = upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
]);
ownerRoutes.get('/restaurant', h(rc.getMine));
ownerRoutes.post('/restaurant', uploadLimiter, images, validate(restaurantSchema), h(rc.createMine));
ownerRoutes.patch('/restaurant', uploadLimiter, images, validate(restaurantUpdateSchema), h(rc.updateMine));
ownerRoutes.patch('/restaurant/open', validate(openStatusSchema), h(rc.setOpen));
ownerRoutes.post('/restaurant/documents', uploadLimiter, upload.single('document'), validate(documentSchema), h(rc.addDocument));
ownerRoutes.delete('/restaurant/documents/:docId', h(rc.removeDocument));

ownerRoutes.get('/menu', h(rc.listMenu));
ownerRoutes.post('/menu', uploadLimiter, upload.single('image'), validate(menuItemSchema), h(rc.createItem));
ownerRoutes.patch('/menu/:id', uploadLimiter, upload.single('image'), validate(menuItemUpdateSchema), h(rc.updateItem));
ownerRoutes.patch('/menu/:id/availability', validate(availabilitySchema), h(rc.setAvailability));
ownerRoutes.delete('/menu/:id', h(rc.removeItem));

ownerRoutes.get('/insights', h(rc.insights));
ownerRoutes.get('/earnings', h(rc.earnings));
ownerRoutes.get('/reviews', h(rv.listOwned));
ownerRoutes.post('/reviews/:id/reply', validate(reviewReplySchema), h(rv.reply));

export default ownerRoutes;
