import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { authLimiter, uploadLimiter } from '../middleware/rateLimit.js';
import { upload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import {
  forgotPasswordSchema,
  loginSchema,
  notificationPrefsSchema,
  passwordChangeSchema,
  profileSchema,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validators/schemas.js';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), h(auth.register));
router.post('/login', authLimiter, validate(loginSchema), h(auth.login));
router.post('/logout', authenticate, auth.logout);
// "Forgot password": request an emailed link, then set a new password with it.
router.post('/password/forgot', authLimiter, validate(forgotPasswordSchema), h(auth.forgotPassword));
router.post('/password/reset', authLimiter, validate(resetPasswordSchema), h(auth.resetPassword));
router.get('/push/config', h(auth.pushConfig));
router.post('/me/push', authenticate, validate(pushSubscriptionSchema), h(auth.pushSubscribe));
router.delete('/me/push', authenticate, validate(pushUnsubscribeSchema), h(auth.pushUnsubscribe));

router.get('/me', authenticate, auth.me);
router.patch('/me', authenticate, validate(profileSchema), h(auth.updateMe));
router.patch('/me/notifications', authenticate, validate(notificationPrefsSchema), h(auth.updateNotifications));
router.post('/me/password', authLimiter, authenticate, validate(passwordChangeSchema), h(auth.changePassword));
router.put('/me/avatar', authenticate, uploadLimiter, upload.single('avatar'), h(auth.setAvatar));
router.delete('/me/avatar', authenticate, h(auth.removeAvatar));
router.get('/me/export', authenticate, h(auth.exportData));
router.get('/me/referrals', authenticate, authorize('customer'), h(auth.referrals));
router.delete('/me', authenticate, h(auth.deleteAccount));

router.get('/me/favorites', authenticate, authorize('customer'), h(auth.listFavorites));
router.put('/me/favorites/:id', authenticate, authorize('customer'), h(auth.addFavorite));
router.delete('/me/favorites/:id', authenticate, authorize('customer'), h(auth.removeFavorite));

export default router;
