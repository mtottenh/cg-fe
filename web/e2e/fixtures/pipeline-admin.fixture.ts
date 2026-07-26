import { uniqueId, CS2_MAP_POOL } from './test-data'
import { createCheckInScenario, createTestUser, type ParticipantToken } from './checkin.fixture'
import {
  awardsStatsBody,
  catalogDemo,
  getCs2Game,
  submitDemoStats,
  uniqueSteamId,
  setSteamId,
} from './awards.fixture'

/**
 * Admin ingestion-pipeline helpers (P-73 / P-64 / P-68).
 *
 * Every precondition here is seeded over the API; the operator actions under
 * test — reading the pipeline dashboard, running the auto-link backfill,
 * overriding a rating — are driven through `/admin/pipeline` by the spec.
 *
 * What is deliberately NOT seeded: a *failing* Steam poll or an enrichment
 * failure. Both are written only by `PATCH /v1/internal/steam-tracking/{id}/
 * poll-result` and `POST /v1/internal/discovered-matches/{id}/failed`, which
 * are `X-API-Key` service routes with no key in the e2e stack. The reachable
 * upstream signal is a token the poller has never touched, which is the same
 * class of stoppage and is asserted exactly; the failure-list rendering is
 * covered at the API level by `demos::test_pipeline_overview_reports_every_stage`.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

async function jsonOrThrow<T>(response: Response, context: string): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${context} failed (${response.status}): ${text}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

function authHeaders(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

// =============================================================================
// Pipeline reads (API cross-checks)
// =============================================================================

export interface PipelineOverview {
  game_slug: string | null
  tracking: {
    total: number
    active: number
    inactive: number
    with_errors: number
    never_polled: number
    stale: number
    stale_after_hours: number
    last_poll_at: string | null
  }
  discovered_matches: {
    pending: number
    enriching: number
    enriched: number
    failed: number
    retry_exhausted: number
  }
  demos: {
    pending: number
    processing: number
    ready: number
    failed: number
    archived: number
  }
  auto_link_enabled: boolean
}

export interface TrackingHealthEntry {
  id: string
  player_id: string
  player_display_name: string
  game_slug: string
  steam_id_64: string
  is_active: boolean
  poll_errors: number
  last_poll_at: string | null
  last_error: string | null
  has_share_code: boolean
}

export async function getPipelineOverview(
  token: string,
  game?: string,
): Promise<PipelineOverview> {
  const qs = game ? `?game=${encodeURIComponent(game)}` : ''
  const resp = await fetch(`${API_URL}/v1/admin/pipeline/overview${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await jsonOrThrow<{ data: PipelineOverview }>(resp, 'Pipeline overview')
  return body.data
}

/** Raw response, for the gate assertions (which need the status, not the body). */
export async function pipelineReadStatus(token: string | null, path: string): Promise<number> {
  const resp = await fetch(`${API_URL}/v1/admin/pipeline/${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  return resp.status
}

export async function getTrackingHealth(
  token: string,
  game?: string,
): Promise<TrackingHealthEntry[]> {
  const qs = game ? `?game=${encodeURIComponent(game)}&limit=200` : '?limit=200'
  const resp = await fetch(`${API_URL}/v1/admin/pipeline/tracking${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await jsonOrThrow<{ data: TrackingHealthEntry[] }>(resp, 'Tracking health')
  return body.data ?? []
}

/** The raw JSON body, so a test can assert what is *not* in it. */
export async function getTrackingHealthRaw(token: string): Promise<string> {
  const resp = await fetch(`${API_URL}/v1/admin/pipeline/tracking?limit=200`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return resp.text()
}

// =============================================================================
// P-64: a demo the auto-linker could not link at ingest
// =============================================================================

export interface BackfillScenario {
  tournamentId: string
  matchId: string
  gameId: string
  demoId: string
  p1: ParticipantToken
  p2: ParticipantToken
}

/** Create a published CS2 individual tournament with registration open. */
async function createCs2Tournament(adminToken: string, gameId: string): Promise<string> {
  const suffix = uniqueId()
  const resp = await fetch(`${API_URL}/v1/tournaments`, {
    method: 'POST',
    headers: authHeaders(adminToken),
    body: JSON.stringify({
      name: `E2E Pipeline Tournament ${suffix}`,
      slug: `e2e-pipeline-${suffix}`,
      game_id: gameId,
      format: 'single_elimination',
      map_pool: CS2_MAP_POOL,
      participant_type: 'individual',
      min_participants: 2,
      max_participants: 4,
      check_in_required: false,
    }),
  })
  const created = await jsonOrThrow<{ data: { id: string } }>(resp, 'Create pipeline tournament')
  for (const action of ['publish', 'open-registration']) {
    const r = await fetch(`${API_URL}/v1/tournaments/${created.data.id}/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    if (!r.ok) throw new Error(`${action} failed (${r.status}): ${await r.text()}`)
  }
  return created.data.id
}

/**
 * Seed exactly the case the backfill exists for: a demo with stats, sitting
 * next to a match it *should* link to, which the ingest-time auto-link pass
 * could not link.
 *
 * The auto-linker scores candidates by Steam-ID overlap between the demo's
 * `player_summaries` and the match participants' `players.steam_id`
 * (`services/demo.rs try_auto_link`). Stats are therefore submitted BEFORE the
 * two players link their Steam accounts: overlap is 0, so no link is made, and
 * the demo lands in `find_ready_unlinked`. The Steam IDs are then set, which
 * makes the same pass score 1.0 — but only when someone re-runs it.
 *
 * This shape was chosen over "disable auto-linking, submit, re-enable" (the
 * other way to reach an unlinked demo) precisely because it mutates nothing
 * global: the auto-link setting is one shared row that every concurrently
 * running spec reads.
 */
export async function createBackfillScenario(adminToken: string): Promise<BackfillScenario> {
  const game = await getCs2Game()
  const tournamentId = await createCs2Tournament(adminToken, game.id)

  // Far-future, randomised: the candidate window is scheduled_at ±24h, so this
  // keeps other specs' matches out of the running (same reasoning as
  // `awards.fixture.createAwardsScenario`).
  const scheduleAt = new Date(
    Date.now() + (10 + Math.floor(Math.random() * 300)) * 24 * 60 * 60 * 1000,
  ).toISOString()

  const scenario = await createCheckInScenario(undefined, adminToken, {
    tournamentId,
    checkInRequired: false,
    scheduleAt,
  })

  const p1SteamId = uniqueSteamId()
  const p2SteamId = uniqueSteamId()

  const demoFile = `e2e-pipeline-backfill-${uniqueId()}.dem`
  const demoId = await catalogDemo(adminToken, game.id, demoFile)
  const demo = await submitDemoStats(
    adminToken,
    demoId,
    awardsStatsBody(
      [
        { steamId: p1SteamId, playerName: 'Player1', kills: 20, headshotKills: 10, mag7Kills: 2 },
        { steamId: p2SteamId, playerName: 'Player2', kills: 11, headshotKills: 4, mag7Kills: 0 },
      ],
      scheduleAt,
      demoFile,
    ),
  )

  // The precondition this whole fixture exists to establish, asserted rather
  // than assumed: nothing linked at ingest.
  if (demo.tournament_id !== null) {
    throw new Error(
      `Demo ${demoId} auto-linked at ingest (tournament_id=${demo.tournament_id}); ` +
        'the backfill scenario needs it UNLINKED',
    )
  }

  // Now the players identify themselves — the information the auto-linker was
  // missing when the stats arrived.
  await setSteamId(scenario.p1.token, p1SteamId)
  await setSteamId(scenario.p2.token, p2SteamId)

  return {
    tournamentId,
    matchId: scenario.matchId,
    gameId: game.id,
    demoId,
    p1: scenario.p1,
    p2: scenario.p2,
  }
}

// =============================================================================
// P-68: a rating that came out of the pipeline wrong
// =============================================================================

export interface RatingHistoryEntry {
  rating: number
  source: string
  recorded_at: string
}

export interface RatingSubject {
  playerId: string
  displayName: string
  token: string
}

/**
 * A fresh player carrying a scraped Premier rating.
 *
 * `source: 'demo_rank_update'` is exactly what the enricher writes
 * (`handlers/internal.rs process_demo_ratings`), so the row under correction
 * is indistinguishable from a real pipeline write. Seeded over the admin
 * rating endpoint because the enricher's own path needs an `X-API-Key`.
 */
export async function createPlayerWithScrapedRating(
  adminToken: string,
  rating: number,
): Promise<RatingSubject> {
  const user = await createTestUser()
  const playerId = await getMyPlayerId(user.token)
  const displayName = await getMyDisplayName(user.token)

  const resp = await fetch(`${API_URL}/v1/players/${playerId}/games/cs2/rating`, {
    method: 'POST',
    headers: authHeaders(adminToken),
    body: JSON.stringify({
      rating,
      source: 'demo_rank_update',
      recorded_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    }),
  })
  await jsonOrThrow<{ data: unknown }>(resp, 'Seed scraped rating')

  return { playerId, displayName, token: user.token }
}

async function getMyPlayerId(token: string): Promise<string> {
  return (await getMyProfile(token)).id
}

async function getMyDisplayName(token: string): Promise<string> {
  return (await getMyProfile(token)).display_name
}

/**
 * The caller's own player row.
 *
 * `display_name` is NOT the username — `createTestUser` seeds
 * "CheckIn Tester <suffix>" against username "ci_<suffix>" — and the pipeline
 * tables identify people by display name (P-115: never by a truncated UUID),
 * so specs must assert against this rather than the login handle.
 */
export async function getMyProfile(
  token: string,
): Promise<{ id: string; display_name: string }> {
  const resp = await fetch(`${API_URL}/v1/players/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await jsonOrThrow<{ data: { id: string; display_name: string } }>(
    resp,
    'Fetch /players/me',
  )
  return body.data
}

export async function getRatingHistory(playerId: string): Promise<RatingHistoryEntry[]> {
  const resp = await fetch(`${API_URL}/v1/players/${playerId}/games/cs2/rating-history?limit=50`)
  const body = await jsonOrThrow<{ data: RatingHistoryEntry[] }>(resp, 'Rating history')
  return body.data ?? []
}

/** Raw status of the admin rating write, for the gate cross-check. */
export async function submitRatingStatus(
  token: string,
  playerId: string,
  rating: number,
): Promise<number> {
  const resp = await fetch(`${API_URL}/v1/players/${playerId}/games/cs2/rating`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      rating,
      source: 'e2e gate probe',
      recorded_at: new Date().toISOString(),
    }),
  })
  return resp.status
}
