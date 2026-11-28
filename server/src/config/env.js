import dotenv from 'dotenv';

dotenv.config();

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 5000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/goodpanda',
  jwtSecret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? undefined : 'dev-only-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  // Tests never hit the real image host.
  imgbbApiKey: process.env.NODE_ENV === 'test' ? '' : process.env.IMGBB_API_KEY || '',
  drone: {
    tickMs: num(process.env.DRONE_TICK_MS, 1000),
    speedMps: num(process.env.DRONE_SPEED_MPS, 60),
    batteryPerKm: num(process.env.DRONE_BATTERY_PER_KM, 2),
    minBattery: num(process.env.DRONE_MIN_BATTERY, 20),
    // Battery kept in reserve on top of the trip estimate.
    batteryReserve: num(process.env.DRONE_BATTERY_RESERVE, 5),
    // Fly the empty drone back to the restaurant after a drop-off so the fleet self-balances.
    returnToBase: process.env.DRONE_RETURN_TO_BASE !== 'false',
    chargingTickMs: num(process.env.DRONE_CHARGING_TICK_MS, 2000),
    chargePercentPerTick: num(process.env.DRONE_CHARGE_PERCENT_PER_TICK, 10),
    // Charge at which a docked drone counts as ready for the next delivery.
    readyCharge: num(process.env.DRONE_READY_CHARGE, 60),
    // Nudge the customer once when the drone is this many seconds from the hub.
    approachingEtaSeconds: num(process.env.DRONE_APPROACHING_ETA_SECONDS, 300),
    // Auto-flag maintenance after this many completed trips (0 disables).
    serviceEveryTrips: num(process.env.DRONE_SERVICE_EVERY_TRIPS, 25),
    // Shared secret for hardware telemetry ingest (`x-drone-key`). Empty disables the endpoint.
    ingestKey: process.env.DRONE_INGEST_KEY || '',
    // A hardware drone with no telemetry for this long is shown as stale in fleet health.
    staleAfterSeconds: num(process.env.DRONE_STALE_AFTER_SECONDS, 120),
  },
  defaultDeliveryFee: num(process.env.DEFAULT_DELIVERY_FEE, 60),
  fee: {
    // 'flat' keeps the single admin-set fee; 'distance' adds a per-km component.
    mode: process.env.DELIVERY_FEE_MODE === 'distance' ? 'distance' : 'flat',
    perKm: num(process.env.DELIVERY_FEE_PER_KM, 10),
    max: num(process.env.DELIVERY_FEE_MAX, 300),
  },
  delivery: {
    // Maximum restaurant→hub distance in km for an order to be placeable (0 disables the check).
    maxDistanceKm: num(process.env.MAX_DELIVERY_DISTANCE_KM, 0),
  },
  push: {
    // Generate once with `npx web-push generate-vapid-keys` and keep them in .env.
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@goodpanda.test',
  },
  sms: {
    // Twilio credentials for SMS notifications (optional). No-op when not configured.
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    fromNumber: process.env.TWILIO_FROM_NUMBER || '',
  },
  email: {
    // Resend-compatible HTTP API for transactional email (optional). No-op when not configured.
    // Tests never send real email (they fake the provider when they need it).
    apiKey: process.env.NODE_ENV === 'test' ? '' : process.env.EMAIL_API_KEY || '',
    from: process.env.EMAIL_FROM || 'GoodPanda <receipts@goodpanda.test>',
    apiUrl: process.env.EMAIL_API_URL || 'https://api.resend.com/emails',
  },
  payment: {
    // Stripe secret key for online payments (optional). No-op when not configured.
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
    // Signing secret from the Stripe webhook endpoint (required to accept webhook events).
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },
  commission: {
    // Platform commission percent applied to each order subtotal (0 disables).
    percent: num(process.env.PLATFORM_COMMISSION_PERCENT, 10),
  },
  loyalty: {
    // Credit the inviter earns when their invitee's first order is collected.
    referralReward: num(process.env.REFERRAL_REWARD, 50),
    // Credit a new customer gets for signing up with a referral code.
    referralSignupCredit: num(process.env.REFERRAL_SIGNUP_CREDIT, 50),
    // Collected orders needed for a loyalty reward, and the credit granted (0 disables).
    stampsPerReward: num(process.env.LOYALTY_STAMPS, 10),
    reward: num(process.env.LOYALTY_REWARD, 100),
  },
};

if (!env.jwtSecret) throw new Error('JWT_SECRET must be set in production');
