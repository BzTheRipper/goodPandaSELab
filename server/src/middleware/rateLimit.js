import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const skip = () => env.nodeEnv === 'test';

/** Shared JSON shape for every limiter, matching the app's error envelope. */
const reply = (message) => ({ error: { message, code: 'RATE_LIMITED' } });

const make = (windowMs, limit, message) =>
  rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, message: reply(message), skip });

/** Sign-in and registration: guards against credential stuffing. */
export const authLimiter = make(15 * 60 * 1000, 30, 'Too many attempts, please try again later');

/** Order placement: a real shopper never places dozens of orders a minute. */
export const orderLimiter = make(60 * 1000, 20, 'You’re placing orders too quickly. Wait a moment and try again.');

/** Chat and notes: keeps a single order from flooding the restaurant. */
export const messageLimiter = make(60 * 1000, 40, 'You’re sending messages too quickly. Slow down a little.');

/** Uploads are the most expensive request; a generous but finite budget per IP. */
export const uploadLimiter = make(10 * 60 * 1000, 40, 'Too many uploads. Please try again in a few minutes.');

/** Pickup-code verification: a 6-digit code is brute-forceable without a cap. */
export const pickupLimiter = make(10 * 60 * 1000, 20, 'Too many code attempts. Ask a supervisor to review this pickup.');
