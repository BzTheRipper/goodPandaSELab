import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { forbidden, unauthorized } from '../utils/errors.js';

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

// Resolves a token to an active user, or throws. Shared by HTTP and socket auth.
export async function userFromToken(token) {
  if (!token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw unauthorized('Invalid or expired token');
  }
  const user = await User.findById(payload.sub);
  if (!user) throw unauthorized('User no longer exists');
  if (!user.isActive) throw forbidden('Account is deactivated');
  // After a password reset, logins from before it (on any device) are no longer accepted.
  // `iat` is in whole seconds, so a token issued in the same second as the reset still works.
  if (user.passwordChangedAt && payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
    throw unauthorized('Your password was changed. Please log in again.');
  }
  return user;
}

export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    req.user = await userFromToken(token);
    next();
  } catch (err) {
    next(err);
  }
}

export const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

/** Attaches req.user when a valid token is present, but lets anonymous callers through. */
export async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    req.user = await userFromToken(token);
  } catch {
    // A bad token is treated as "guest" for public endpoints, never as an error.
  }
  next();
}

/** Hardware drones authenticate with a shared key, not a user JWT. */
export function droneKeyAuth(req, _res, next) {
  if (!env.drone.ingestKey) return next(forbidden('Drone telemetry is not configured'));
  if (req.headers['x-drone-key'] !== env.drone.ingestKey) return next(unauthorized('Invalid drone key'));
  next();
}
