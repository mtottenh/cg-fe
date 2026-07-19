import { test, expect, type Page } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import {
  setupVetoScenario,
  getVetoSession,
  performVetoAction,
} from './fixtures/veto.fixture'
import {
  getMatch,
  primeAuthStorage,
  createTestUser,
} from './fixtures/checkin.fixture'

/**
 * Extended real-time map-veto coverage over the veto WebSocket.
 *
 * Builds on `veto-realtime.spec.ts` (two isolated browser contexts watching
 * the same match page) and adds three scenarios:
 *
 *  1. A full bo1 ban sequence driven entirely through the UI, all the way to
 *     completion, asserting every ban propagates live to BOTH clients.
 *  2. A late-joining participant whose board renders the CURRENT state on
 *     first load (the REST on-connect snapshot), then keeps updating live.
 *  3. A non-participant spectator who receives live board updates but has no
 *     actionable controls.
 *
 * Backend facts these tests are written against (verified in
 * api/crates/portal-domain/src/services/tournament/veto.rs and
 * api/crates/portal-api/src/handlers/veto_ws.rs):
 *
 *  - bo1 = ban until one map remains; the backend auto-chains the final
 *    "decider" action, so the LAST human ban returns `veto_complete=true` and
 *    the lobby receives a single `VetoComplete` broadcast (not a per-ban
 *    `VetoActionPerformed`). The client's `applyVetoComplete` flips the phase
 *    to completed but does not repaint the map grid, so the fully-resolved
 *    board (6 banned + 1 decider) is asserted after a reload, which exercises
 *    the REST snapshot path.
 *  - When the veto completes the veto SESSION becomes `completed`, but the
 *    MATCH is NOT auto-advanced — it stays in `pick_ban` (there is no
 *    veto->in_progress transition; moving it on requires a separate admin
 *    action). So `getMatch` still reports `pick_ban` here.
 *  - Any authenticated user may open the veto WS. Participants get the
 *    participant role; a user on neither team (and without admin) defaults to
 *    the spectator role and still receives all public veto broadcasts.
 *  - The WS `auth_success` payload carries `session: None`; the current board
 *    for a late joiner comes from the REST `GET /v1/matches/{id}/veto`
 *    snapshot, with the WS used only for subsequent deltas.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

/** Full REST veto state including per-map status + display name. */
interface VetoStateMap {
  map_id: string
  map_name: string
  status: string
}

async function getVetoMaps(token: string, matchId: string): Promise<VetoStateMap[]> {
  const resp = await fetch(`${API_URL}/v1/matches/${matchId}/veto`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) {
    throw new Error(`Get veto state failed (${resp.status}): ${await resp.text()}`)
  }
  return (await resp.json()).data.maps as VetoStateMap[]
}

/**
 * Wait until exactly one of the two pages shows the "Your turn!" indicator,
 * and return that page. Polls so it tolerates the brief window after a ban
 * where the turn has flipped away from one page but not yet arrived at the
 * other over the WS.
 */
async function pageOnTurn(pageA: Page, pageB: Page): Promise<Page> {
  let acting: Page | null = null
  await expect(async () => {
    const aTurn = await pageA.getByText('Your turn!').isVisible()
    const bTurn = await pageB.getByText('Your turn!').isVisible()
    expect(aTurn !== bTurn, 'exactly one page should be on turn').toBe(true)
    acting = aTurn ? pageA : pageB
  }).toPass({ timeout: 15000 })
  return acting!
}

