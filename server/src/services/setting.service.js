import { env } from '../config/env.js';
import { Setting } from '../models/index.js';

const DELIVERY_FEE = 'deliveryFee';

export async function getDeliveryFee() {
  const s = await Setting.findOne({ key: DELIVERY_FEE });
  return s ? Number(s.value) : env.defaultDeliveryFee;
}

export async function getSettings() {
  return { deliveryFee: await getDeliveryFee() };
}

export async function updateSettings({ deliveryFee }) {
  await Setting.findOneAndUpdate({ key: DELIVERY_FEE }, { value: deliveryFee }, { upsert: true });
  return getSettings();
}
