import { Router } from 'express';
import * as ac from '../controllers/admin.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import {
  droneSchema,
  droneUpdateSchema,
  hubSchema,
  hubUpdateSchema,
  restaurantStatusSchema,
  settingsSchema,
  userActiveSchema,
} from '../validators/schemas.js';

const router = Router();
router.use(authenticate, authorize('admin'));

router.get('/dashboard', h(ac.dashboard));

router.get('/restaurants', h(ac.listRestaurants));
router.patch('/restaurants/:id/status', validate(restaurantStatusSchema), h(ac.setRestaurantStatus));

router.get('/users', h(ac.listUsers));
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

router.get('/settings', h(ac.getSettings));
router.put('/settings', validate(settingsSchema), h(ac.updateSettings));

export default router;
