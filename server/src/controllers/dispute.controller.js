import * as disputes from '../services/dispute.service.js';

export async function open(req, res) {
  res.status(201).json(await disputes.openDispute(req.user, req.params.id, req.body));
}

export async function forOrder(req, res) {
  res.json(await disputes.listForOrder(req.params.id));
}

export const mine = async (req, res) => res.json(await disputes.listMine(req.user._id));

// ---- admin ----
export const list = async (req, res) => res.json(await disputes.listAll(req.validQuery));
export const resolve = async (req, res) => res.json(await disputes.resolveDispute(req.user, req.params.id, req.body));
