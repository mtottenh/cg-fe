import { test as base, expect, type Page } from '@playwright/test'
import { testUsers } from './test-data'

/**
 * Authentication helpers for E2E tests.
 * Provides reusable login/register functions and authenticated page fixture.
 */

export interface AuthCredentials {
  username_or_email: string
  password: string
}

export interface RegisterData {
  username: string
  email: string
  password: string
  display_name?: string
}

/**
 * Clear authentication state (localStorage tokens).
 * Use this before navigating to login/register pages if user might be authenticated.
 */
export async function clearAuthState(page: Page): Promise<void> {
  // Need to be on the site to access localStorage
  const currentUrl = page.url()
  if (currentUrl === 'about:blank' || !currentUrl.includes('localhost')) {
    // Navigate to home first to get a valid context
    await page.goto('/')
  }
  await page.evaluate(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('player_id')
  })
}

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

/**
 * Log a user in by exchanging credentials at the API and injecting the
 * resulting tokens exactly as the app stores them (localStorage `token` +
 * `player_id`). The login PAGE is Steam-only — there is no password form
 * to drive; password credentials exist only on API-created test users.
 */
export async function login(page: Page, credentials: AuthCredentials): Promise<void> {
  await clearAuthState(page)
  const resp = await fetch(`${API_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  })
  if (!resp.ok) {
    throw new Error(
      `API login failed for ${credentials.username_or_email}: ${resp.status} ${await resp.text()}`,
    )
  }
  const { data } = (await resp.json()) as {
    data: { access_token: string; player_id?: string | null }
  }
  await page.evaluate(
    ([token, playerId]) => {
      localStorage.setItem('token', token!)
      if (playerId) localStorage.setItem('player_id', playerId)
    },
    [data.access_token, data.player_id ?? ''],
  )
  // Fresh load so the auth store initializes from storage.
  await page.goto('/')
  await expect(page).not.toHaveURL(/\/login/)
}

/**
 * Create a user account (API) and sign the page in as them.
 */
export async function register(page: Page, data: RegisterData): Promise<void> {
  // Email registration has no UI anymore (Steam-only sign-in) — create the
  // account through the API endpoint the tooling uses, then inject the
  // session like login() does.
  const resp = await fetch(`${API_URL}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: data.username,
      email: data.email,
      password: data.password,
      display_name: data.display_name ?? data.username,
    }),
  })
  if (!resp.ok) {
    throw new Error(`API register failed for ${data.username}: ${resp.status} ${await resp.text()}`)
  }
  const { data: body } = (await resp.json()) as {
    data: { access_token: string; player: { id: string } }
  }
  await clearAuthState(page)
  await page.evaluate(
    ([token, playerId]) => {
      localStorage.setItem('token', token!)
      if (playerId) localStorage.setItem('player_id', playerId)
    },
    [body.access_token, body.player.id],
  )
  await page.goto('/')
}

/**
 * Logout the current user.
 */
export async function logout(page: Page): Promise<void> {
  // Find and click logout button in navbar/menu
  // This may need adjustment based on actual UI
  const logoutButton = page.getByRole('button', { name: /logout/i })
  if (await logoutButton.isVisible()) {
    await logoutButton.click()
  } else {
    // Try menu approach if button not directly visible
    const userMenu = page.locator('[data-testid="user-menu"]')
    if (await userMenu.isVisible()) {
      await userMenu.click()
      await page.getByRole('menuitem', { name: /logout/i }).click()
    }
  }

  // Verify logged out - should redirect to login or home
  await expect(page).toHaveURL(/\/(login)?$/)
}

/**
 * Login as the seeded admin user.
 * Uses the admin credentials from test-data.ts (configured via env vars).
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await login(page, testUsers.admin)
}

/**
 * Login as the seeded second test player.
 * Player 2 is registered by global-setup.ts for multi-player E2E flows.
 */
export async function loginAsPlayer2(page: Page): Promise<void> {
  await login(page, testUsers.player2Login)
}

/**
 * Get a real JWT token for the admin user via API call.
 * Useful for global-setup.ts to seed data with authenticated API calls.
 */
export async function getAdminToken(): Promise<string> {
  const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'
  const response = await fetch(`${API_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testUsers.admin),
  })
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Admin login failed (${response.status}): ${errorText}`)
  }
  const data = await response.json()
  return data.data.access_token
}

/**
 * Check if user is currently logged in.
 */

// Extended test fixture with authentication helpers
interface AuthFixtures {
  // Pre-authenticated page using real admin login
  authenticatedPage: Page
  // Auth helper functions
  authHelpers: {
    login: (credentials: AuthCredentials) => Promise<void>
    register: (data: RegisterData) => Promise<void>
    logout: () => Promise<void>
    loginAsAdmin: () => Promise<void>
  }
}

/**
 * Extended test fixture that provides authenticated page and auth helpers.
 */
export const test = base.extend<AuthFixtures>({
  // Authenticated page - logs in as admin before each test
  authenticatedPage: async ({ page }, use) => {
    await loginAsAdmin(page)
    await use(page)
  },

  // Auth helper functions bound to page
  authHelpers: async ({ page }, use) => {
    await use({
      login: (credentials) => login(page, credentials),
      register: (data) => register(page, data),
      logout: () => logout(page),
      loginAsAdmin: () => loginAsAdmin(page),
    })
  },
})

export { expect } from '@playwright/test'
