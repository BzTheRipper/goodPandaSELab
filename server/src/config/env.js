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
  },
  defaultDeliveryFee: num(process.env.DEFAULT_DELIVERY_FEE, 60),
};

if (!env.jwtSecret) throw new Error('JWT_SECRET must be set in production');
