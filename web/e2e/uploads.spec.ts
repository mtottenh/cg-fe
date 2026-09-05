import { test, expect } from '@playwright/test'
import { loginAsAdmin, getAdminToken, clearAuthState } from './fixtures/auth.fixture'
import {
  INVALID_FILE_PATH,
  TEST_BANNER_IMAGE_PATH,
  TEST_SQUARE_IMAGE_PATH,
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
      const adminToken = await getAdminToken()
      const before = await getMyProfile(adminToken)

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
      // targets the avatar (banner is second). Avatar demands a ~1:1 image.
      const fileInput = page.locator('input[type="file"]').first()
      await fileInput.setInputFiles(TEST_SQUARE_IMAGE_PATH)

      const response = await uploadPromise
      expect(response.ok()).toBe(true)

      // The backend returns a fresh URL (includes a UUID in the path), so
      // assert round-trip by re-fetching and checking the URL changed.
      await expect
        .poll(async () => (await getMyProfile(adminToken))?.avatar_url ?? null, {
          timeout: 10_000,
        })
        .not.toBe(before?.avatar_url ?? null)
    })

    test('uploads a new banner and persists the returned URL', async ({ page }) => {
      const adminToken = await getAdminToken()
      const before = await getMyProfile(adminToken)

      await loginAsAdmin(page)
      await page.goto('/profile/edit')

      await expect(page.getByText('Banner').first()).toBeVisible()

      const uploadPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/v1/players/me/banner') && resp.request().method() === 'POST'
      )

      // Banner ImageUpload is the second <input type="file"> on the page.
      // Banner endpoint requires ~4:1 aspect.
      const fileInput = page.locator('input[type="file"]').nth(1)
      await fileInput.setInputFiles(TEST_BANNER_IMAGE_PATH)

      const response = await uploadPromise
      expect(response.ok()).toBe(true)

      await expect
        .poll(async () => (await getMyProfile(adminToken))?.banner_url ?? null, {
          timeout: 10_000,
        })
        .not.toBe(before?.banner_url ?? null)
    })
  })

  test.describe('Team owner uploads', () => {
    test('team owner uploads a logo and the new URL is persisted', async ({ page }) => {
      const adminToken = await getAdminToken()
      const teamId = await getAdminLeagueTeamId(adminToken)
      expect(teamId, 'admin team must be seeded by global-setup').not.toBeNull()
      const before = await getLeagueTeam(teamId!)

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

      // Team logo requires ~1:1 aspect.
      const fileInput = page.locator('input[type="file"]').first()
      await fileInput.setInputFiles(TEST_SQUARE_IMAGE_PATH)

      const response = await uploadPromise
      expect(response.ok()).toBe(true)

      await expect
        .poll(async () => (await getLeagueTeam(teamId!))?.logo_url ?? null, {
          timeout: 10_000,
        })
        .not.toBe(before?.logo_url ?? null)
    })

    test('team owner uploads a banner and the new URL is persisted', async ({ page }) => {
      const adminToken = await getAdminToken()
      const teamId = await getAdminLeagueTeamId(adminToken)
      expect(teamId, 'admin team must be seeded by global-setup').not.toBeNull()
      const before = await getLeagueTeam(teamId!)

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
      // Team banner requires ~4:1 aspect.
      const fileInput = page.locator('input[type="file"]').nth(1)
      await fileInput.setInputFiles(TEST_BANNER_IMAGE_PATH)

      const response = await uploadPromise
      expect(response.ok()).toBe(true)

      await expect
        .poll(async () => (await getLeagueTeam(teamId!))?.banner_url ?? null, {
          timeout: 10_000,
        })
        .not.toBe(before?.banner_url ?? null)
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

      // This used to accept EITHER outcome (error shown, or branding merely
      // absent) behind two visibility guards and an or-assertion, because the
      // behaviour was genuinely ambiguous: P-13 meant TeamEditPage rendered a
      // blank editable form to non-owners.
      //
      // P-13 is fixed — `TeamEditPage.vue:31` gates the form on `team && isOwner`
      // and non-owners get only the warning alert — so the outcome is now
      // determinate and this asserts BOTH halves exactly. The disjunction could
      // not distinguish "correctly blocked" from "branding failed to render for
      // an unrelated reason", which is precisely the §2 anti-pattern.
      const ownerError = page.getByText(/only the team owner can edit/i)
      const brandingHeader = page.getByText('Team Branding')

      await expect(ownerError).toBeVisible({ timeout: 10_000 })
      await expect(brandingHeader).toBeHidden()
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

        // Client-side error should appear. Multiple ImageUpload instances on
        // the page (avatar + banner) each render their own alert; assert at
        // least one is visible.
        await expect(page.getByText(/invalid file type/i).first()).toBeVisible({ timeout: 5_000 })

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

      // The avatar upload has max-size=10MB and the banner 12MB — build a
      // 20MB buffer that exceeds both, so the assertion is robust even if
      // the input indexing changes.
      const oversized = Buffer.alloc(20 * 1024 * 1024, 0)

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

        await expect(page.getByText(/file too large/i).first()).toBeVisible({ timeout: 5_000 })

        await page.waitForTimeout(1_000)
      } finally {
        page.off('request', listener)
      }

      expect(uploadRequests).toEqual([])
    })
  })
})
