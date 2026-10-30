import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.test.ts', 'contact-worker/src/**/*.test.js'], environment: 'node' },
});
