import { uniqueId } from './test-data'
import {
  createCheckInScenario,
  type CheckInScenario,
} from './checkin.fixture'

/**
 * Awards E2E helpers.
 *
 * Builds on the check-in scenario builder to produce a CS2 tournament whose
 * match can receive auto-linked demo stats:
 *
 *   1. create a CS2 tournament (the demo-stats plugin pipeline is CS2-only),
 *   2. register/approve/start two players (checkin.fixture),
 *   3. link a Steam ID to each player via `PATCH /v1/players/me` — the
 *      UpdateProfileRequest exposes `steam_id` (set-once), so no SQL needed,
 *   4. catalog a demo + submit stats whose `raw_stats.player_summaries` keys
 *      are those Steam IDs and whose `match_date` sits near the match's
 *      scheduled time → the backend auto-links the demo into the tournament.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

export interface AwardsScenario extends CheckInScenario {
  gameId: string
  p1PlayerId: string
  p2PlayerId: string
  p1SteamId: string
  p2SteamId: string
  /** ISO timestamp near the match's scheduled time, for demo match_date. */
  matchDate: string
}

async function jsonOrThrow<T>(response: Response, context: string): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${context} failed (${response.status}): ${text}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

/** Find the CS2 game (the only plugin with demo-stat extraction). */
export async function getCs2Game(): Promise<{ id: string; slug?: string }> {
  const resp = await fetch(`${API_URL}/v1/games`)
  const body = await jsonOrThrow<{ data: Array<{ id: string; slug?: string; name?: string }> }>(
    resp,
    'List games',
  )
  const games = body.data ?? []
  const cs2 = games.find(
    (g) =>
      g.slug?.toLowerCase() === 'cs2' ||
      g.name?.toLowerCase().includes('counter-strike') ||
      g.name?.toLowerCase() === 'cs2',
  )
  const game = cs2 ?? games[0]
  if (!game) throw new Error('No games available')
  return game
}

/** Create a published CS2 individual tournament with registration open. */
async function createCs2Tournament(
  adminToken: string,
  gameId: string,
): Promise<{ tournamentId: string; slug: string }> {
  const suffix = uniqueId()
  const slug = `e2e-awards-${suffix}`
  const createResp = await fetch(`${API_URL}/v1/tournaments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name: `E2E Awards Tournament ${suffix}`,
      slug,
      game_id: gameId,
      format: 'single_elimination',
      participant_type: 'individual',
      min_participants: 2,
      max_participants: 4,
      check_in_required: false,
    }),
  })
  const created = await jsonOrThrow<{ data: { id: string; slug: string } }>(
    createResp,
    'Create awards tournament',
  )
  for (const action of ['publish', 'open-registration']) {
    const resp = await fetch(`${API_URL}/v1/tournaments/${created.data.id}/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    if (!resp.ok) {
      throw new Error(`${action} failed (${resp.status}): ${await resp.text()}`)
    }
  }
  return { tournamentId: created.data.id, slug: created.data.slug }
}

/** Generate a unique, plausibly-valid 17-digit SteamID64. */
export function uniqueSteamId(): string {
  const tail = String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')
  return `76561198${tail}`
}

/**
 * Link a Steam ID to the authenticated player via the profile PATCH.
 * `UpdateProfileRequest.steam_id` is a set-once SteamID64 string.
 */
export async function setSteamId(token: string, steamId: string): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/players/me`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ steam_id: steamId }),
  })
  if (!resp.ok) {
    throw new Error(`Set steam_id failed (${resp.status}): ${await resp.text()}`)
  }
}

/** Fetch the authenticated player's profile id. */
export async function getMyPlayerId(token: string): Promise<string> {
  const resp = await fetch(`${API_URL}/v1/players/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await jsonOrThrow<{ data: { id: string } }>(resp, 'Fetch /players/me')
  return body.data.id
}

/**
 * Full awards scenario: CS2 tournament + started match + both players
 * Steam-identified via their own profile PATCH.
 */
