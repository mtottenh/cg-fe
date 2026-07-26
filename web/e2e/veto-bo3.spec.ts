import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { getAdminToken } from './fixtures/auth.fixture'
import {
  createCheckInScenario,
  checkInViaApi,
  getMatch,
  primeAuthStorage,
  type CheckInScenario,
} from './fixtures/checkin.fixture'
import {
  setupVetoScenario,
  startVetoAndFlipCoin,
  performVetoAction,
  actOnMapViaUi,
} from './fixtures/veto.fixture'

/**
 * WebSocket map-veto E2E for the **bo3** format.
 *
 * The bo1 specs (veto-realtime / veto-flow) only exercise *bans*. Bo3 adds
 * PICK actions and a picked-map side selection, which render and behave
 * differently. Format (CS2 plugin, api/.../games/cs2/mod.rs):
 *
 *   bo3_veto = Ban-Ban-Pick-Pick-Ban-Ban-Decider
 *
 * Everything below was verified against the running backend before it was
 * asserted here:
 *
 *  - A 7-map pool completes bo3 after **6** actions (4 bans + 2 picks). The
 *    trailing "Decider" step in the format never materialises as an action
 *    (`is_complete_at(n) == n >= sequence.len()` fires on the 6th action),
 *    so `selected_maps` has length 2 and the match stays in `pick_ban`.
 *    This mirrors the backend's own `test_ws_full_bo3_veto_flow`, which
 *    asserts exactly 2 selected maps.
 *  - The default `side_selection_mode` resolves to `knife` (the game-id →
 *    plugin lookup misses), so picked maps get no side. The create-session
 *    endpoint accepts an explicit mode, so the side tests request one.
 *  - In `coin_flip` mode the backend auto-assigns a random side ("ct"/"t")
 *    to each pick the instant it is made — this is the only side path that
 *    round-trips cleanly to a recorded value, so the "side reflected on both
 *    clients + backend" assertion uses it.
 *  - In `picker_choice` mode the VetoSideSelect control renders on both
 *    clients and the side is chosen by the OPPONENT of the team that picked
 *    the map (standard CS convention): the OPPONENT is offered the CT/T
 *    buttons, the picker is shown a waiting chip, and POST /veto/side accepts
 *    the write from the opponent's token, recording the side attributed to the
 *    opponent.
 *
 *    Both layers now agree. The handler resolves the picker's opponent and
 *    authorizes against it (api/crates/portal-api/src/handlers/veto.rs:452-465)
 *    and the domain rejects the picker with NotAuthorized
 *    ("The opponent of the picker selects the side",
 *    api/crates/portal-domain/src/services/tournament/veto.rs:507-512).
 *    `VetoSideSelect.canSelectSide` used to offer the buttons to the PICKER,
 *    which made the whole step unreachable — the only client with a control
 *    got a 403 and the client the API accepts had none. It was corrected to
 *    the opponent (COVERAGE-PLAN.md §9b P-7), so the side write below is now
 *    driven by clicking the real button.
 *
 * UI selectors (verified in web/src/components/GameMapCard.vue + veto/*.vue):
 *   .map-card-selectable  clickable available map
 *   .map-card-banned      status === 'banned'
 *   .map-card-picked      status === 'picked' | 'decider'
 *   "Your turn!" / "Ban a map" / "Pick a map"   turn prompt (VetoPanel)
 *   "Side Selection" + CT/T buttons                  VetoSideSelect (opponent)
 *   "Waiting for your opponent to select a side..."  VetoSideSelect (picker)
 *   .v-timeline chip with the side              VetoTimeline
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

interface VetoActionRecord {
  action_number: number
  action_type: string
  map_id: string
  side_selection?: string
  performed_by_registration_id?: string
  side_selected_by_registration_id?: string
}

interface VetoStateData {
  session: {
    status: string
    selected_maps: string[]
    remaining_maps: string[]
    map_pool: string[]
    current_team_turn?: string
  }
  maps: Array<{ map_id: string; status: string }>
  actions: VetoActionRecord[]
}

/** Full veto state (data.actions lives here, not on data.session). */
async function getVetoState(token: string, matchId: string): Promise<VetoStateData> {
  const resp = await fetch(`${API_URL}/v1/matches/${matchId}/veto`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) {
    throw new Error(`Get veto state failed (${resp.status}): ${await resp.text()}`)
  }
  return (await resp.json()).data as VetoStateData
}

