/**
 * Shared map-veto e2e helpers.
 *
 * Drives the veto lifecycle over the real API: create session, start +
 * coin-flip, perform ban/pick actions, select sides, and read session
 * state. The WebSocket broadcast path (backend → ws → store → re-render)
 * is exercised by the specs that open browser pages against a match; these
 * helpers cover the API-side setup and assertions.
 *
 * Formats (CS2 plugin, api/.../games/cs2/mod.rs):
 *   bo1_veto — Ban…Ban-Decider
 *   bo3_veto — Ban-Ban-Pick-Pick-Ban-Ban-Decider (has Pick actions)
 *   bo5_veto — Ban-Ban-Pick-Pick-Pick-Pick-Decider
 */
import { expect, type APIRequestContext, type Page } from '@playwright/test'
import {
  createCheckInScenario,
  checkInViaApi,
  getMatch,
  type CheckInScenario,
} from './checkin.fixture'

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

/** Loosely typed veto session — assert on the fields you need.
 *  NOTE (P-86): `status` stays `string` — the veto session status enum is not
 *  declared in the spec, so there is no generated union. P-31 remnant; see §4-G. */
export interface VetoSession {
  id: string
  status: string
  map_pool: string[]
  remaining_maps: string[]
  /** Picks and the decider, in game order. */
  selected_maps: string[]
  current_action_number: number
  actions?: Array<Record<string, unknown>>
  [key: string]: unknown
}

/** Create a veto session for a match (defaults to the bo1 format). */
export async function createVetoSession(
  adminToken: string,
  matchId: string,
  vetoFormatId = 'bo1_veto',
): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/matches/${matchId}/veto`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ veto_format_id: vetoFormatId }),
  })
  if (!resp.ok) {
    throw new Error(`Create veto session failed (${resp.status}): ${await resp.text()}`)
  }
}

/** Start the veto and record the coin flip so a known side goes first. */
export async function startVetoAndFlipCoin(
  adminToken: string,
  matchId: string,
  winnerRegistrationId: string,
  winnerGoesFirst = true,
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
      winner_goes_first: winnerGoesFirst,
    }),
  })
  if (!coinResp.ok) {
    throw new Error(`Coin flip failed (${coinResp.status}): ${await coinResp.text()}`)
  }
}

/** Fetch the current veto session for a match. */
export async function getVetoSession(token: string, matchId: string): Promise<VetoSession> {
  const resp = await fetch(`${API_URL}/v1/matches/${matchId}/veto`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) {
    throw new Error(`Get veto session failed (${resp.status}): ${await resp.text()}`)
  }
  return (await resp.json()).data.session as VetoSession
}

/**
 * Perform a ban or pick (the current action's type decides which) as the
 * player whose turn it is. `token` must belong to the participant on turn.
 */
export async function performVetoAction(
  token: string,
  matchId: string,
  mapId: string,
): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/matches/${matchId}/veto/action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ map_id: mapId }),
  })
  if (!resp.ok) {
    throw new Error(`Veto action (${mapId}) failed (${resp.status}): ${await resp.text()}`)
  }
}

/** Select a side (e.g. "ct"/"t") for a picked map's action number. */
export async function selectSide(
  token: string,
  matchId: string,
  actionNumber: number,
  side: string,
): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/matches/${matchId}/veto/side`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action_number: actionNumber, side }),
  })
  if (!resp.ok) {
    throw new Error(`Select side failed (${resp.status}): ${await resp.text()}`)
  }
}

/** Options for {@link setupVetoScenario}. */
export interface VetoScenarioOptions {
  /** Veto format id (default `bo1_veto`). */
  vetoFormatId?: string
}

/**
 * Full API-driven setup: a checked-in match sitting in `pick_ban`, veto in
 * the banning phase with p1 to act first. Mirrors the flow the veto specs
 * relied on: the session is created BEFORE both check-ins so the
 * auto-advance lands on `pick_ban` rather than `in_progress`.
 */
export async function setupVetoScenario(
  request: APIRequestContext,
  adminToken: string,
  opts: VetoScenarioOptions = {},
): Promise<CheckInScenario> {
  const scenario = await createCheckInScenario(request, adminToken, {
    checkInRequired: true,
  })

  await createVetoSession(adminToken, scenario.matchId, opts.vetoFormatId)

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
 * Ban or pick a map through the UI.
 *
 * The map grid is a two-step interaction: the first click arms the map
 * (bans/picks are irreversible and timed, so a stray click must not commit
 * one), and an explicit "Confirm" button performs the action. Specs call
 * this instead of clicking a card directly.
 *
 * Returns the display name of the map that was acted on.
 */
export async function actOnMapViaUi(page: Page, index = 0): Promise<string> {
  const card = page.locator('.map-card-selectable').nth(index)
  await expect(card).toBeVisible({ timeout: 15000 })
  const mapName = (await card.locator('.text-caption').first().innerText()).trim()

  await card.click()

  const confirm = page.getByTestId('veto-confirm-action')
  await expect(confirm).toBeVisible({ timeout: 10000 })
  await confirm.click()
  await expect(confirm).toHaveCount(0, { timeout: 15000 })

  return mapName
}
