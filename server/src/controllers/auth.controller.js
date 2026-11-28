import * as authService from '../services/auth.service.js';
import { referralsFor } from '../services/referral.service.js';
import { pushEnabled, subscribe, unsubscribe, vapidPublicKey } from '../services/push.service.js';

export const pushConfig = (_req, res) => res.json({ enabled: pushEnabled(), publicKey: vapidPublicKey() });
export const pushSubscribe = async (req, res) => res.status(201).json(await subscribe(req.user._id, req.body));
export const pushUnsubscribe = async (req, res) => {
  await unsubscribe(req.user._id, req.body.endpoint);
  res.status(204).end();
};

export async function register(req, res) {
  res.status(201).json(await authService.register(req.body));
}

export async function login(req, res) {
  res.json(await authService.login(req.body));
}

export function me(req, res) {
  res.json({ user: req.user });
}

export async function updateMe(req, res) {
  res.json({ user: await authService.updateProfile(req.user, req.body) });
}

export async function updateNotifications(req, res) {
  res.json({ user: await authService.updateNotificationPrefs(req.user, req.body) });
}

// JWTs are stateless: logout is handled client-side by discarding the token.
export function logout(_req, res) {
  res.status(204).end();
}

export async function changePassword(req, res) {
  await authService.changePassword(req.user, req.body);
  res.status(204).end();
}

// Same answer whether or not the email has an account, so it can't be used to find users.
export async function forgotPassword(req, res) {
  await authService.requestPasswordReset(req.body.email);
  res.json({ ok: true, message: 'If an account exists for that email, we’ve sent a link to reset the password.' });
}

export async function resetPassword(req, res) {
  await authService.resetPassword(req.body);
  res.json({ ok: true, message: 'Your password has been reset. Please log in with your new password.' });
}

export async function setAvatar(req, res) {
  res.json({ user: await authService.setAvatar(req.user, req.file) });
}

export async function removeAvatar(req, res) {
  res.json({ user: await authService.removeAvatar(req.user) });
}

export const listFavorites = async (req, res) => res.json(await authService.listFavorites(req.user));
export const addFavorite = async (req, res) => res.json({ favorites: await authService.addFavorite(req.user, req.params.id) });
export const removeFavorite = async (req, res) => res.json({ favorites: await authService.removeFavorite(req.user, req.params.id) });

export async function exportData(req, res) {
  res.setHeader('Content-Disposition', 'attachment; filename="goodpanda-export.json"');
  res.json(await authService.exportData(req.user));
}

export async function deleteAccount(req, res) {
  await authService.deleteAccount(req.user);
  res.status(204).end();
}

export async function referrals(req, res) {
  res.json(await referralsFor(req.user));
}
