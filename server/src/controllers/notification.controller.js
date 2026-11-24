import * as notifications from '../services/notification.service.js';

export const list = async (req, res) => res.json(await notifications.listForUser(req.user._id, req.validQuery));
export const markRead = async (req, res) => res.json(await notifications.markRead(req.user._id, req.params.id));
export const markAllRead = async (req, res) => {
  await notifications.markAllRead(req.user._id);
  res.status(204).end();
};
