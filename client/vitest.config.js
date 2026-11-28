import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Node 25+ ships a built-in global localStorage that shadows jsdom's (and is undefined
// without --localstorage-file). Disable it so tests use the jsdom implementation.
// Older Node versions (e.g. Node 20 in CI) don't know this flag and would refuse to start,
// so only pass it where it exists and is needed.
const nodeMajor = Number(process.versions.node.split('.')[0]);
const execArgv = nodeMajor >= 25 ? ['--no-experimental-webstorage'] : [];

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    poolOptions: {
      forks: { execArgv },
      threads: { execArgv },
    },
  },
});
