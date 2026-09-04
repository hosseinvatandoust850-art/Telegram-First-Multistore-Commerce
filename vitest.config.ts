import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.{test,spec}.ts'],
    testTimeout: 15000,
    env: {
      NODE_ENV: 'test',
      // Tests that exercise pure logic do not need a live DB; these values let
      // modules import cleanly. DB-backed helpers are not exercised.
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/commerce_test',
      APP_SECRET: 'test-secret',
      APP_URL: 'http://localhost:8080',
      PORT: '8080',
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
