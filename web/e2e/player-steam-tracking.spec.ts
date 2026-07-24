import { test, expect, type Locator, type Page } from '@playwright/test'
import { login } from './fixtures/auth.fixture'
import {
  createPlayer,
  createPlayerWithSteamId,
  enableTrackingViaApi,
  getMyProfile,
  getTrackingViaApi,
} from './fixtures/player-surfaces.fixture'

/**
 * `SteamTrackingCard` — the player-facing opt-in to CS2 match tracking, and
 * therefore the entry point to the entire demo-ingestion pipeline. Mounted on
 * the profile edit page (`ProfileEditPage.vue:177`) and driven by
 * `composables/useSteamTracking.ts`:
 *
 *   enable   POST   /v1/players/me/steam-tracking   (useSteamTracking.ts:37)
 *   update   PATCH  /v1/players/me/steam-tracking   (useSteamTracking.ts:56)
 *   disable  DELETE /v1/players/me/steam-tracking   (useSteamTracking.ts:72)
 *
 * Every test owns a freshly registered player: these are `/players/me` routes,
 * so running them as the shared admin would leave tracking rows behind and make
 * every other spec's view of that account time-dependent.
 *
 * `ProfileEditPage` guards navigation with `useUnsavedChanges` (a
 * `window.confirm` Playwright auto-dismisses), so no test here may dirty the
 * Basic Information or Social Links forms — the tracking card has its own
 * inputs and is deliberately outside that dirty check.
 *
 * The second describe covers `SocialLinksEditor`, the other player-owned card
 * on this same page (`ProfileEditPage.vue:161-172`). It belongs beside the
 * Profile Editing tests in `player-profile.spec.ts`, but that file is owned by
 * another lane; it is parked here rather than left undriven.
 */

// 4-5-4 alphanumeric, the only shape `validate_auth_code`
// (portal-domain/src/services/steam_tracking.rs:173-195) accepts.
const INITIAL_AUTH_CODE = 'ABCD-EFGHI-JKLM'
const REPLACEMENT_AUTH_CODE = 'WXYZ-45678-PQRS'
const SHARE_CODE = 'CSGO-abcde-fghij-klmno-pqrst-uvwxy'

/** The card is the only `v-card` on the page titled "CS2 Match Tracking". */
function trackingCard(page: Page): Locator {
  return page.locator('.v-card').filter({ hasText: 'CS2 Match Tracking' })
}

/**
 * The status chip renders either "Active" or "Inactive" (SteamTrackingCard.vue:65-67).
 * Playwright's text matching is substring + case-insensitive, so a plain
 * "Active" would also match "Inactive" — `exact` pins the whole string.
 */
function statusChip(card: Locator, label: 'Active' | 'Inactive'): Locator {
  return card.getByText(label, { exact: true })
}

/**
 * Vuetify gives a `v-text-field` the accessible name "<label> <label>" (the
 * floating label plus the input's own aria-label), so `{ exact: true }` on the
 * human label matches nothing. Match on the substring and scope by container.
 */
function authCodeField(card: Locator): Locator {
  return card.getByRole('textbox', { name: 'Game Auth Code' })
}

async function openProfileEdit(page: Page, email: string, password: string): Promise<void> {
  await login(page, { username_or_email: email, password })
  await page.goto('/profile/edit')
  await expect(page.getByRole('heading', { name: 'Edit Profile' })).toBeVisible()
}

