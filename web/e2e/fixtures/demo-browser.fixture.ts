import type { components } from '@/api/types'
import {
  createCheckInScenario,
  checkInViaApi,
  type CheckInScenario,
} from './checkin.fixture'
import { catalogDemoViaApi, uniqueDemoFileName, type AdminDemo } from './demo-admin.fixture'
import { patchMyProfile, uniqueSteamId } from './player-surfaces.fixture'
import type { TournamentMatchStatus } from './api-status'
import { uniqueId } from './test-data'

/**
 * Preconditions for the match evidence **demo browser** (`DemoBrowser.vue`,
 * mounted from `EvidenceAttachmentPanel.vue:83` on the "Browse Demos" tab).
 *
 * Discovery is not a free-standing lookup — `DemoService::discover_for_match`
 * (`api/crates/portal-domain/src/services/demo.rs:718`) joins three things
 * together, and a demo is invisible to the browser unless ALL of them line up:
 *
 *   1. the match participants must have `players.steam_id` set — with no Steam
 *      IDs the service returns an empty list before it touches the catalog;
 *   2. the catalogued demo must have `demo_players` rows carrying those same
 *      Steam IDs, and status `ready` — both of which only exist once demo
 *      *stats* have been submitted (`POST /v1/admin/demos/{id}/stats`), since
 *      `POST /v1/admin/demos` alone catalogs a `pending` row with no metadata;
 *   3. the demo's `metadata.match_date` must fall inside ±6h of the match's
 *      `started_at`/`scheduled_at`.
 *
 * So the seeding path is: build a real in-progress match → give both players a
 * Steam ID → catalog a demo → submit stats naming those Steam IDs.
 *
 * `raw_stats` is deliberately seeded WITHOUT a `player_summaries` object:
 * `DemoService::try_auto_link` (`demo.rs:537-550`) reads its keys as the demo's
 * Steam ID set and bails out when it is empty. Without that, stats ingestion
 * would auto-link the demo to the match itself, and `find_matching_for_context`
 * excludes already-linked demos (`portal-db/src/adapters/demo.rs:483-485`) —
 * the browser would then show nothing and the spec would be testing the
 * auto-linker instead of the surface under test.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

type S = components['schemas']

export type DiscoveredEvidence = S['DiscoveredEvidenceResponse']
export type DemoMatchLinkWithDemo = S['DemoMatchLinkWithDemoResponse']
export type EvidenceSummary = S['EvidenceSummaryResponse']

interface ApiResult<T> {
  data: T
}

async function jsonOrThrow<T>(response: Response, context: string): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${context} failed (${response.status}): ${text}`)
  }
  if (!text) return {} as T
  return JSON.parse(text) as T
}

function authHeaders(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

// =============================================================================
// The match
// =============================================================================

export interface DemoBrowserScenario extends CheckInScenario {
  /** The tournament's game — the demo catalog is keyed on it. */
  gameId: string
  /** SteamID64 linked to `p1` / `p2` (`players.steam_id`). */
  p1SteamId: string
  p2SteamId: string
  /**
   * `started_at ?? scheduled_at` — the reference instant discovery scores
   * demos against. Seeding `match_date` to exactly this value pins the
   * relevance score, which the browser renders as a percentage chip.
   */
  referenceTime: string
}

interface MatchRow {
  id: string
  status: TournamentMatchStatus
  match_format: string
  started_at: string | null
  scheduled_at: string | null
}

export async function fetchMatch(
  token: string,
  tournamentId: string,
  matchId: string,
): Promise<MatchRow> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/matches/${matchId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await jsonOrThrow<ApiResult<MatchRow>>(resp, 'Get match')
  return body.data
}

