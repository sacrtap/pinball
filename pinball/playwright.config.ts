import { defineConfig, devices } from '@playwright/test';

/** E2E：mobile viewport 390×844（iPhone 12/13/14 口径） */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.TEST_BASE_URL ?? 'http://localhost:8477',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    trace: 'off',
  },
  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 7'] } }],
  webServer: process.env.TEST_BASE_URL
    ? undefined
    : {
        command: 'pnpm build && pnpm start',
        port: 8477,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
