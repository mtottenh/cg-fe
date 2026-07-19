import { test, expect } from '@playwright/test'
import { clearAuthState } from './fixtures/auth.fixture'
import { testUsers } from './fixtures/test-data'

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

/**
 * Steam sign-in E2E tests.
 *
 * These deliberately do NOT perform a real Steam OpenID roundtrip (that
 * would require live Steam credentials). Instead they verify:
 *   1. the login page offers the Steam button pointing at the backend,
 *   2. the backend login endpoint 302s to steamcommunity.com with our
 *      return_to, and
 *   3. the /auth/steam/complete route consumes a token fragment (with
 *      real tokens minted via the API) and leaves the app authenticated.
 */
test.describe('Steam sign-in', () => {
  test('login page shows the Steam button pointing at the backend', async ({ page }) => {
    await clearAuthState(page)
    await page.goto('/login')

    const steamButton = page.getByTestId('steam-login-button')
    await expect(steamButton).toBeVisible()
    await expect(steamButton).toContainText('Sign in through Steam')

    const href = await steamButton.getAttribute('href')
    expect(href).toBe(`${API_URL}/v1/auth/steam/login`)
  })

  test('backend login endpoint redirects to Steam with our return_to', async ({ request }) => {
    const response = await request.get(`${API_URL}/v1/auth/steam/login`, {
      maxRedirects: 0,
    })

    expect(response.status()).toBe(302)
    const location = response.headers()['location']
    expect(location).toBeTruthy()
    expect(location).toContain('https://steamcommunity.com/openid/login?')
    expect(location).toContain('openid.mode=checkid_setup')
    // return_to must point back at the API's own callback
    expect(location).toContain(
      encodeURIComponent(`${API_URL}/v1/auth/steam/callback`)
    )
  })

  test('steam complete route consumes a token fragment and authenticates', async ({ page }) => {
    // Mint real tokens via the API (register a fresh user).
    const userData = testUsers.standard()
    const registerResponse = await fetch(`${API_URL}/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    })
    expect(registerResponse.ok).toBeTruthy()
    const registerBody = await registerResponse.json()
    const accessToken: string = registerBody.data.access_token
    const refreshToken: string = registerBody.data.refresh_token
    expect(accessToken).toBeTruthy()
    expect(refreshToken).toBeTruthy()

    await clearAuthState(page)

    // Drive the completion route exactly the way the backend callback does.
    await page.goto(
      `/auth/steam/complete#access_token=${accessToken}&refresh_token=${refreshToken}`
    )

    // The page stores the tokens and redirects home.
    await expect(page).toHaveURL('/', { timeout: 15000 })

    // The app is authenticated: tokens are in localStorage and the
    // fragment has been cleared from the address bar.
    const stored = await page.evaluate(() => ({
      token: localStorage.getItem('token'),
      refresh: localStorage.getItem('refresh_token'),
      playerId: localStorage.getItem('player_id'),
    }))
    expect(stored.token).toBe(accessToken)
    expect(stored.refresh).toBe(refreshToken)
    expect(stored.playerId).toBeTruthy()

    // Authenticated UI is visible (profile route no longer bounces to login).
    await page.goto('/profile')
    await expect(page).toHaveURL(/\/profile/)
  })

  test('steam complete route without tokens shows an error and a way back', async ({ page }) => {
    await clearAuthState(page)
    await page.goto('/auth/steam/complete')

    await expect(page.getByTestId('steam-complete-error')).toBeVisible()
    const backLink = page.getByTestId('steam-complete-back-to-login')
    await expect(backLink).toBeVisible()
    await backLink.click()
    await expect(page).toHaveURL(/\/login/)
  })
})