test.describe('Map Veto Real-time (full sequence, late-join, spectator)', () => {
  test.describe.configure({ timeout: 120_000 })

  test('bo1: full ban sequence to completion propagates live to both clients', async ({
    browser,
    request,
  }) => {
    const adminToken = await getAdminToken()
    const scenario = await setupVetoScenario(request, adminToken)
    const matchUrl = `/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`

    // How many bans until the decider remains (bo1: pool - 1).
    const initial = await getVetoSession(scenario.p1.token, scenario.matchId)
    const poolSize = initial.map_pool.length
    const totalBans = poolSize - 1
    expect(poolSize, 'bo1 needs a real map pool').toBeGreaterThan(1)

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

      await expect(pageA.getByText('Map Veto')).toBeVisible({ timeout: 10000 })
      await expect(pageB.getByText('Map Veto')).toBeVisible({ timeout: 10000 })
      // p1 (pageA) acts first per the coin flip in setupVetoScenario.
      await expect(pageA.getByText('Your turn!')).toBeVisible({ timeout: 10000 })

      // Drive the ENTIRE veto through the UI.
      for (let i = 0; i < totalBans; i++) {
        const acting = await pageOnTurn(pageA, pageB)
        const other = acting === pageA ? pageB : pageA

        if (i === totalBans - 1) {
          // Final ban. The client's LIVE update path advances current_action
          // with an off-by-one (`applyActionPerformed` uses
          // `sequence[current_action_number]` rather than `[... - 1]`), which
          // by the last step mislabels the ban as a side-select phase — so the
          // map grid is not clickable live (the earlier bans are driven by the
          // map-status array, which is unaffected, hence they click fine). A
          // reload pulls the correct board from the REST snapshot; we then
          // click the final ban and assert the OTHER client — never reloaded
          // here — flips to completed LIVE over the VetoComplete broadcast.
          await acting.reload()
          await acting.waitForLoadState('networkidle')
          await expect(acting.getByText('Your turn!')).toBeVisible({ timeout: 15000 })
          const lastCard = acting.locator('.map-card-selectable').first()
          await expect(lastCard).toBeVisible({ timeout: 15000 })
          await lastCard.click()

          // The backend auto-chains the decider and broadcasts VetoComplete.
          await expect(other.getByText('Veto complete!')).toBeVisible({ timeout: 15000 })
          await expect(acting.getByText('Veto complete!')).toBeVisible({ timeout: 15000 })
          await expect(other.getByText('Your turn!')).toHaveCount(0)
          await expect(acting.getByText('Your turn!')).toHaveCount(0)
          break
        }

        const card = acting.locator('.map-card-selectable').first()
        await expect(card).toBeVisible({ timeout: 15000 })
        await card.click()

        const expected = i + 1
        // The ban lands on BOTH boards live — no reload. The clicking page
        // reflects it via the same broadcast it receives back.
        await expect(acting.locator('.map-card-banned')).toHaveCount(expected, {
          timeout: 15000,
        })
        await expect(other.locator('.map-card-banned')).toHaveCount(expected, {
          timeout: 15000,
        })
        // Turn flips live to the other client.
        await expect(other.getByText('Your turn!')).toBeVisible({ timeout: 15000 })
        await expect(acting.getByText(/Waiting for opponent/i)).toBeVisible({
          timeout: 15000,
        })
      }

      // ── Cross-check the backend ────────────────────────────────────────
      const finalSession = await getVetoSession(scenario.p1.token, scenario.matchId)
      expect(finalSession.status).toBe('completed')
      // bo1: exactly one map survives — the decider.
      expect(finalSession.remaining_maps.length).toBe(1)
      const deciderId = finalSession.remaining_maps[0]

      const maps = await getVetoMaps(scenario.p1.token, scenario.matchId)
      const deciderMap = maps.find((m) => m.map_id === deciderId)
      expect(deciderMap, 'decider map must be present in the veto state').toBeTruthy()
      // The backend represents a bo1 decider as the sole SURVIVING (un-banned)
      // map, not as a separate "picked" status: every other map is banned and
      // the decider is the single remaining one.
      const bannedInState = maps.filter((m) => m.status === 'banned')
      expect(bannedInState.length).toBe(totalBans)
      expect(deciderMap!.status).not.toBe('banned')

      // The match itself is NOT auto-advanced by veto completion — it stays in
      // pick_ban (a veto->in_progress move requires a separate admin action).
      const match = await getMatch(request, adminToken, scenario.tournamentId, scenario.matchId)
      expect(match.status).toBe('pick_ban')

      // ── Fully-resolved board on both clients (REST snapshot after reload) ─
      // The live VetoComplete broadcast flips the phase but does not repaint
      // the map grid for the final ban; reloading pulls the persisted board so
      // both clients show every loser banned and the decider — matching the
      // backend decider id — presented as the one map that is NOT banned.
      await pageA.reload()
      await pageB.reload()
      await pageA.waitForLoadState('networkidle')
      await pageB.waitForLoadState('networkidle')

      for (const p of [pageA, pageB]) {
        await expect(p.getByText('Map Veto')).toBeVisible({ timeout: 10000 })
        await expect(p.getByText('Veto complete!')).toBeVisible({ timeout: 10000 })
        await expect(p.locator('.map-card-banned')).toHaveCount(totalBans, { timeout: 15000 })
        // The decider (by backend map name) is the single card that is not banned.
        const deciderCard = p.locator('.map-card', { hasText: deciderMap!.map_name })
        await expect(deciderCard).toHaveCount(1)
        await expect(deciderCard).not.toHaveClass(/map-card-banned/)
      }
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })

  test('late join: board renders current state from the on-connect snapshot', async ({
    browser,
    request,
  }) => {
    const adminToken = await getAdminToken()
    const scenario = await setupVetoScenario(request, adminToken)
    const matchUrl = `/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`

    // Perform 3 bans purely over the API (no browser yet), alternating
    // p1 -> p2 -> p1, verifying the turn before each via getVetoSession.
    const bansBeforeJoin = 3
    for (let i = 0; i < bansBeforeJoin; i++) {
      const st = await getVetoSession(scenario.p1.token, scenario.matchId)
      const turnReg = st.current_team_turn as string
      const expectedReg =
        i % 2 === 0 ? scenario.p1.registrationId : scenario.p2.registrationId
      expect(turnReg, `ban #${i + 1} should be ${expectedReg}'s turn`).toBe(expectedReg)
      const token =
        turnReg === scenario.p1.registrationId ? scenario.p1.token : scenario.p2.token
      await performVetoAction(token, scenario.matchId, st.remaining_maps[0])
    }

    // Sanity: backend now shows exactly 3 bans and it is p2's turn next
    // (p1, p2, p1 done -> p2 to act).
    const afterBans = await getVetoSession(scenario.p1.token, scenario.matchId)
    expect(afterBans.status).not.toBe('completed')
    expect(afterBans.map_pool.length - afterBans.remaining_maps.length).toBe(bansBeforeJoin)
    expect(afterBans.current_team_turn as string).toBe(scenario.p2.registrationId)

    // ONLY NOW open a browser as a participant and load the match page.
    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      await primeAuthStorage(page, scenario.p1.token, scenario.p1.userId)
      await page.goto(matchUrl)
      await page.waitForLoadState('networkidle')

      await expect(page.getByText('Map Veto')).toBeVisible({ timeout: 10000 })
      // First load already shows the CURRENT board — the 3 prior bans — proving
      // the REST on-connect snapshot delivers current state, not just future
      // broadcasts.
      await expect(page.locator('.map-card-banned')).toHaveCount(bansBeforeJoin, {
        timeout: 10000,
      })

      // One more ban (it is the opponent's turn) must still arrive live.
      const st = await getVetoSession(scenario.p1.token, scenario.matchId)
      expect(st.current_team_turn as string).toBe(scenario.p2.registrationId)
      await performVetoAction(scenario.p2.token, scenario.matchId, st.remaining_maps[0])

      await expect(page.locator('.map-card-banned')).toHaveCount(bansBeforeJoin + 1, {
        timeout: 15000,
      })
    } finally {
      await context.close()
    }
  })

  test('spectator: non-participant sees live updates but has no controls', async ({
    browser,
    request,
  }) => {
    const adminToken = await getAdminToken()
    const scenario = await setupVetoScenario(request, adminToken)
    const matchUrl = `/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`

    // A fresh authenticated user who is NOT registered in this match. The veto
    // WS defaults such users to the spectator role (read-only, public feed).
    const spectator = await createTestUser()

    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      await primeAuthStorage(page, spectator.token, spectator.userId)
      await page.goto(matchUrl)
      await page.waitForLoadState('networkidle')

      await expect(page.getByText('Map Veto')).toBeVisible({ timeout: 10000 })

      // Read-only: no selectable map cards, no turn prompt — the spectator is
      // not a participant so nothing is actionable for them.
      await expect(page.locator('.map-card-banned')).toHaveCount(0, { timeout: 10000 })
      await expect(page.locator('.map-card-selectable')).toHaveCount(0)
      await expect(page.getByText('Your turn!')).toHaveCount(0)

      // A participant bans (driven over the API). The spectator's board updates
      // live over the WS — no reload.
      const st = await getVetoSession(scenario.p1.token, scenario.matchId)
      expect(st.current_team_turn as string).toBe(scenario.p1.registrationId)
      await performVetoAction(scenario.p1.token, scenario.matchId, st.remaining_maps[0])

      await expect(page.locator('.map-card-banned')).toHaveCount(1, { timeout: 15000 })

      // Still no controls after the live update.
      await expect(page.locator('.map-card-selectable')).toHaveCount(0)
      await expect(page.getByText('Your turn!')).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
})