test.describe('Player CS2 match tracking', () => {
  test('player enables match tracking with an auth code and a starting share code', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    const player = await createPlayerWithSteamId()
    // Precondition, asserted rather than assumed: nothing is tracked yet.
    expect(await getTrackingViaApi(player.token)).toBeNull()

    await openProfileEdit(page, player.email, player.password)
    const card = trackingCard(page)

    // State A — the not-registered form (SteamTrackingCard.vue:16-50).
    const enableButton = card.getByRole('button', { name: 'Enable Match Tracking' })
    await expect(enableButton).toBeVisible()

    await authCodeField(card).fill(INITIAL_AUTH_CODE)
    await card.getByRole('textbox', { name: 'Latest Share Code (optional)' }).fill(SHARE_CODE)
    await enableButton.click()

    // State B — the card swaps to the tracking summary. The auth code is never
    // echoed back: the API returns a 4-character prefix (steam_tracking.rs:72-76).
    // "Auth Code" is a substring of the "Update Auth Code" panel title, so the
    // summary row is matched on its exact title.
    await expect(card.locator('.v-list-item-title').getByText('Auth Code', { exact: true })).toBeVisible()
    await expect(card.getByText('ABCD...')).toBeVisible()
    await expect(statusChip(card, 'Active')).toBeVisible()
    await expect(card.getByRole('button', { name: 'Stop Tracking' })).toBeVisible()
    await expect(enableButton).toHaveCount(0)

    // API cross-check: the row exists, is armed for the poller, and carries the
    // share code as its starting cursor.
    const tracking = await getTrackingViaApi(player.token)
    expect(tracking).not.toBeNull()
    expect(tracking!.game_auth_code_prefix).toBe('ABCD...')
    expect(tracking!.is_active).toBe(true)
    expect(tracking!.last_known_code).toBe(SHARE_CODE)
    expect(tracking!.steam_id_64).toBe(Number(player.steamId))
    expect(tracking!.poll_errors).toBe(0)

    // Survives a reload — the card is hydrated from the server row, not from
    // the in-memory result of the POST.
    await page.reload()
    await expect(trackingCard(page).getByText('ABCD...')).toBeVisible()
    await expect(
      trackingCard(page).getByRole('button', { name: 'Enable Match Tracking' }),
    ).toHaveCount(0)
  })

  test('player replaces the game auth code from the Update Auth Code panel', async ({ page }) => {
    test.setTimeout(60_000)
    const player = await createPlayerWithSteamId()
    const seeded = await enableTrackingViaApi(player.token, INITIAL_AUTH_CODE, SHARE_CODE)
    expect(seeded.game_auth_code_prefix).toBe('ABCD...')

    await openProfileEdit(page, player.email, player.password)
    const card = trackingCard(page)
    await expect(card.getByText('ABCD...')).toBeVisible()

    // The update form lives inside a collapsed expansion panel (:91-109).
    await card.getByRole('button', { name: 'Update Auth Code' }).click()
    const panel = card.locator('.v-expansion-panel-text')
    await panel
      .getByRole('textbox', { name: 'New Game Auth Code' })
      .fill(REPLACEMENT_AUTH_CODE)
    // "Save" is scoped to the panel: the page also carries "Save Changes"
    // (basic info) and "Save Social Links".
    await panel.getByRole('button', { name: 'Save', exact: true }).click()

    // UI: the summary list now shows the new prefix and only the new prefix.
    await expect(card.getByText('WXYZ...')).toBeVisible()
    await expect(card.getByText('ABCD...')).toHaveCount(0)
    await expect(statusChip(card, 'Active')).toBeVisible()

    // API cross-check: same row, new code — updating must not mint a second
    // tracking entry or clear the poller's cursor.
    const tracking = await getTrackingViaApi(player.token)
    expect(tracking!.id).toBe(seeded.id)
    expect(tracking!.game_auth_code_prefix).toBe('WXYZ...')
    expect(tracking!.last_known_code).toBe(SHARE_CODE)
    expect(tracking!.is_active).toBe(true)
  })

  test('player stops tracking and the card returns to the enable form', async ({ page }) => {
    test.setTimeout(60_000)
    const player = await createPlayerWithSteamId()
    await enableTrackingViaApi(player.token, INITIAL_AUTH_CODE)

    await openProfileEdit(page, player.email, player.password)
    const card = trackingCard(page)
    const stopButton = card.getByRole('button', { name: 'Stop Tracking' })
    await expect(stopButton).toBeVisible()

    await stopButton.click()

    // UI: back to State A, the opt-in form.
    await expect(card.getByRole('button', { name: 'Enable Match Tracking' })).toBeVisible()
    await expect(stopButton).toHaveCount(0)
    await expect(card.getByText('ABCD...')).toHaveCount(0)

    // API cross-check: the row is gone, so the poller stops seeing this player
    // (`GET` 404s → `unwrapApiOptional` null → State A on reload too).
    expect(await getTrackingViaApi(player.token)).toBeNull()
    await page.reload()
    await expect(
      trackingCard(page).getByRole('button', { name: 'Enable Match Tracking' }),
    ).toBeVisible()
  })

  test('the card surfaces the refusal when the player has no Steam ID linked', async ({ page }) => {
    test.setTimeout(60_000)
    // No `steam_id` on this player — registration is refused at
    // handlers/steam_tracking.rs:134-138 before anything is written.
    const player = await createPlayer()

    await openProfileEdit(page, player.email, player.password)
    const card = trackingCard(page)

    await authCodeField(card).fill(INITIAL_AUTH_CODE)
    await card.getByRole('button', { name: 'Enable Match Tracking' }).click()

    // The composable puts `ApiError.detail` on the card's error alert
    // (useSteamTracking.ts:15-21, SteamTrackingCard.vue:11-13).
    await expect(card.getByText('Player must have a linked Steam ID')).toBeVisible()
    // Still State A: the form stayed put, nothing was created.
    await expect(card.getByRole('button', { name: 'Enable Match Tracking' })).toBeVisible()
    expect(await getTrackingViaApi(player.token)).toBeNull()
  })
})

