import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin, getAdminToken, login } from './fixtures/auth.fixture'
import { createPlayerWithSteamId, enableTrackingViaApi } from './fixtures/player-surfaces.fixture'
import { getDemoLinks } from './fixtures/awards.fixture'
import {
  createBackfillScenario,
  createPlayerWithScrapedRating,
  getMyProfile,
  getPipelineOverview,
  getRatingHistory,
  getTrackingHealth,
  getTrackingHealthRaw,
  pipelineReadStatus,
  submitRatingStatus,
  type BackfillScenario,
  type RatingSubject,
} from './fixtures/pipeline-admin.fixture'

/**
 * `/admin/pipeline` — the ingestion-pipeline operator surface.
 *
 * P-73: everything upstream of the demo catalog (Steam tracking tokens, the
 * discovered-match queue, enrichment) spoke only over the `X-API-Key`
 * `/v1/internal` routes, so the portal could not see that ingestion had
 * stopped. Since ingestion supplies player ratings, that failure fed silently
 * into seeding and league entry gates.
 *
 * P-64: `POST /v1/admin/demos/process-unlinked` existed with no control — the
 * Demos page had the auto-link kill-switch but no way to run the pass.
 *
 * P-68: `POST /v1/players/{id}/games/{game}/rating` existed with no UI
 * consumer at all, so a wrong scraped Premier rating was uncorrectable.
 *
 * All three live on one page because they are one workflow: see the stall,
 * re-run the link pass, correct what the broken pass produced.
 *
 * 4-5-4 alphanumeric is the only shape `validate_auth_code` accepts
 * (`portal-domain/src/services/steam_tracking.rs`).
 */
const TRACKING_AUTH_CODE = 'PIPE-LINEQ-CODE'

test.describe.configure({ timeout: 150_000 })

