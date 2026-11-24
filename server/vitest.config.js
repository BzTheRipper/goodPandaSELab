import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 120000,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret',
      DRONE_TICK_MS: '20',
      DRONE_SPEED_MPS: '100000',
      // Charge fast so docking tests finish quickly without faking the controller.
      DRONE_CHARGING_TICK_MS: '20',
      DRONE_CHARGE_PERCENT_PER_TICK: '10',
      UPLOAD_DIR: 'uploads-test',
    },
  },
});
