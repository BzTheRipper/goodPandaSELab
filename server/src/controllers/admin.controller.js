import * as admin from '../services/admin.service.js';
import * as restaurantService from '../services/restaurant.service.js';
import * as settings from '../services/setting.service.js';
import { markDroneFailed } from '../services/delivery.service.js';

export const dashboard = async (_req, res) => res.json(await admin.dashboard());

export const listRestaurants = async (req, res) => res.json(await restaurantService.listAll(req.query.status));
export const setRestaurantStatus = async (req, res) =>
  res.json(await restaurantService.setStatus(req.params.id, req.body.status));

export const listUsers = async (req, res) => res.json(await admin.listUsers(req.query.role));
export const setUserActive = async (req, res) => res.json(await admin.setUserActive(req.user, req.params.id, req.body.isActive));

export const listHubs = async (_req, res) => res.json(await admin.listHubs(false));
export const listActiveHubs = async (_req, res) => res.json(await admin.listHubs(true));
export const createHub = async (req, res) => res.status(201).json(await admin.createHub(req.body));
export const updateHub = async (req, res) => res.json(await admin.updateHub(req.params.id, req.body));
export const deleteHub = async (req, res) => {
  await admin.deleteHub(req.params.id);
  res.status(204).end();
};

export const listDrones = async (_req, res) => res.json(await admin.listDrones());
export const createDrone = async (req, res) => res.status(201).json(await admin.createDrone(req.body));
export const updateDrone = async (req, res) => res.json(await admin.updateDrone(req.params.id, req.body));
export const deleteDrone = async (req, res) => {
  await admin.deleteDrone(req.params.id);
  res.status(204).end();
};
export const failDrone = async (req, res) => res.json(await markDroneFailed(req.params.id));

export const getSettings = async (_req, res) => res.json(await settings.getSettings());
export const updateSettings = async (req, res) => res.json(await settings.updateSettings(req.body));