/**
 * Bo3 setup with an explicit side-selection mode. The shared fixture's
 * `setupVetoScenario` can't request a side mode, so this replicates its flow
 * (session created BEFORE both check-ins → auto-advance lands on pick_ban)
 * while POSTing the session with `side_selection_mode`.
 */
async function setupBo3WithSideMode(
  request: APIRequestContext,
  adminToken: string,
  sideMode: string,
): Promise<CheckInScenario> {
  const scenario = await createCheckInScenario(request, adminToken, { checkInRequired: true })

  const resp = await fetch(`${API_URL}/v1/matches/${scenario.matchId}/veto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ veto_format_id: 'bo3_veto', side_selection_mode: sideMode }),
  })
  if (!resp.ok) {
    throw new Error(`Create bo3 veto (${sideMode}) failed (${resp.status}): ${await resp.text()}`)
  }

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

/**
 * The page on turn performs the current map action via the UI (click a
 * selectable card), then BOTH pages are asserted to reflect the new banned /
 * picked totals live over the veto WebSocket (no reload).
 */
async function actOnTurnUi(
  actingPage: Page,
  waitingPage: Page,
  expectBanned: number,
  expectPicked: number,
): Promise<void> {
  await expect(actingPage.getByText('Your turn!')).toBeVisible({ timeout: 15000 })
  await actOnMapViaUi(actingPage)

  for (const page of [actingPage, waitingPage]) {
    await expect(page.locator('.map-card-banned')).toHaveCount(expectBanned, { timeout: 15000 })
    await expect(page.locator('.map-card-picked')).toHaveCount(expectPicked, { timeout: 15000 })
  }
}

test.describe('Map Veto (bo3) — picks + side selection over WebSocket', () => {
  test.describe.configure({ timeout: 120000 })

  test('drives the full Ban-Ban-Pick-Pick-Ban-Ban sequence, picks render PICKED (not banned) live on both clients', async ({
    browser,
    request,
  }) => {
    const adminToken = await getAdminToken()
    const scenario = await setupVetoScenario(request, adminToken, { vetoFormatId: 'bo3_veto' })
    const matchUrl = `/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`

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

      // P1 opens by banning — the prompt reads "Ban a map".
      await expect(pageA.getByText('Your turn!')).toBeVisible({ timeout: 10000 })
      await expect(pageA.getByText(/Ban a map/i)).toBeVisible({ timeout: 10000 })

      // Action 1 (ban, P1) and Action 2 (ban, P2).
      await actOnTurnUi(pageA, pageB, 1, 0)
      await actOnTurnUi(pageB, pageA, 2, 0)

      // Action 3 is a PICK — the turn prompt changes to "Pick a map" (a
      // different UI treatment than a ban), and the map lands as PICKED
      // (green .map-card-picked), NOT banned, live on BOTH clients.
      // (Only the acting client's own prompt is asserted: VetoPanel derives
      // the label from an off-by-one current-action index after a WS update,
      // so the *waiting* client's prompt is not a reliable pick/ban signal —
      // the card colour, asserted below, is the authoritative one.)
      await expect(pageA.getByText('Your turn!')).toBeVisible({ timeout: 15000 })
      await expect(pageA.getByText(/Pick a map/i)).toBeVisible({ timeout: 15000 })
      await actOnTurnUi(pageA, pageB, 2, 1)

      // Action 4 (pick, P2): a second PICKED map, still exactly 2 banned.
      await actOnTurnUi(pageB, pageA, 2, 2)

      // Action 5 (ban, P1) via the UI — banned climbs to 3.
      await actOnTurnUi(pageA, pageB, 3, 2)

      // Action 6 (final ban) is driven via the API. The UI can't perform it:
      // because of the off-by-one current-action index, VetoPanel reads the
      // trailing decider step and computes a `side_select` phase, which
      // disables the map grid for the acting client. Driving it over the API
      // still exercises the WS completion path — both clients flip to the
      // "Veto complete!" state live via the VetoComplete broadcast, no reload.
      await expect(pageB.getByText('Your turn!')).toBeVisible({ timeout: 15000 })
      const pre = await getVetoState(adminToken, scenario.matchId)
      const turnReg = pre.session.current_team_turn
      const turnToken =
        turnReg === scenario.p1.registrationId ? scenario.p1.token : scenario.p2.token
      await performVetoAction(turnToken, scenario.matchId, pre.session.remaining_maps[0])

      await expect(pageA.getByText(/Veto complete/i)).toBeVisible({ timeout: 15000 })
      await expect(pageB.getByText(/Veto complete/i)).toBeVisible({ timeout: 15000 })

      // Backend agrees: bo3 over a 7-map pool = 4 bans + 2 picks, session
      // completed, exactly 2 maps selected for play.
      const state = await getVetoState(adminToken, scenario.matchId)
      expect(state.session.status).toBe('completed')
      const bans = state.actions.filter((a) => a.action_type === 'ban')
      const picks = state.actions.filter((a) => a.action_type === 'pick')
      expect(bans.length).toBe(4)
      expect(picks.length).toBe(2)
      expect(state.session.selected_maps.length).toBe(2)
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })

  test('after a PICK the OPPONENT picks the side through the UI; the choice reflects live on both clients (picker_choice)', async ({
    browser,
    request,
  }) => {
    const adminToken = await getAdminToken()
    const scenario = await setupBo3WithSideMode(request, adminToken, 'picker_choice')
    const matchUrl = `/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`

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

      // Advance past the two opening bans (P1, then P2) via the UI.
      await actOnTurnUi(pageA, pageB, 1, 0)
      await actOnTurnUi(pageB, pageA, 2, 0)

      // P1 makes the first PICK via the UI.
      await expect(pageA.getByText('Your turn!')).toBeVisible({ timeout: 15000 })
      await expect(pageA.getByText(/Pick a map/i)).toBeVisible({ timeout: 15000 })
      await actOnMapViaUi(pageA)
      await expect(pageA.locator('.map-card-picked')).toHaveCount(1, { timeout: 15000 })
      await expect(pageB.locator('.map-card-picked')).toHaveCount(1, { timeout: 15000 })

      // The VetoSideSelect control now renders live on BOTH clients over the
      // WebSocket (no reload): exactly one client is offered the CT/T buttons,
      // the other is told to wait — and it is the OPPONENT of the picker (P2 /
      // pageB) who is offered them, matching the only role the API authorizes.
      await expect(pageA.getByText('Side Selection')).toBeVisible({ timeout: 15000 })
      await expect(pageB.getByText('Side Selection')).toBeVisible({ timeout: 15000 })

      const ctButton = (p: Page) => p.getByRole('button', { name: 'CT', exact: true })
      const tButton = (p: Page) => p.getByRole('button', { name: 'T', exact: true })
      const waitingChip = (p: Page) => p.getByText(/Waiting for .+ side/i)

      await expect
        .poll(async () => (await ctButton(pageA).count()) + (await ctButton(pageB).count()), {
          timeout: 15000,
        })
        .toBe(1)
      expect((await tButton(pageA).count()) + (await tButton(pageB).count())).toBe(1)
      // P1 picked action 3, so P2 is the opponent and owns the control. P1 —
      // the picker — sees the waiting chip instead. Asserting the role (not
      // just "exactly one client") is what makes the P-7 inversion fail here.
      await expect(ctButton(pageB)).toBeVisible({ timeout: 15000 })
      expect(await ctButton(pageA).count()).toBe(0)
      await expect(
        pageA.getByText('Waiting for your opponent to select a side...'),
      ).toBeVisible({ timeout: 15000 })
      expect(await waitingChip(pageB).count()).toBe(0)

      const preSide = await getVetoState(adminToken, scenario.matchId)
      const pickAction = preSide.actions.find((a) => a.action_type === 'pick')
      expect(pickAction, 'a pick action should exist before side selection').toBeTruthy()

      // Perform the side selection through the REAL control, on the client the
      // API accepts: the opponent clicks CT. A 403 (the pre-fix behaviour on
      // either client) surfaces as an error snackbar and no recorded side.
      await ctButton(pageB).click()
      await expect(pageB.locator('.v-snackbar').getByText('Selected CT side')).toBeVisible({
        timeout: 15000,
      })

      // Backend records the side, attributed to the opponent (P2), not the picker.
      await expect
        .poll(
          async () => {
            const s = await getVetoState(adminToken, scenario.matchId)
            return s.actions.find((a) => a.action_number === pickAction!.action_number)
              ?.side_selection
          },
          { timeout: 15000 },
        )
        .toBe('ct')
      const postSide = await getVetoState(adminToken, scenario.matchId)
      const recordedPick = postSide.actions.find(
        (a) => a.action_number === pickAction!.action_number,
      )
      expect(recordedPick!.side_selection).toBe('ct')
      expect(recordedPick!.side_selected_by_registration_id).toBe(scenario.p2.registrationId)

      // The recorded side reflects live on BOTH clients over the WebSocket
      // (no reload): the veto history timeline shows the CT chip.
      await expect(pageA.locator('.v-timeline').getByText('CT', { exact: true })).toBeVisible({
        timeout: 15000,
      })
      await expect(pageB.locator('.v-timeline').getByText('CT', { exact: true })).toBeVisible({
        timeout: 15000,
      })
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })

  test('a picked map’s side is recorded and reflected on both clients live (coin_flip auto-assign)', async ({
    browser,
    request,
  }) => {
    const adminToken = await getAdminToken()
    const scenario = await setupBo3WithSideMode(request, adminToken, 'coin_flip')
    const matchUrl = `/tournaments/${scenario.tournamentSlug}/matches/${scenario.matchId}`

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

      // Two opening bans, then P1's first PICK — all via the UI.
      await actOnTurnUi(pageA, pageB, 1, 0)
      await actOnTurnUi(pageB, pageA, 2, 0)
      await expect(pageA.getByText('Your turn!')).toBeVisible({ timeout: 15000 })
      await actOnMapViaUi(pageA)
      await expect(pageA.locator('.map-card-picked')).toHaveCount(1, { timeout: 15000 })
      await expect(pageB.locator('.map-card-picked')).toHaveCount(1, { timeout: 15000 })

      // The backend auto-assigns a side to the pick in coin_flip mode — the
      // action record carries a concrete "ct"/"t".
      const state = await getVetoState(adminToken, scenario.matchId)
      const pick = state.actions.find((a) => a.action_type === 'pick')
      expect(pick, 'a pick action should exist').toBeTruthy()
      const side = pick!.side_selection
      expect(['ct', 't'], 'coin_flip should auto-assign a concrete side').toContain(side)

      // That same side is reflected on BOTH clients live: the veto history
      // timeline shows the side chip (CT|T) without any reload.
      const sideUpper = side!.toUpperCase()
      await expect(
        pageA.locator('.v-timeline').getByText(sideUpper, { exact: true }),
      ).toBeVisible({ timeout: 15000 })
      await expect(
        pageB.locator('.v-timeline').getByText(sideUpper, { exact: true }),
      ).toBeVisible({ timeout: 15000 })
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })
})