async function openPipelineViaSidebar(page: Page): Promise<void> {
  await loginAsAdmin(page)
  await page.goto('/admin')
  // Navigate through the sidebar rather than by URL: the nav entry is part of
  // the fix (an operator page nobody can reach is the same as no page).
  await page.getByRole('link', { name: 'Pipeline', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/pipeline$/)
  await expect(page.getByRole('heading', { name: 'Ingestion Pipeline' })).toBeVisible()
}

test.describe('Admin ingestion pipeline', () => {
  let adminToken: string

  test.beforeAll(async () => {
    adminToken = await getAdminToken()
  })

  test('operator sees tracking-token health for a token the poller has never touched', async ({
    page,
  }) => {
    // A player opts into CS2 match tracking — the head of the pipeline. The
    // poller in the e2e stack never runs, so this token is exactly the
    // "discovered nothing, and nobody can tell" case P-73 is about.
    const player = await createPlayerWithSteamId()
    const tracking = await enableTrackingViaApi(player.token, TRACKING_AUTH_CODE)
    const profile = await getMyProfile(player.token)

    await openPipelineViaSidebar(page)

    // ---- The token is on screen, named, with its health ------------------
    const row = page.getByTestId(`tracking-row-${tracking.id}`)
    await expect(row).toBeVisible()
    await expect(page.getByTestId(`tracking-player-${tracking.id}`)).toHaveText(
      profile.display_name,
    )
    await expect(page.getByTestId(`tracking-status-${tracking.id}`)).toHaveText('Active')
    await expect(page.getByTestId(`tracking-errors-${tracking.id}`)).toHaveText('0')
    await expect(page.getByTestId(`tracking-last-poll-${tracking.id}`)).toHaveText(
      'Never polled',
    )
    await expect(row).toContainText(player.steamId)

    // ---- Stage 1 counts it ----------------------------------------------
    const neverPolled = await page
      .getByTestId('pipeline-metric-tracking-never')
      .textContent()
    expect(Number(neverPolled)).toBeGreaterThanOrEqual(1)

    // Every stage card renders, so the operator can localise a stoppage.
    await expect(page.getByTestId('pipeline-stage-tracking')).toBeVisible()
    await expect(page.getByTestId('pipeline-stage-discovered')).toBeVisible()
    await expect(page.getByTestId('pipeline-stage-demos')).toBeVisible()

    // ---- Backend cross-check ---------------------------------------------
    const entries = await getTrackingHealth(adminToken, 'cs2')
    const seeded = entries.find((e) => e.id === tracking.id)
    expect(seeded).toBeDefined()
    expect(seeded?.player_display_name).toBe(profile.display_name)
    expect(seeded?.steam_id_64).toBe(player.steamId)
    expect(seeded?.last_poll_at).toBeNull()
    expect(seeded?.is_active).toBe(true)

    const overview = await getPipelineOverview(adminToken, 'cs2')
    expect(overview.game_slug).toBe('cs2')
    expect(overview.tracking.never_polled).toBeGreaterThanOrEqual(1)

    // The tracking read must never hand the browser a live Steam credential.
    const raw = await getTrackingHealthRaw(adminToken)
    expect(raw).toContain(player.steamId)
    expect(raw).not.toContain(TRACKING_AUTH_CODE)
    expect(raw).not.toContain('game_auth_code')
  })

  test('the game filter scopes the tracking read', async ({ page }) => {
    const player = await createPlayerWithSteamId()
    const tracking = await enableTrackingViaApi(player.token, 'FILT-ERQQQ-CODE')

    await openPipelineViaSidebar(page)
    await expect(page.getByTestId(`tracking-row-${tracking.id}`)).toBeVisible()

    // Selecting a game must reach the backend, not just re-render locally.
    const request = page.waitForResponse(
      (r) =>
        r.url().includes('/v1/admin/pipeline/tracking') &&
        r.url().includes('game=cs2') &&
        r.status() === 200,
    )
    await page.getByTestId('pipeline-game-filter').click()
    await page.getByRole('option', { name: /Counter-Strike/i }).click()
    await request

    // The CS2 token survives a CS2 filter.
    await expect(page.getByTestId(`tracking-row-${tracking.id}`)).toBeVisible()
  })

  test('the pipeline is closed to non-admins in the UI and at the API', async ({ page }) => {
    const outsider = await createPlayerWithSteamId()

    // ---- UI: the route guard bounces a logged-in non-admin ---------------
    await login(page, { username_or_email: outsider.email, password: outsider.password })
    await page.goto('/admin/pipeline')
    await expect(page).toHaveURL(/localhost:\d+\/$/)
    await expect(page.getByRole('heading', { name: 'Ingestion Pipeline' })).toHaveCount(0)

    // ---- API: 403 for that same user, on every read ----------------------
    // Assert the exact status: these endpoints also 404 on an unknown game and
    // 400 on a bad status filter, so "not 2xx" would not distinguish the gate.
    for (const path of ['overview', 'tracking', 'discovered-matches']) {
      expect(await pipelineReadStatus(outsider.token, path)).toBe(403)
      expect(await pipelineReadStatus(null, path)).toBe(401)
    }

    // ...and open to the admin, so the 403s above are the gate and not a
    // uniformly broken endpoint.
    for (const path of ['overview', 'tracking', 'discovered-matches']) {
      expect(await pipelineReadStatus(adminToken, path)).toBe(200)
    }
  })

  test('P-64: Run Backfill links a demo the ingest-time pass could not link', async ({
    page,
  }) => {
    let scenario: BackfillScenario
    try {
      scenario = await createBackfillScenario(adminToken)
    } catch (e) {
      throw new Error(`Backfill scenario setup failed: ${(e as Error).message}`)
    }

    // Precondition, asserted: the demo has no match link at all.
    expect(await getDemoLinks(adminToken, scenario.demoId)).toHaveLength(0)

    await openPipelineViaSidebar(page)

    // The backfill refuses to run (409) while auto-linking is switched off,
    // so pin the 200 rather than letting a 409 pass as "ran".
    const backfill = page.waitForResponse(
      (r) => r.url().includes('/v1/admin/demos/process-unlinked') && r.request().method() === 'POST',
    )
    await page.getByTestId('run-backfill').click()
    const response = await backfill
    expect(response.status()).toBe(200)

    // ---- UI reports the pass -------------------------------------------
    const result = page.getByTestId('backfill-result')
    await expect(result).toBeVisible()
    await expect(result).toContainText('Examined')
    await expect(result).toContainText('Linked')

    // ---- Backend cross-check: THIS demo is now linked to THIS match ------
    const links = await getDemoLinks(adminToken, scenario.demoId)
    expect(links).toHaveLength(1)
    expect(links[0].match_id).toBe(scenario.matchId)
    expect(links[0].link_type).toBe('auto_matched')
  })

  test('P-68: a wrong scraped Premier rating is corrected through the UI', async ({ page }) => {
    // 31000 is well outside any real Premier rating — the shape of a bad
    // extraction, and high enough that it would sail past a rating gate.
    let subject: RatingSubject
    try {
      subject = await createPlayerWithScrapedRating(adminToken, 31_000)
    } catch (e) {
      throw new Error(`Rating scenario setup failed: ${(e as Error).message}`)
    }

    const before = await getRatingHistory(subject.playerId)
    expect(before[0].rating).toBe(31_000)
    expect(before[0].source).toBe('demo_rank_update')

    await openPipelineViaSidebar(page)

    // ---- Fill the override form -----------------------------------------
    // `UserSearchAutocomplete` → GET /v1/players?q=… is a display-name PREFIX
    // match, so the full generated name resolves to exactly this account.
    // Located by placeholder: Vuetify doubles a field's accessible name, so
    // `getByRole(..., { exact: true })` on the label matches nothing.
    const playerInput = page.getByPlaceholder(/search by display name/i)
    await playerInput.click()
    await playerInput.fill(subject.displayName)
    const playerOption = page.getByRole('option', { name: subject.displayName })
    await expect(playerOption).toBeVisible({ timeout: 15_000 })
    await playerOption.click()

    await page.getByTestId('rating-game').click()
    await page.getByRole('option', { name: /Counter-Strike/i }).click()

    await page.getByTestId('rating-value').locator('input').fill('14500')
    await page.getByTestId('rating-source').locator('input').fill('manual: demo misparse')

    const write = page.waitForResponse(
      (r) => r.url().includes('/rating') && r.request().method() === 'POST',
    )
    await page.getByTestId('submit-rating-override').click()
    expect((await write).status()).toBe(201)

    // ---- UI shows the corrected value and the audit trail ---------------
    await expect(page.getByText(`Rating for ${subject.displayName} set to 14500`)).toBeVisible()
    const history = page.getByTestId('rating-history')
    await expect(history).toBeVisible()
    await expect(history).toContainText('14500')
    await expect(history).toContainText('manual: demo misparse')
    await expect(history).toContainText('31000')

    // ---- Backend cross-check --------------------------------------------
    const after = await getRatingHistory(subject.playerId)
    expect(after).toHaveLength(2)
    expect(after[0].rating).toBe(14_500)
    expect(after[0].source).toBe('manual: demo misparse')
    // The pipeline's own row is kept: the override is additive, not a rewrite.
    expect(after[1].rating).toBe(31_000)
    expect(after[1].source).toBe('demo_rank_update')

    // The override endpoint stays admin-only — the control is on an
    // admin-guarded page, but the endpoint must not rely on that.
    expect(await submitRatingStatus(subject.token, subject.playerId, 99)).toBe(403)
  })
})