async function fetchTournamentGameId(tournamentId: string): Promise<string> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}`)
  const body = await jsonOrThrow<ApiResult<{ game_id: string }>>(resp, 'Get tournament')
  return body.data.game_id
}

/**
 * A fresh in-progress match whose two participants both have a Steam ID.
 *
 * Same shape as `evidence.spec.ts`'s `setupInProgressMatch` (check-in both
 * players on a no-veto tournament so the match auto-advances), plus the Steam
 * IDs discovery needs. Fails loudly rather than returning a match in the wrong
 * state — a silently-`ready` match renders no evidence panel at all.
 */
export async function createDemoBrowserMatch(adminToken: string): Promise<DemoBrowserScenario> {
  const scenario = await createCheckInScenario(undefined, adminToken, { checkInRequired: true })

  const p1SteamId = uniqueSteamId()
  const p2SteamId = uniqueSteamId()
  await patchMyProfile(scenario.p1.token, { steam_id: p1SteamId })
  await patchMyProfile(scenario.p2.token, { steam_id: p2SteamId })

  await checkInViaApi(
    undefined,
    scenario.p1.token,
    scenario.tournamentId,
    scenario.matchId,
    scenario.p1.registrationId,
  )
  await checkInViaApi(
    undefined,
    scenario.p2.token,
    scenario.tournamentId,
    scenario.matchId,
    scenario.p2.registrationId,
  )

  const match = await fetchMatch(adminToken, scenario.tournamentId, scenario.matchId)
  if (match.status !== 'in_progress') {
    throw new Error(
      `Expected the no-veto match to auto-advance to in_progress, got '${match.status}'`,
    )
  }
  const referenceTime = match.started_at ?? match.scheduled_at
  if (!referenceTime) {
    throw new Error('Match has neither started_at nor scheduled_at; discovery has no time anchor')
  }

  return {
    ...scenario,
    gameId: await fetchTournamentGameId(scenario.tournamentId),
    p1SteamId,
    p2SteamId,
    referenceTime,
  }
}

// =============================================================================
// The catalog
// =============================================================================

export interface SeedDemoOptions {
  gameId: string
  /** Steam IDs written as `demo_players` rows — the discovery join key. */
  steamIds: string[]
  /** `metadata.match_date`; discovery keeps demos within ±6h of the match. */
  matchDate: string
  mapName?: string
  team1Name?: string
  team2Name?: string
  team1Score?: number
  team2Score?: number
  totalRounds?: number
}

export interface SeededDemo extends AdminDemo {
  mapName: string
  team1Name: string
  team2Name: string
  team1Score: number
  team2Score: number
}

/** A map name no other spec's demo can collide with under `map_name` search. */
export function uniqueMapName(): string {
  return `de_e2e_${uniqueId()}`
}

/**
 * Catalog a demo and immediately submit stats for it, which is what flips it
 * to `ready` and gives it the metadata + `demo_players` rows discovery reads.
 */
export async function seedCatalogDemo(
  adminToken: string,
  opts: SeedDemoOptions,
): Promise<SeededDemo> {
  const mapName = opts.mapName ?? uniqueMapName()
  const team1Name = opts.team1Name ?? 'Alpha Squad'
  const team2Name = opts.team2Name ?? 'Bravo Squad'
  const team1Score = opts.team1Score ?? 13
  const team2Score = opts.team2Score ?? 7
  const totalRounds = opts.totalRounds ?? team1Score + team2Score

  const demo = await catalogDemoViaApi(
    adminToken,
    opts.gameId,
    uniqueDemoFileName('e2e-demo-browser'),
  )

  const resp = await fetch(`${API_URL}/v1/admin/demos/${demo.id}/stats`, {
    method: 'POST',
    headers: authHeaders(adminToken),
    body: JSON.stringify({
      map_name: mapName,
      match_date: opts.matchDate,
      team1_name: team1Name,
      team2_name: team2Name,
      team1_score: team1Score,
      team2_score: team2Score,
      total_rounds: totalRounds,
      duration_seconds: 2100,
      // No `player_summaries` — see the file header: it would trip auto-linking.
      raw_stats: { source: 'e2e-demo-browser-fixture' },
      players: opts.steamIds.map((steamId, i) => ({
        steam_id: steamId,
        player_name: `e2e_player_${i + 1}`,
        team_name: i === 0 ? team1Name : team2Name,
        stats: { kills: 20 - i, deaths: 15, assists: 4 },
      })),
    }),
  })
  const body = await jsonOrThrow<ApiResult<AdminDemo>>(resp, 'Submit demo stats')

  return { ...body.data, mapName, team1Name, team2Name, team1Score, team2Score }
}

// =============================================================================
// Cross-checks
// =============================================================================

/** What `evidence.discoverDemos` (`stores/evidence.ts:55`) reads. */
export async function discoverViaApi(
  token: string,
  matchId: string,
): Promise<DiscoveredEvidence[]> {
  const resp = await fetch(`${API_URL}/v1/matches/${matchId}/evidence/discover`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await jsonOrThrow<ApiResult<DiscoveredEvidence[]>>(resp, 'Discover evidence')
  return body.data ?? []
}

/** The `demo_match_links` a successful link writes. */
export async function listLinkedDemosViaApi(
  token: string,
  matchId: string,
): Promise<DemoMatchLinkWithDemo[]> {
  const resp = await fetch(`${API_URL}/v1/matches/${matchId}/demos?include_stats=true`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await jsonOrThrow<ApiResult<DemoMatchLinkWithDemo[]>>(resp, 'List linked demos')
  return body.data ?? []
}

/**
 * The `match_evidence` row a successful link writes alongside the link.
 *
 * `include_discovered=true` is not optional here. `EvidenceService::link_discovered`
 * stamps every row it creates `EvidenceSource::PluginDiscovery`
 * (`api/crates/portal-domain/src/services/tournament/evidence.rs:711`) — even
 * though a human clicked "Link demo" — and `list_evidence`
 * (`handlers/evidence.rs:325-329`) drops those rows from the default listing.
 * The cross-check has to ask for them explicitly to see what the UI just wrote.
 */
export async function listEvidenceViaApi(
  token: string,
  matchId: string,
): Promise<EvidenceSummary[]> {
  const resp = await fetch(`${API_URL}/v1/matches/${matchId}/evidence?include_discovered=true`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await jsonOrThrow<ApiResult<EvidenceSummary[]>>(resp, 'List evidence')
  return body.data ?? []
}

/** Demos visible to the "Browse Demo Catalog" search, by map name. */
export async function browseDemosViaApi(
  token: string,
  mapName: string,
): Promise<AdminDemo[]> {
  const resp = await fetch(
    `${API_URL}/v1/demos?status=ready&map_name=${encodeURIComponent(mapName)}&limit=10&offset=0`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const body = await jsonOrThrow<ApiResult<{ demos: AdminDemo[]; total: number }>>(
    resp,
    'Browse demos',
  )
  return body.data.demos ?? []
}
