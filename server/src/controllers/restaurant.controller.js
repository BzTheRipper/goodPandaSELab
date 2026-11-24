import * as restaurantService from '../services/restaurant.service.js';
import * as menuService from '../services/menu.service.js';

// ---- public ----
export async function list(req, res) {
  res.json(await restaurantService.listPublic(req.validQuery));
}

export async function detail(req, res) {
  res.json(await restaurantService.getPublic(req.params.id));
}

export async function recommended(req, res) {
  res.json(await restaurantService.recommended(req.user, req.validQuery));
}

// ---- owner: restaurant ----
export async function getMine(req, res) {
  res.json(await restaurantService.findOwned(req.user._id));
}

export async function createMine(req, res) {
  res.status(201).json(await restaurantService.createOwned(req.user._id, req.body, req.files));
}

export async function updateMine(req, res) {
  res.json(await restaurantService.updateOwned(req.user._id, req.body, req.files));
}

export async function insights(req, res) {
  res.json(await restaurantService.insights(req.user._id));
}

export async function earnings(req, res) {
  res.json(await restaurantService.earningsReport(req.user._id));
}

export async function setOpen(req, res) {
  res.json(await restaurantService.setOpen(req.user._id, req.body.isOpen));
}

// ---- owner: compliance documents ----
export async function addDocument(req, res) {
  res.status(201).json(await restaurantService.addDocument(req.user._id, req.body, req.file));
}

export async function removeDocument(req, res) {
  res.json(await restaurantService.removeDocument(req.user._id, req.params.docId));
}

// ---- owner: menu ----
export async function listMenu(req, res) {
  res.json(await menuService.listOwned(req.user._id));
}

export async function createItem(req, res) {
  res.status(201).json(await menuService.create(req.user._id, req.body, req.file));
}

export async function updateItem(req, res) {
  res.json(await menuService.update(req.user._id, req.params.id, req.body, req.file));
}

export async function setAvailability(req, res) {
  res.json(await menuService.setAvailability(req.user._id, req.params.id, req.body.isAvailable));
}

export async function removeItem(req, res) {
  await menuService.remove(req.user._id, req.params.id);
  res.status(204).end();
}
