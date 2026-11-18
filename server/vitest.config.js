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
      UPLOAD_DIR: 'uploads-test',
    },
  },
});
