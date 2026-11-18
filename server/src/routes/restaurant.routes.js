import { Router } from 'express';
import * as rc from '../controllers/restaurant.controller.js';
import * as rv from '../controllers/review.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import {
  availabilitySchema,
  menuItemSchema,
  menuItemUpdateSchema,
  openStatusSchema,
  restaurantQuerySchema,
  restaurantSchema,
  restaurantUpdateSchema,
  reviewReplySchema,
} from '../validators/schemas.js';

export const publicRestaurants = Router();
publicRestaurants.get('/', validate(restaurantQuerySchema, 'query'), h(rc.list));
publicRestaurants.get('/:id', h(rc.detail));
publicRestaurants.get('/:id/reviews', h(rv.listForRestaurant));

export const ownerRoutes = Router();
ownerRoutes.use(authenticate, authorize('owner'));

const images = upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
]);
ownerRoutes.get('/restaurant', h(rc.getMine));
ownerRoutes.post('/restaurant', images, validate(restaurantSchema), h(rc.createMine));
ownerRoutes.patch('/restaurant', images, validate(restaurantUpdateSchema), h(rc.updateMine));
ownerRoutes.patch('/restaurant/open', validate(openStatusSchema), h(rc.setOpen));

ownerRoutes.get('/menu', h(rc.listMenu));
ownerRoutes.post('/menu', upload.single('image'), validate(menuItemSchema), h(rc.createItem));
ownerRoutes.patch('/menu/:id', upload.single('image'), validate(menuItemUpdateSchema), h(rc.updateItem));
ownerRoutes.patch('/menu/:id/availability', validate(availabilitySchema), h(rc.setAvailability));
ownerRoutes.delete('/menu/:id', h(rc.removeItem));

ownerRoutes.get('/insights', h(rc.insights));
ownerRoutes.get('/reviews', h(rv.listOwned));
ownerRoutes.post('/reviews/:id/reply', validate(reviewReplySchema), h(rv.reply));
