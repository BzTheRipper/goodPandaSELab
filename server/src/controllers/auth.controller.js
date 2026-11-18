import * as authService from '../services/auth.service.js';

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

// JWTs are stateless: logout is handled client-side by discarding the token.
export function logout(_req, res) {
  res.status(204).end();
}

export async function changePassword(req, res) {
  await authService.changePassword(req.user, req.body);
  res.status(204).end();
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
