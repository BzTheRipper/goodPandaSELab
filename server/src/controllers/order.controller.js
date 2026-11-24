import * as orderService from '../services/order.service.js';
import * as delivery from '../services/delivery.service.js';
import { emailReceipt } from '../services/email.service.js';

const out = (req, order) => orderService.serialize(order, req.user.role);

export async function create(req, res) {
  res.status(201).json(out(req, await orderService.createOrder(req.user, req.body)));
}

export async function createGroup(req, res) {
  const { checkoutGroup, orders } = await orderService.createCheckoutGroup(req.user, req.body);
  res.status(201).json({ checkoutGroup, orders: orders.map((o) => out(req, o)) });
}

export async function list(req, res) {
  const result = await orderService.listForUser(req.user, req.validQuery);
  res.json({ ...result, items: result.items.map((o) => out(req, o)) });
}

export async function detail(req, res) {
  res.json(out(req, await orderService.getForUser(req.user, req.params.id)));
}

export async function paymentLink(req, res) {
  res.json(await orderService.paymentLink(req.user, req.params.id));
}

export async function reportNoShow(req, res) {
  res.json(out(req, await orderService.reportNoShow(req.user, req.params.id)));
}

/** Resends the receipt email to the order's customer. */
export async function sendReceipt(req, res) {  const order = await orderService.getForUser(req.user, req.params.id);
  if (req.user.role !== 'customer' || orderService.customerIdOf(order) !== String(req.user._id)) {
    res.status(403).json({ error: { message: 'Only the customer can email this receipt', code: 'FORBIDDEN' } });
    return;
  }
  const result = await emailReceipt(order);
  res.status(result.sent ? 202 : 200).json(result);
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

export async function requestCancellation(req, res) {
  await orderService.requestCancellation(req.user, req.params.id, req.body);
  res.json(out(req, await orderService.loadOrder(req.params.id)));
}

export async function respondCancellation(req, res) {
  await orderService.respondCancellation(req.user, req.params.id, req.body);
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

export async function receipt(req, res) {
  res.json(await orderService.getReceipt(req.user, req.params.id));
}

export async function modifyOrder(req, res) {
  res.json(out(req, await orderService.modifyOrder(req.user, req.params.id, req.body)));
}
