/**
 * League + season builders for E2E tests.
 *
 * league-season.spec.ts needs a league whose seasons sit in known statuses,
 * without relying on globally seeded state. These helpers create everything
 * through the admin API. Endpoint shapes verified against the OpenAPI spec
 * (`/api-docs/openapi.json`) and the backend handlers in
 * `/api/crates/portal-api/src/handlers/league_teams/season.rs`:
 *
 *   POST  /v1/leagues                     body: CreateLeagueRequest        (bearer admin)
 *   POST  /v1/league-seasons              body: CreateLeagueSeasonRequest  (bearer league admin)
 *   PATCH /v1/league-seasons/{season_id}  body: { status }                 (bearer league admin)
 *
 * Season status changes are backend-validated as a chain
 * (`LeagueTeamService::update_status`):
 *
 *   draft → registration → active → completed
 *
 * so `advanceSeason` PATCHes one step at a time from the scenario's current
 * status rather than jumping straight to the target.
 */

import { getCs2Game } from './awards.fixture'
import { uniqueId } from './test-data'

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

export type SeasonStatus = 'draft' | 'registration' | 'active' | 'completed'

/** Forward-only status chain enforced by the backend. */
const STATUS_CHAIN: SeasonStatus[] = ['draft', 'registration', 'active', 'completed']

interface ApiResult<T> {
  data: T
}

async function jsonOrThrow<T>(response: Response, context: string): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${context} failed (${response.status}): ${text}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

export interface CreatedLeague {
  leagueId: string
  leagueName: string
  leagueSlug: string
  gameId: string
}

export interface CreatedSeason {
  seasonId: string
  seasonName: string
  seasonSlug: string
  /** Current season status; kept up to date by `advanceSeason`. */
  status: SeasonStatus
}

export interface LeagueSeasonScenario extends CreatedLeague, CreatedSeason {}

/**
 * Create a fresh open-access league owned by the token's user (the creator is
 * added as a league admin member, so the admin sees it on /admin/leagues and
 * gets the "Create Team" CTA on the public league page).
 */
export async function createLeague(
  adminToken: string,
  opts?: { gameId?: string; namePrefix?: string },
): Promise<CreatedLeague> {
  const gameId = opts?.gameId ?? (await getCs2Game()).id
  const suffix = uniqueId()
  const leagueName = `${opts?.namePrefix ?? 'E2E Season League'} ${suffix}`
  const leagueSlug = `e2e-season-league-${suffix}`

  const resp = await fetch(`${API_URL}/v1/leagues`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name: leagueName,
      slug: leagueSlug,
      game_id: gameId,
      description: `League created for E2E season lifecycle tests (${suffix})`,
      access_type: 'open',
    }),
  })
  const body = await jsonOrThrow<ApiResult<{ id: string }>>(resp, 'Create league')
  return { leagueId: body.data.id, leagueName, leagueSlug, gameId }
}

/** Create a season in the league. New seasons start in `draft` status. */
export async function createSeason(
  adminToken: string,
  leagueId: string,
  opts?: { namePrefix?: string },
): Promise<CreatedSeason> {
  const suffix = uniqueId()
  const seasonName = `${opts?.namePrefix ?? 'E2E Season'} ${suffix}`
  const seasonSlug = `e2e-season-${suffix}`

  const resp = await fetch(`${API_URL}/v1/league-seasons`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      league_id: leagueId,
      name: seasonName,
      slug: seasonSlug,
    }),
  })
  const body = await jsonOrThrow<ApiResult<{ id: string; status?: string }>>(
    resp,
    'Create league season',
  )
  return {
    seasonId: body.data.id,
    seasonName,
    seasonSlug,
    status: (body.data.status as SeasonStatus | undefined) ?? 'draft',
  }
}

/** Single PATCH of the season status (must be a valid one-step transition). */
async function patchSeasonStatus(
  adminToken: string,
  seasonId: string,
  status: SeasonStatus,
): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/league-seasons/${seasonId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ status }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Set season status to ${status} failed (${resp.status}): ${text}`)
  }
}

/**
 * Advance a season forward to `target`, stepping through every intermediate
 * status in the backend's validated chain. Updates `season.status` in place.
 */
export async function advanceSeason(
  adminToken: string,
  season: { seasonId: string; status: SeasonStatus },
  target: SeasonStatus,
): Promise<void> {
  const fromIdx = STATUS_CHAIN.indexOf(season.status)
  const toIdx = STATUS_CHAIN.indexOf(target)
  if (fromIdx < 0 || toIdx < 0) {
    throw new Error(`Unknown season status transition: ${season.status} → ${target}`)
  }
  if (toIdx < fromIdx) {
    throw new Error(`Cannot move season backwards from ${season.status} to ${target}`)
  }
  for (let i = fromIdx + 1; i <= toIdx; i++) {
    const next = STATUS_CHAIN[i]
    if (!next) continue
    await patchSeasonStatus(adminToken, season.seasonId, next)
  }
  season.status = target
}

/**
 * Set a season's roster lock (P-14 made this settable; P-148 made it the thing
 * that actually decides whether a live roster may change).
 *
 * `PATCH /v1/league-seasons/{id}` with `roster_lock_status`; the backend routes
 * it through `LeagueSeasonService::update_roster_lock`, which stamps the
 * `roster_locked_by` / `roster_locked_at` audit columns. Any non-terminal
 * season accepts any value.
 */
export async function setRosterLock(
  adminToken: string,
  seasonId: string,
  lock: 'open' | 'soft_lock' | 'hard_lock',
): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/league-seasons/${seasonId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ roster_lock_status: lock }),
  })
  const body = await jsonOrThrow<ApiResult<{ roster_lock_status: string }>>(
    resp,
    `Set roster lock to ${lock}`,
  )
  if (body.data.roster_lock_status !== lock) {
    throw new Error(
      `PATCH reported a roster lock it did not apply: ${body.data.roster_lock_status}`,
    )
  }
}

/**
 * Composite builder: fresh league + one season advanced to `seasonStatus`
 * (default `registration`, so teams can register immediately).
 */
export async function createLeagueSeasonScenario(
  adminToken: string,
  opts?: { seasonStatus?: SeasonStatus; gameId?: string },
): Promise<LeagueSeasonScenario> {
  const league = await createLeague(adminToken, { gameId: opts?.gameId })
  const season = await createSeason(adminToken, league.leagueId)
  await advanceSeason(adminToken, season, opts?.seasonStatus ?? 'registration')
  return { ...league, ...season }
}
