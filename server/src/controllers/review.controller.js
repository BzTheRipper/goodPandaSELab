import * as reviews from '../services/review.service.js';

export const createForOrder = async (req, res) => res.status(201).json(await reviews.createForOrder(req.user, req.params.id, req.body));
export const listForRestaurant = async (req, res) => res.json(await reviews.listForRestaurant(req.params.id));
export const listOwned = async (req, res) => res.json(await reviews.listOwned(req.user._id));
export const reply = async (req, res) => res.json(await reviews.reply(req.user._id, req.params.id, req.body.text));
