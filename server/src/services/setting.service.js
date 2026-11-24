import { env } from '../config/env.js';
import { Setting } from '../models/index.js';
import { audit } from './audit.service.js';

const DELIVERY_FEE = 'deliveryFee';
const FEE_MODE = 'feeMode';
const FEE_PER_KM = 'feePerKm';
const FEE_MAX = 'feeMax';
const MAX_DELIVERY_DISTANCE = 'maxDeliveryDistanceKm';
const PLATFORM_COMMISSION_PERCENT = 'platformCommissionPercent';
const ANNOUNCEMENT = 'announcement';

const settingValue = async (key, fallback) => {
  const s = await Setting.findOne({ key });
  return s ? Number(s.value) : fallback;
};

/** The flat component; in distance mode it acts as the base fee. */
export async function getDeliveryFee() {
  return settingValue(DELIVERY_FEE, env.defaultDeliveryFee);
}

export async function getFeeConfig() {
  const [deliveryFee, modeRaw, perKm, max, maxDistanceRaw, commissionRaw] = await Promise.all([
    getDeliveryFee(),
    Setting.findOne({ key: FEE_MODE }),
    settingValue(FEE_PER_KM, env.fee.perKm),
    settingValue(FEE_MAX, env.fee.max),
    settingValue(MAX_DELIVERY_DISTANCE, env.delivery.maxDistanceKm),
    settingValue(PLATFORM_COMMISSION_PERCENT, env.commission.percent),
  ]);
  const mode = modeRaw ? String(modeRaw.value) : env.fee.mode;
  return {
    deliveryFee,
    mode: mode === 'distance' ? 'distance' : 'flat',
    perKm,
    max,
    maxDeliveryDistanceKm: maxDistanceRaw,
    platformCommissionPercent: commissionRaw,
  };
}

/**
 * Prices a delivery. Flat mode returns the admin-set fee; distance mode adds a per-km
 * component on the restaurant → hub distance, capped at `max`.
 */
export function priceDeliveryFee(config, distanceKm) {
  if (config.mode !== 'distance' || !(distanceKm > 0)) {
    return { fee: Math.round(config.deliveryFee * 100) / 100, distanceKm: distanceKm ?? null };
  }
  const raw = config.deliveryFee + distanceKm * config.perKm;
  return { fee: Math.round(Math.min(raw, config.max) * 100) / 100, distanceKm: Math.round(distanceKm * 100) / 100 };
}

export async function getSettings() {
  const [fee, announcement] = await Promise.all([getFeeConfig(), getAnnouncement()]);
  return { ...fee, announcement };
}

/** Platform-wide banner shown in the app shell. Returns null when there is nothing to say. */
export async function getAnnouncement() {
  const setting = await Setting.findOne({ key: ANNOUNCEMENT });
  const value = setting?.value;
  if (!value || !String(value.message || '').trim()) return null;
  return {
    message: String(value.message),
    tone: ['info', 'warning', 'danger'].includes(value.tone) ? value.tone : 'info',
    active: value.active !== false,
  };
}

export async function updateSettings(
  { deliveryFee, mode, perKm, max, maxDeliveryDistanceKm, platformCommissionPercent, announcement },
  actor
) {
  const previous = await getFeeConfig();
  const next = {
    deliveryFee: deliveryFee ?? previous.deliveryFee,
    mode: mode ?? previous.mode,
    perKm: perKm ?? previous.perKm,
    max: max ?? previous.max,
    maxDeliveryDistanceKm: maxDeliveryDistanceKm ?? previous.maxDeliveryDistanceKm,
    platformCommissionPercent: platformCommissionPercent ?? previous.platformCommissionPercent,
  };
  await Promise.all([
    Setting.findOneAndUpdate({ key: DELIVERY_FEE }, { value: next.deliveryFee }, { upsert: true }),
    Setting.findOneAndUpdate({ key: FEE_MODE }, { value: next.mode }, { upsert: true }),
    Setting.findOneAndUpdate({ key: FEE_PER_KM }, { value: next.perKm }, { upsert: true }),
    Setting.findOneAndUpdate({ key: FEE_MAX }, { value: next.max }, { upsert: true }),
    Setting.findOneAndUpdate({ key: MAX_DELIVERY_DISTANCE }, { value: next.maxDeliveryDistanceKm }, { upsert: true }),
    Setting.findOneAndUpdate({ key: PLATFORM_COMMISSION_PERCENT }, { value: next.platformCommissionPercent }, { upsert: true }),
    // An empty message clears the banner entirely.
    announcement !== undefined
      ? Setting.findOneAndUpdate(
          { key: ANNOUNCEMENT },
          { value: announcement?.message ? announcement : null },
          { upsert: true }
        )
      : Promise.resolve(),
  ]);
  const changed = JSON.stringify(previous) !== JSON.stringify(next);
  if (actor && (changed || announcement !== undefined)) {
    await audit({
      actor,
      action: 'SETTINGS_UPDATED',
      targetType: 'setting',
      summary: `Fee ${previous.mode} ৳${previous.deliveryFee} → ${next.mode} ৳${next.deliveryFee} + ৳${next.perKm}/km (max ৳${next.max})${next.maxDeliveryDistanceKm != null ? `, max delivery ${next.maxDeliveryDistanceKm} km` : ''}, commission ${next.platformCommissionPercent}%${announcement !== undefined ? `, banner ${announcement?.active === false ? 'hidden' : announcement?.message ? 'updated' : 'cleared'}` : ''}`,
      metadata: { previous, next, ...(announcement !== undefined && { announcement }) },
    });
  }
  return getSettings();
}