export async function createAwardsScenario(adminToken: string): Promise<AwardsScenario> {
  const game = await getCs2Game()
  const { tournamentId } = await createCs2Tournament(adminToken, game.id)

  // Schedule the match at a random far-future time so the auto-linker's
  // candidate window (scheduled_at within ±24h of the demo's match_date)
  // contains essentially only THIS match. The backend candidate query has
  // no ORDER BY and LIMIT 100, so scheduling "now" on a long-lived dev DB
  // full of prior e2e matches makes auto-linking nondeterministic.
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
  await setSteamId(scenario.p1.token, p1SteamId)
  await setSteamId(scenario.p2.token, p2SteamId)

  const [p1PlayerId, p2PlayerId] = await Promise.all([
    getMyPlayerId(scenario.p1.token),
    getMyPlayerId(scenario.p2.token),
  ])

  // Demo match_date at the scheduled time lands the demo squarely inside
  // the auto-link candidate window for this match.
  const matchDate = scheduleAt

  return {
    ...scenario,
    gameId: game.id,
    p1PlayerId,
    p2PlayerId,
    p1SteamId,
    p2SteamId,
    matchDate,
  }
}

// =============================================================================
// Demo stats submission (admin pipeline)
// =============================================================================

export interface PlayerDemoStats {
  steamId: string
  playerName: string
  kills: number
  headshotKills: number
  mag7Kills: number
}

/**
 * Build a full `Cs2DemoStats`-shaped stats submission body so the plugin
 * fact extractor parses `raw_stats` and auto-linking sees the players.
 * Mirrors `awards_stats_body` in the backend integration tests.
 */
export function awardsStatsBody(
  players: PlayerDemoStats[],
  matchDate: string,
  demoFile: string,
): Record<string, unknown> {
  const playerSummaries: Record<string, unknown> = {}
  const playerInputs: unknown[] = []
  for (const p of players) {
    const weaponKills: Record<string, number> = {}
    if (p.mag7Kills > 0) weaponKills.mag7 = p.mag7Kills
    playerSummaries[p.steamId] = {
      player_id: Number(p.steamId),
      player_name: p.playerName,
      team: { team_id: 2, team_name: 'TeamA', team_side: 'T' },
      kills: p.kills,
      deaths: 5,
      assists: 2,
      headshot_kills: p.headshotKills,
      damage_dealt: 800,
      adr: 80.0,
      hs_percentage: 40.0,
      blind_kills: 0,
      weapon_kills: weaponKills,
    }
    playerInputs.push({
      steam_id: p.steamId,
      player_name: p.playerName,
      team_name: 'TeamA',
      stats: { kills: p.kills, deaths: 5 },
    })
  }

  const minimalRound = (n: number) => ({
    round_number: n,
    winner_team: 'TeamA',
    winner_side: 'T',
    round_score: {},
    player_states: {},
    events: [],
    player_stats: {},
  })

  return {
    map_name: 'de_dust2',
    match_date: matchDate,
    team1_name: 'TeamA',
    team2_name: 'TeamB',
    team1_score: 13,
    team2_score: 7,
    total_rounds: 20,
    raw_stats: {
      map: 'de_dust2',
      match_date: matchDate,
      demo_file: demoFile,
      match_id: demoFile,
      teams: {
        TeamA: { team_id: 2, team_name: 'TeamA', team_side: 'T' },
        TeamB: { team_id: 3, team_name: 'TeamB', team_side: 'CT' },
      },
      final_score: { TeamA: 13, TeamB: 7 },
      rounds: [minimalRound(1), minimalRound(2)],
      player_summaries: playerSummaries,
    },
    players: playerInputs,
  }
}

