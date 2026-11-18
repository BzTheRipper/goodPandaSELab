import * as orderService from '../services/order.service.js';
import * as delivery from '../services/delivery.service.js';

const out = (req, order) => orderService.serialize(order, req.user.role);

export async function create(req, res) {
  res.status(201).json(out(req, await orderService.createOrder(req.user, req.body)));
}

export async function list(req, res) {
  const orders = await orderService.listForUser(req.user, req.validQuery);
  res.json(orders.map((o) => out(req, o)));
}

export async function detail(req, res) {
  res.json(out(req, await orderService.getForUser(req.user, req.params.id)));
}

export async function updateStatus(req, res) {
  await orderService.updateStatus(req.user, req.params.id, req.body);
  res.json(out(req, await orderService.loadOrder(req.params.id)));
}

export async function requestConfirmation(req, res) {
  await orderService.requestConfirmation(req.user, req.params.id, req.body);
  res.json(out(req, await orderService.loadOrder(req.params.id)));
}

export async function respondConfirmation(req, res) {
  await orderService.respondConfirmation(req.user, req.params.id, req.body);
  res.json(out(req, await orderService.loadOrder(req.params.id)));
}

export async function messages(req, res) {
  res.json(await orderService.listMessages(req.user, req.params.id));
}

export async function sendMessage(req, res) {
  res.status(201).json(await orderService.sendMessage(req.user, req.params.id, req.body));
}

export async function availableDrones(_req, res) {
  res.json(await delivery.listAvailableDrones());
}

export async function loadDrone(req, res) {
  res.json(out(req, await delivery.loadDrone(req.user, req.params.id, req.body.droneId)));
}

export async function unloadDrone(req, res) {
  res.json(out(req, await delivery.unloadDrone(req.user, req.params.id)));
}

export async function dispatch(req, res) {
  res.json(out(req, await delivery.dispatch(req.user, req.params.id)));
}

export async function collect(req, res) {
  await delivery.collect(req.user, req.params.id, req.body);
  res.json(out(req, await orderService.loadOrder(req.params.id)));
}
