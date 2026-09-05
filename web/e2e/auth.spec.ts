import { test, expect } from '@playwright/test'
import { register, login, clearAuthState } from './fixtures/auth.fixture'
import { testUsers } from './fixtures/test-data'

/**
 * Authentication — Steam-only UI.
 *
 * Email registration and password login have NO user-facing surface: the
 * login page offers exactly one method (Steam OpenID), and /register is
 * gone. The API's password endpoints remain for tooling and tests — the
 * fixtures create users and sessions through them (auth.fixture.ts).
 */
test.describe('Authentication', () => {
  test.describe('Steam-only login page', () => {
    test('offers Steam sign-in and nothing else', async ({ page }) => {
      await clearAuthState(page)
      await page.goto('/login')

      // The one and only sign-in affordance.
      const steam = page.getByTestId('steam-login-button')
      await expect(steam).toBeVisible()
      await expect(steam).toContainText('Sign in through Steam')
      // Points at the backend's Steam OpenID kickoff.
      await expect(steam).toHaveAttribute('href', /\/v1\/auth\/steam/)

      // No email/password form remains.
      await expect(page.getByRole('textbox')).toHaveCount(0)
      await expect(page.locator('input[type="password"]')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Login' })).toHaveCount(0)
    })

    test('register page no longer exists', async ({ page }) => {
      await clearAuthState(page)
      await page.goto('/register')
      // Unknown route → catch-all. What matters: no registration form.
      await expect(page.getByRole('button', { name: 'Create Account' })).toHaveCount(0)
      await expect(page.getByRole('textbox', { name: 'Email' })).toHaveCount(0)
    })
  })

  test.describe('Route gating', () => {
    // Leagues and tournaments are readable signed out (the brackets are the
    // marketing); only the member-facing pages bounce.
    for (const path of ['/tournaments', '/leagues']) {
      test(`unauthenticated visit to ${path} renders without a login bounce`, async ({ page }) => {
        await clearAuthState(page)
        await page.goto(path)
        await expect(page).toHaveURL(path)
        await expect(page.getByTestId('steam-login-button')).toHaveCount(0)
      })
    }

    for (const path of ['/players', '/profile']) {
      test(`unauthenticated visit to ${path} bounces to login`, async ({ page }) => {
        await clearAuthState(page)
        await page.goto(path)
        await expect(page).toHaveURL(new RegExp(`/login\\?redirect=(%2F|/)${path.slice(1)}`))
        await expect(page.getByTestId('steam-login-button')).toBeVisible()
      })
    }

    test('authenticated users reach the gated browse pages', async ({ page }) => {
      const userData = testUsers.standard()
      await register(page, userData)

      await page.goto('/tournaments')
      await expect(page).toHaveURL('/tournaments')
      await page.goto('/leagues')
      await expect(page).toHaveURL('/leagues')
      await page.goto('/players')
      await expect(page).toHaveURL('/players')
    })
  })

  test.describe('Session Persistence', () => {
    test('should maintain session after page refresh', async ({ page }) => {
      const userData = testUsers.standard()
      await register(page, userData)
      await login(page, { username_or_email: userData.username, password: userData.password })

      await expect(page).toHaveURL('/')
      await page.reload()
      // Still logged in (a gated route would bounce a guest).
      await page.goto('/tournaments')
      await expect(page).toHaveURL('/tournaments')
    })
  })
})
