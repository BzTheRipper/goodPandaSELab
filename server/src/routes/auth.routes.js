import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import * as auth from '../controllers/auth.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { loginSchema, passwordChangeSchema, profileSchema, registerSchema } from '../validators/schemas.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.nodeEnv === 'test' ? 10_000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts, please try again later', code: 'RATE_LIMITED' } },
});

router.post('/register', authLimiter, validate(registerSchema), h(auth.register));
router.post('/login', authLimiter, validate(loginSchema), h(auth.login));
router.post('/logout', authenticate, auth.logout);
router.get('/me', authenticate, auth.me);
router.patch('/me', authenticate, validate(profileSchema), h(auth.updateMe));
router.post('/me/password', authLimiter, authenticate, validate(passwordChangeSchema), h(auth.changePassword));
router.put('/me/avatar', authenticate, upload.single('avatar'), h(auth.setAvatar));
router.delete('/me/avatar', authenticate, h(auth.removeAvatar));

router.get('/me/favorites', authenticate, authorize('customer'), h(auth.listFavorites));
router.put('/me/favorites/:id', authenticate, authorize('customer'), h(auth.addFavorite));
router.delete('/me/favorites/:id', authenticate, authorize('customer'), h(auth.removeFavorite));

export default router;
