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
 * Real-time map veto sync E2E.
 *
 * Two players in two isolated browser contexts watch the same match page.
 * Each ban made by one player must appear on the other player's page
 * WITHOUT a reload — this validates the veto WebSocket broadcast path end
 * to end (backend broadcast → WS connection → store update → re-render).
 *
 * Setup mirrors `veto-flow.spec.ts`: fresh tournament, veto session created
 * BEFORE both check-ins (so auto-advance lands on `pick_ban`), veto started
 * + coin flipped so P1 bans first.
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

test.describe('Map Veto Real-time Sync', () => {
  test('bans broadcast live between both players over the veto WebSocket', async ({
    browser,
    request,
  }) => {
    const adminToken = await getAdminToken()
    const scenario = await setupVetoScenario(request, adminToken)
    const matchUrl = `/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`

    // Two fully isolated browser contexts — one per player.
    const contextA = await browser.newContext()
    const contextB = await browser.newContext()

    try {
      const pageA = await contextA.newPage()
      const pageB = await contextB.newPage()

      await primeAuthStorage(pageA, scenario.p1.token, scenario.p1.userId)
      await primeAuthStorage(pageB, scenario.p2.token, scenario.p2.userId)

      await pageA.goto(matchUrl)
      await pageB.goto(matchUrl)
      await pageA.waitForLoadState('networkidle')
      await pageB.waitForLoadState('networkidle')

      // Both panels render; P1 to act, P2 waiting.
      await expect(pageA.getByText('Map Veto')).toBeVisible({ timeout: 10000 })
      await expect(pageB.getByText('Map Veto')).toBeVisible({ timeout: 10000 })
      await expect(pageA.getByText('Your turn!')).toBeVisible({ timeout: 10000 })
      await expect(pageB.getByText(/Waiting for/i).first()).toBeVisible({ timeout: 10000 })

      // --- P1 bans a map on page A ---------------------------------------
      await actOnMapViaUi(pageA)

      // Page A reflects its own action.
      await expect(pageA.locator('.map-card-banned')).toHaveCount(1, { timeout: 10000 })

      // Page B updates WITHOUT any reload — the ban arrives over the veto
      // WebSocket. Generous timeout: the only trigger is the WS broadcast.
      await expect(pageB.locator('.map-card-banned')).toHaveCount(1, { timeout: 15000 })
      await expect(pageB.getByText('Your turn!')).toBeVisible({ timeout: 15000 })
      await expect(pageA.getByText(/Waiting for/i).first()).toBeVisible({ timeout: 15000 })

      // --- P2 bans a map on page B ---------------------------------------
      await actOnMapViaUi(pageB)

      // Page B reflects its own action.
      await expect(pageB.locator('.map-card-banned')).toHaveCount(2, { timeout: 10000 })

      // Page A updates live in the other direction — again no reload.
      await expect(pageA.locator('.map-card-banned')).toHaveCount(2, { timeout: 15000 })
      await expect(pageA.getByText('Your turn!')).toBeVisible({ timeout: 15000 })

      // Backend agrees with both boards: two maps gone, next action is #3.
      const sessionResp = await request.get(
        `${API_URL}/v1/matches/${scenario.matchId}/veto`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      )
      expect(sessionResp.ok()).toBe(true)
      const session = (await sessionResp.json()).data.session
      expect(session.remaining_maps.length).toBe(session.map_pool.length - 2)
      expect(session.current_action_number).toBe(3)
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })
})
