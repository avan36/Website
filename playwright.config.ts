// End-to-end browser tests against the built site (dist/). Run with
// `npm run build && npm run test:e2e`; see docs/e2e.md. Not part of
// `npm run build`: Vercel builds there and has no browser.
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4791);

// A preinstalled Chromium (e.g. in a sandbox) when there is one; otherwise
// Playwright's own browsers (`npx playwright install chromium`).
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  // The 3D island renders with a software GPU here, which is slow and hungry;
  // a couple of workers keeps timings steady.
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 2,
  fullyParallel: true,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath,
      // WebGL without a GPU, for the 3D island.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: `node e2e/static-server.mjs dist ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    // Never test some other server that happens to hold the port.
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
