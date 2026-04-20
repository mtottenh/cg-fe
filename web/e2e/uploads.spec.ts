import { test, expect } from '@playwright/test'
import { loginAsAdmin, getAdminToken, clearAuthState } from './fixtures/auth.fixture'
import {
  INVALID_FILE_PATH,
  TEST_IMAGE_PATH,
  getAdminLeagueTeamId,
  getLeagueTeam,
  getMyProfile,
  injectAuth,
  registerPlayerViaApi,
} from './fixtures/uploads.fixture'

/**
 * Image Upload E2E Tests (backlog 1.1)
 *
 * Covers the ImageUpload flows end-to-end via the pages that host the
 * component — ProfileEditPage and TeamEditPage. Uses API-seed-setup +
 * UI-assert style per existing convention.
 *
 * Scenarios:
 *  1. Player avatar upload round-trip (admin)
 *  2. Player banner upload round-trip (admin)
 *  3. Team owner uploads team logo
 *  4. Team owner uploads team banner
 *  5. Non-owner blocked from editing a team's images
 *  6. Invalid MIME type rejected by client-side validation (no network)
 *  7. Oversized file rejected by client-side validation
 */

test.describe('Image uploads', () => {
  test.describe('Player avatar & banner', () => {
    test('uploads a new avatar and persists the returned URL', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto('/profile/edit')

      // The ImageUpload for avatar lives in the "Avatar" column.
      await expect(page.getByText('Profile Images')).toBeVisible()
      await expect(page.getByText('Avatar').first()).toBeVisible()

      // Wait for the avatar upload endpoint response.
      const uploadPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/v1/players/me/avatar') && resp.request().method() === 'POST'
      )

      // The hidden <input type="file"> lives inside the ImageUpload — first()
      // targets the avatar (banner is second).
      const fileInput = page.locator('input[type="file"]').first()
      await fileInput.setInputFiles(TEST_IMAGE_PATH)

      const response = await uploadPromise
      expect(response.ok()).toBe(true)

      // Success snackbar / alert confirmation.
      await expect(page.getByText(/avatar uploaded successfully/i)).toBeVisible({
        timeout: 10_000,
      })

      // Assert the backend persisted the avatar URL.
      const adminToken = await getAdminToken()
      const profile = await getMyProfile(adminToken)
      expect(profile).not.toBeNull()
      expect(profile!.avatar_url).toBeTruthy()
    })

    test('uploads a new banner and persists the returned URL', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto('/profile/edit')

      await expect(page.getByText('Banner').first()).toBeVisible()

      const uploadPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/v1/players/me/banner') && resp.request().method() === 'POST'
      )

      // Banner ImageUpload is the second <input type="file"> on the page.
      const fileInput = page.locator('input[type="file"]').nth(1)
      await fileInput.setInputFiles(TEST_IMAGE_PATH)

      const response = await uploadPromise
      expect(response.ok()).toBe(true)

      await expect(page.getByText(/banner uploaded successfully/i)).toBeVisible({
        timeout: 10_000,
      })

      const adminToken = await getAdminToken()
      const profile = await getMyProfile(adminToken)
      expect(profile).not.toBeNull()
      expect(profile!.banner_url).toBeTruthy()
    })
  })

  test.describe('Team owner uploads', () => {
    test('team owner uploads a logo and the new URL is persisted', async ({ page }) => {
      const adminToken = await getAdminToken()
      const teamId = await getAdminLeagueTeamId(adminToken)
      expect(teamId, 'admin team must be seeded by global-setup').not.toBeNull()

      await loginAsAdmin(page)
      await page.goto(`/teams/${teamId}/edit`)

      await expect(page.getByText('Team Branding')).toBeVisible({ timeout: 10_000 })

      // Backend endpoint: POST /v1/league-teams/{team_id}/logo
      const uploadPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/v1/league-teams/${teamId}/logo`) &&
          resp.request().method() === 'POST',
        { timeout: 15_000 }
      )

      const fileInput = page.locator('input[type="file"]').first()
      await fileInput.setInputFiles(TEST_IMAGE_PATH)

      const response = await uploadPromise
      expect(response.ok()).toBe(true)

      await expect(page.getByText(/logo uploaded/i)).toBeVisible({ timeout: 10_000 })

      // Reload the edit page and confirm the logo survives a refresh.
      await page.reload()
      await expect(page.getByText('Team Branding')).toBeVisible()

      const team = await getLeagueTeam(teamId!)
      expect(team).not.toBeNull()
      expect(team!.logo_url).toBeTruthy()
    })

    test('team owner uploads a banner and the new URL is persisted', async ({ page }) => {
      const adminToken = await getAdminToken()
      const teamId = await getAdminLeagueTeamId(adminToken)
      expect(teamId, 'admin team must be seeded by global-setup').not.toBeNull()

      await loginAsAdmin(page)
      await page.goto(`/teams/${teamId}/edit`)

      await expect(page.getByText('Team Branding')).toBeVisible({ timeout: 10_000 })

      // Backend endpoint: POST /v1/league-teams/{team_id}/banner
      const uploadPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/v1/league-teams/${teamId}/banner`) &&
          resp.request().method() === 'POST',
        { timeout: 15_000 }
      )

      // Banner ImageUpload is the second file input on the Team Edit page.
      const fileInput = page.locator('input[type="file"]').nth(1)
      await fileInput.setInputFiles(TEST_IMAGE_PATH)

      const response = await uploadPromise
      expect(response.ok()).toBe(true)

      await expect(page.getByText(/banner uploaded/i)).toBeVisible({ timeout: 10_000 })

      await page.reload()
      await expect(page.getByText('Team Branding')).toBeVisible()

      const team = await getLeagueTeam(teamId!)
      expect(team).not.toBeNull()
      expect(team!.banner_url).toBeTruthy()
    })
  })

  test.describe('Access control', () => {
    test('non-owner cannot edit another team’s branding', async ({ page }) => {
      const adminToken = await getAdminToken()
      const teamId = await getAdminLeagueTeamId(adminToken)
      expect(teamId, 'admin team must be seeded by global-setup').not.toBeNull()

      // Register a throwaway player who does NOT own the team.
      const other = await registerPlayerViaApi()

      // Seed the browser session for the new player.
      await clearAuthState(page)
      await injectAuth(page, other.token, other.playerId)

      await page.goto(`/teams/${teamId}/edit`)

      // Either the page surfaces an "only the team owner can edit" error, or
      // the branding UI is never rendered (owner guard hides the form). Both
      // are acceptable — the invariant is that a non-owner cannot upload.
      const ownerError = page.getByText(/only the team owner can edit/i)
      const brandingHeader = page.getByText('Team Branding')

      await Promise.race([
        ownerError.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => null),
        brandingHeader.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => null),
      ])

      const brandingVisible = await brandingHeader.isVisible().catch(() => false)
      const errorVisible = await ownerError.isVisible().catch(() => false)

      // Exactly one of the two outcomes should hold: blocked via message or
      // branding UI absent.
      expect(brandingVisible === false || errorVisible === true).toBe(true)
    })
  })

  test.describe('Client-side validation', () => {
    test('rejects an invalid MIME type without firing a POST', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto('/profile/edit')
      await expect(page.getByText('Profile Images')).toBeVisible()

      // Capture any POSTs to upload endpoints. None should fire because the
      // ImageUpload validates before uploading.
      const uploadRequests: string[] = []
      const listener = (request: import('@playwright/test').Request) => {
        const url = request.url()
        if (
          request.method() === 'POST' &&
          (url.includes('/v1/players/me/avatar') ||
            url.includes('/v1/players/me/banner') ||
            /\/v1\/league-teams\/[^/]+\/(logo|banner)/.test(url))
        ) {
          uploadRequests.push(url)
        }
      }
      page.on('request', listener)

      try {
        // Feed a text file — .accept is image/*, so validation should reject.
        const fileInput = page.locator('input[type="file"]').first()
        await fileInput.setInputFiles(INVALID_FILE_PATH)

        // Client-side error should appear.
        await expect(page.getByText(/invalid file type/i)).toBeVisible({ timeout: 5_000 })

        // Give a generous window to confirm no upload request ever fires.
        await page.waitForTimeout(1_000)
      } finally {
        page.off('request', listener)
      }

      expect(uploadRequests).toEqual([])
    })

    test('rejects an oversized file without firing a POST', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto('/profile/edit')
      await expect(page.getByText('Profile Images')).toBeVisible()

      // The avatar upload has max-size=2MB — build a 10MB buffer which both
      // exceeds avatar (2MB) and banner (5MB) limits so the assertion is
      // robust even if the input indexing changes.
      const oversized = Buffer.alloc(10 * 1024 * 1024, 0)

      const uploadRequests: string[] = []
      const listener = (request: import('@playwright/test').Request) => {
        const url = request.url()
        if (
          request.method() === 'POST' &&
          (url.includes('/v1/players/me/avatar') ||
            url.includes('/v1/players/me/banner'))
        ) {
          uploadRequests.push(url)
        }
      }
      page.on('request', listener)

      try {
        const fileInput = page.locator('input[type="file"]').first()
        await fileInput.setInputFiles({
          name: 'big.png',
          mimeType: 'image/png',
          buffer: oversized,
        })

        await expect(page.getByText(/file too large/i)).toBeVisible({ timeout: 5_000 })

        await page.waitForTimeout(1_000)
      } finally {
        page.off('request', listener)
      }

      expect(uploadRequests).toEqual([])
    })
  })
})