test.describe('Player social links', () => {
  test('player saves social links and the form goes clean again', async ({ page }) => {
    test.setTimeout(60_000)
    const player = await createPlayer()
    // Precondition, asserted rather than assumed: a new player has none.
    expect(await getMyProfile(player.token)).toMatchObject({ social_links: {} })

    await openProfileEdit(page, player.email, player.password)
    const card = page.locator('.v-card').filter({ hasText: 'Social Links' })

    const saveButton = page.getByRole('button', { name: 'Save Social Links' })
    // `hasSocialChanges` is false on a pristine form (ProfileEditPage.vue:246-248).
    await expect(saveButton).toBeDisabled()

    await card.getByRole('textbox', { name: 'Twitch' }).fill('shroud')
    await card.getByRole('textbox', { name: 'Discord' }).fill('shroud#0001')
    await expect(saveButton).toBeEnabled()

    // saveSocialLinks → playersStore.updateMyProfile → PATCH /v1/players/me
    // (ProfileEditPage.vue:368-386).
    const savePromise = page.waitForResponse(
      (resp) => resp.url().endsWith('/v1/players/me') && resp.request().method() === 'PATCH',
    )
    await saveButton.click()
    const saveResponse = await savePromise
    expect(saveResponse.status(), 'social links save must return 200').toBe(200)

    await expect(page.getByText('Social links updated successfully')).toBeVisible()
    // `populateForm` re-baselines the form, so the unsaved-changes guard
    // (`useUnsavedChanges`, a window.confirm Playwright auto-dismisses) releases
    // and the player can navigate away.
    await expect(saveButton).toBeDisabled()

    const profile = await getMyProfile(player.token)
    expect(profile.social_links.twitch).toBe('shroud')
    expect(profile.social_links.discord).toBe('shroud#0001')

    // The editor writes only non-empty fields (SocialLinksEditor.vue:106-115),
    // so the untouched networks must not be persisted as empty strings.
    expect(profile.social_links.steam).toBeUndefined()
    expect(profile.social_links.twitter).toBeUndefined()
    expect(profile.social_links.youtube).toBeUndefined()
  })
})
