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

/**
 * Login a user via the login page.
 */
export async function login(page: Page, credentials: AuthCredentials): Promise<void> {
  // Ensure we're logged out before accessing login page
  await clearAuthState(page)
  await page.goto('/login')

  // Fill login form - use input role to avoid matching icon buttons
  await page.getByRole('textbox', { name: 'Username or Email' }).fill(credentials.username_or_email)
  // Password field needs locator to avoid matching the eye icon
  await page.locator('input[type="password"]').first().fill(credentials.password)

  // Submit form
  await page.getByRole('button', { name: 'Login' }).click()

  // Wait for navigation away from login page
  await expect(page).not.toHaveURL('/login')
}

/**
 * Register a new user via the register page.
 * Note: After registration, the user is logged in. Call clearAuthState() if you need
 * to access login/register pages afterward.
 */
export async function register(page: Page, data: RegisterData): Promise<void> {
  // Ensure we're logged out before accessing register page
  await clearAuthState(page)
  await page.goto('/register')

  // Fill registration form - use specific selectors to avoid matching icons
  await page.getByRole('textbox', { name: 'Username' }).fill(data.username)
  await page.getByRole('textbox', { name: 'Email' }).fill(data.email)
  // Password field needs locator to avoid matching the eye icon
  await page.locator('input[type="password"]').first().fill(data.password)

  if (data.display_name) {
    await page.getByRole('textbox', { name: 'Display Name' }).fill(data.display_name)
  }

  // Submit form
  await page.getByRole('button', { name: 'Create Account' }).click()

  // Wait for success message
  await expect(page.getByText('Registration successful')).toBeVisible()
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
export async function isLoggedIn(page: Page): Promise<boolean> {
  // Check for presence of authenticated user elements
  // Adjust based on actual UI indicators
  const userIndicator = page.locator('[data-testid="user-indicator"]')
  return userIndicator.isVisible().catch(() => false)
}

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
