import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for E2E tests.
 * Tests run against real backend (API + PostgreSQL).
 *
 * Usage:
 *   npm run test:e2e           # Run all E2E tests
 *   npm run test:e2e:ui        # Run with Playwright UI
 *   npm run test:e2e:headed    # Run in headed browser mode
 */
export default defineConfig({
  // Global setup - seeds test data before tests run
  globalSetup: './e2e/global-setup.ts',

  // Test directory
  testDir: './e2e',

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if test.only is left in source
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Limit parallel workers on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  // Shared settings for all projects
  use: {
    // Base URL for navigation
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',

    // Collect trace on failure
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure (helpful for CI debugging)
    video: 'on-first-retry',
  },

  // Configure projects for different browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment to add more browsers
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Web server configuration - starts the dev server before tests
  webServer: [
    {
      // Start the Vue dev server
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],

  // Global timeout for each test
  timeout: 30 * 1000,

  // Expect timeout
  expect: {
    timeout: 5 * 1000,
  },
})