/** Catalog a demo (admin) and return its id. */
export async function catalogDemo(
  adminToken: string,
  gameId: string,
  fileName: string,
): Promise<string> {
  const resp = await fetch(`${API_URL}/v1/admin/demos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      game_id: gameId,
      file_name: fileName,
      s3_bucket: 'e2e-bucket',
      s3_key: `e2e/${fileName}`,
      file_size_bytes: 42_000_000,
    }),
  })
  const body = await jsonOrThrow<{ data: { id: string } }>(resp, 'Catalog demo')
  return body.data.id
}

/** Submit demo stats (admin) and return the updated demo. */
export async function submitDemoStats(
  adminToken: string,
  demoId: string,
  statsBody: Record<string, unknown>,
): Promise<{ id: string; tournament_id: string | null }> {
  const resp = await fetch(`${API_URL}/v1/admin/demos/${demoId}/stats`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(statsBody),
  })
  const body = await jsonOrThrow<{ data: { id: string; tournament_id: string | null } }>(
    resp,
    'Submit demo stats',
  )
  return body.data
}

/**
 * Catalog + submit a demo that auto-links into the scenario's tournament.
 * Throws if the auto-link did not happen (tournament_id not stamped).
 */
export async function submitLinkedDemo(
  adminToken: string,
  scenario: AwardsScenario,
  players: PlayerDemoStats[],
  fileName?: string,
): Promise<{ demoId: string }> {
  const demoFile = fileName ?? `e2e-awards-${uniqueId()}.dem`
  const demoId = await catalogDemo(adminToken, scenario.gameId, demoFile)
  const demo = await submitDemoStats(
    adminToken,
    demoId,
    awardsStatsBody(players, scenario.matchDate, demoFile),
  )
  if (demo.tournament_id !== scenario.tournamentId) {
    throw new Error(
      `Demo did not auto-link into tournament ${scenario.tournamentId}; ` +
        `got tournament_id=${demo.tournament_id}`,
    )
  }
  return { demoId }
}

/** Fetch a demo (public/admin GET). */
export async function getDemo(
  adminToken: string,
  demoId: string,
): Promise<{ id: string; tournament_id: string | null }> {
  const resp = await fetch(`${API_URL}/v1/demos/${demoId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<{ data: { id: string; tournament_id: string | null } }>(
    resp,
    'Get demo',
  )
  return body.data
}

/** Fetch a demo's match links. */
export async function getDemoLinks(
  adminToken: string,
  demoId: string,
): Promise<Array<{ id: string; match_id: string; link_type: string; confidence_score: number | null }>> {
  const resp = await fetch(`${API_URL}/v1/demos/${demoId}/links`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<{
    data: Array<{ id: string; match_id: string; link_type: string; confidence_score: number | null }>
  }>(resp, 'Get demo links')
  return body.data ?? []
}

/** List a tournament's awards via the public API. */
export async function getTournamentAwards(
  tournamentId: string,
): Promise<Array<{ id: string; name: string; status: string; stat_key: string }>> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/awards`)
  const body = await jsonOrThrow<{
    data: Array<{ id: string; name: string; status: string; stat_key: string }>
  }>(resp, 'List tournament awards')
  return body.data ?? []
}

/** Fetch a player's trophy case via the public API. */
export async function getPlayerTrophies(
  playerId: string,
): Promise<Array<{ award: { name: string }; result: { rank: number; value: number } }>> {
  const resp = await fetch(`${API_URL}/v1/players/${playerId}/awards`)
  const body = await jsonOrThrow<{
    data: Array<{ award: { name: string }; result: { rank: number; value: number } }>
  }>(resp, 'Get player trophies')
  return body.data ?? []
}

/** Read the demo auto-link setting (admin). */
export async function getAutoLinkSetting(adminToken: string): Promise<boolean> {
  const resp = await fetch(`${API_URL}/v1/admin/demos/auto-link`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const body = await jsonOrThrow<{ data: { enabled: boolean } }>(resp, 'Get auto-link setting')
  return body.data.enabled
}

/** Update the demo auto-link setting (admin). */
export async function setAutoLinkSetting(adminToken: string, enabled: boolean): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/admin/demos/auto-link`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ enabled }),
  })
  await jsonOrThrow<{ data: { enabled: boolean } }>(resp, 'Set auto-link setting')
}
