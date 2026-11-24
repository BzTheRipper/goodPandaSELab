import * as admin from '../services/admin.service.js';
import * as campaigns from '../services/campaign.service.js';
import { listAuditLogs } from '../services/audit.service.js';
import * as restaurantService from '../services/restaurant.service.js';
import * as settings from '../services/setting.service.js';
import { markDroneFailed } from '../services/delivery.service.js';

export const dashboard = async (_req, res) => res.json(await admin.dashboard());

export const listRestaurants = async (req, res) => res.json(await restaurantService.listAll(req.query.status));
export const setRestaurantStatus = async (req, res) =>
  res.json(await restaurantService.setStatus(req.params.id, req.body.status, req.user));
export const verifyDocument = async (req, res) =>
  res.json(await restaurantService.verifyDocument(req.params.id, req.params.docId, req.body, req.user));

export const listUsers = async (req, res) => res.json(await admin.listUsers(req.query.role));
export const createHubOperator = async (req, res) => res.status(201).json(await admin.createHubOperator(req.body, req.user));
export const setUserActive = async (req, res) => res.json(await admin.setUserActive(req.user, req.params.id, req.body.isActive));

export const listHubs = async (_req, res) => res.json(await admin.listHubs(false));
export const listActiveHubs = async (_req, res) => res.json(await admin.listHubs(true));
export const createHub = async (req, res) => res.status(201).json(await admin.createHub(req.body, req.user));
export const updateHub = async (req, res) => res.json(await admin.updateHub(req.params.id, req.body, req.user));
export const deleteHub = async (req, res) => {
  await admin.deleteHub(req.params.id, req.user);
  res.status(204).end();
};

export const listDrones = async (_req, res) => res.json(await admin.listDrones());
export const listCampaigns = async (_req, res) => res.json(await campaigns.listCampaigns());
export const previewCampaign = async (req, res) => res.json(await campaigns.previewCampaign(req.body.segment));
export const sendCampaign = async (req, res) => res.status(201).json(await campaigns.sendCampaign(req.body, req.user));export const createDrone = async (req, res) => res.status(201).json(await admin.createDrone(req.body, req.user));
export const updateDrone = async (req, res) => res.json(await admin.updateDrone(req.params.id, req.body, req.user));
export const deleteDrone = async (req, res) => {
  await admin.deleteDrone(req.params.id, req.user);
  res.status(204).end();
};
export const failDrone = async (req, res) => {
  const drone = await markDroneFailed(req.params.id, req.user);
  res.json(drone);
};
export const fleetHealth = async (_req, res) => res.json(await admin.fleetHealth());

export const getSettings = async (_req, res) => res.json(await settings.getSettings());
export const updateSettings = async (req, res) => res.json(await settings.updateSettings(req.body, req.user));

export const auditLogs = async (req, res) => res.json(await listAuditLogs(req.validQuery));

// ---- payouts ----
export const listPayouts = async (req, res) => res.json(await admin.listPayouts(req.validQuery));
export const markPayoutPaid = async (req, res) => res.json(await admin.markPayoutPaid(req.params.id, req.user));
