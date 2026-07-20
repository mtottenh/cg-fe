import { test, expect, type APIRequestContext } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import {
  createCheckInScenario,
  checkInViaApi,
  getMatch,
  primeAuthStorage,
  type CheckInScenario,
} from './fixtures/checkin.fixture'
import { actOnMapViaUi } from './fixtures/veto.fixture'

/**
 * Map veto (pick/ban) flow E2E.
 *
 * Drives a real match into `pick_ban` entirely via the API (fresh
 * tournament, both players checked in, veto session created + started +
 * coin-flipped), then exercises the veto UI as the player whose turn it is:
 * the Map Veto panel renders, the turn indicator is correct, clicking a map
 * card performs the ban over REST, and the board updates.
 *
 * Backend note: creating a veto session for a match sets
 * `match.veto_required = true`, which is what routes both-checked-in
 * auto-advance to `pick_ban` (instead of `in_progress`) and makes the
 * panel visible.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

async function createVetoSession(adminToken: string, matchId: string): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/matches/${matchId}/veto`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ veto_format_id: 'bo1_veto' }),
  })
  if (!resp.ok) {
    throw new Error(`Create veto session failed (${resp.status}): ${await resp.text()}`)
  }
}

async function startVetoAndFlipCoin(
  adminToken: string,
  matchId: string,
  winnerRegistrationId: string,
): Promise<void> {
  const startResp = await fetch(`${API_URL}/v1/matches/${matchId}/veto/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  if (!startResp.ok) {
    throw new Error(`Start veto failed (${startResp.status}): ${await startResp.text()}`)
  }

  const coinResp = await fetch(`${API_URL}/v1/matches/${matchId}/veto/coin-flip`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      winner_registration_id: winnerRegistrationId,
      winner_goes_first: true,
    }),
  })
  if (!coinResp.ok) {
    throw new Error(`Coin flip failed (${coinResp.status}): ${await coinResp.text()}`)
  }
}

/** Full API-driven setup: match in pick_ban, veto in banning phase, p1 first. */
async function setupVetoScenario(
  request: APIRequestContext,
  adminToken: string,
): Promise<CheckInScenario> {
  const scenario = await createCheckInScenario(request, adminToken, {
    checkInRequired: true,
  })

  // Session must exist before both players check in so the auto-advance
  // lands on pick_ban rather than in_progress.
  await createVetoSession(adminToken, scenario.matchId)

  await checkInViaApi(
    request,
    scenario.p1.token,
    scenario.tournamentId,
    scenario.matchId,
    scenario.p1.registrationId,
  )
  await checkInViaApi(
    request,
    scenario.p2.token,
    scenario.tournamentId,
    scenario.matchId,
    scenario.p2.registrationId,
  )

  const match = await getMatch(request, adminToken, scenario.tournamentId, scenario.matchId)
  expect(match.status, 'both check-ins should auto-advance a veto match to pick_ban').toBe(
    'pick_ban',
  )

  await startVetoAndFlipCoin(adminToken, scenario.matchId, scenario.p1.registrationId)
  return scenario
}

test.describe('Map Veto Flow', () => {
  test('veto panel renders with correct turn state and a ban advances the board', async ({
    request,
    page,
  }) => {
    const adminToken = await getAdminToken()
    const scenario = await setupVetoScenario(request, adminToken)

    // --- P1 (whose turn it is) opens the match page ---
    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await page.waitForLoadState('networkidle')

    // Veto panel is visible with the map pool
    await expect(page.getByText('Map Veto')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Map Pool')).toBeVisible()

    // It's P1's turn to ban
    await expect(page.getByText('Your turn!')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Ban a map/i).first()).toBeVisible()

    // Arm + confirm the first selectable map (bans are two-step) and
    // remember its name
    const mapName = await actOnMapViaUi(page)

    // The ban lands: the named map shows as Banned and the turn passes
    await expect(page.locator('.map-card-banned')).toHaveCount(1, { timeout: 10000 })
    await expect(page.getByText(/Waiting for/i).first()).toBeVisible({ timeout: 10000 })

    // Backend agrees: one map gone from the pool, next action is #2
    const sessionResp = await request.get(`${API_URL}/v1/matches/${scenario.matchId}/veto`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(sessionResp.ok()).toBe(true)
    const session = (await sessionResp.json()).data.session
    expect(session.remaining_maps.length).toBe(session.map_pool.length - 1)
    expect(session.remaining_maps).not.toContain(mapName)
    expect(session.current_action_number).toBe(2)
  })

  test('arming a map does not commit it until confirmed (misclick protection)', async ({
    request,
    page,
  }) => {
    const adminToken = await getAdminToken()
    const scenario = await setupVetoScenario(request, adminToken)

    await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Your turn!')).toBeVisible({ timeout: 10000 })

    // First click only ARMS the map: a confirm prompt appears and nothing
    // has been banned yet.
    await page.locator('.map-card-selectable').first().click()
    const confirm = page.getByTestId('veto-confirm-action')
    await expect(confirm).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.map-card-banned')).toHaveCount(0)

    // Cancelling discards the armed selection without acting.
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(confirm).toHaveCount(0)
    await expect(page.locator('.map-card-banned')).toHaveCount(0)

    // The backend never saw an action: still on action #1.
    const sessionResp = await request.get(`${API_URL}/v1/matches/${scenario.matchId}/veto`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(sessionResp.ok()).toBe(true)
    expect((await sessionResp.json()).data.session.current_action_number).toBe(1)

    // Confirming does commit it.
    await actOnMapViaUi(page)
    await expect(page.locator('.map-card-banned')).toHaveCount(1, { timeout: 10000 })
  })

  test('opponent sees waiting state and cannot act out of turn', async ({ request, page }) => {
    const adminToken = await getAdminToken()
    const scenario = await setupVetoScenario(request, adminToken)

    // --- P2 (NOT their turn) opens the match page ---
    await primeAuthStorage(page, scenario.p2.token, scenario.p2.userId)
    await page.goto(`/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Map Veto')).toBeVisible({ timeout: 10000 })

    // Turn indicator says waiting; no card is clickable
    await expect(page.getByText(/Waiting for/i).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Your turn!')).toHaveCount(0)
    await expect(page.locator('.map-card-selectable')).toHaveCount(0)
  })
})
