/**
 * Tournament map-pool API helpers.
 *
 * Builds the preconditions `tournament-map-pool.spec.ts` needs (a game map
 * catalog to click through, a tournament carrying a known pool) and provides
 * the backend cross-check for every pool mutation the spec performs through
 * the UI. The mutations themselves are NEVER done here — the spec drives
 * `MapPoolPicker` as mounted in `TournamentForm.vue:321`.
 *
 * Endpoint shapes verified against
 * `api/crates/portal-api/src/handlers/tournaments/map_pool.rs`:
 *
 *   GET    /v1/games/{game_id}                          (public)
 *   GET    /v1/tournaments/{tournament_id}/map-pool     (public)
 *   PUT    /v1/tournaments/{tournament_id}/map-pool     (admin) — set override
 *   DELETE /v1/tournaments/{tournament_id}/map-pool     (admin) — drop override
 *   GET    /v1/tournaments/by-slug/{slug}               (public)
 *
 * Map "ids" are slugs (`de_dust2`), not UUIDs — the catalog lives in the
 * game's `available_maps` JSONB (`migrations/0018_seed_cs2_game_config.sql`).
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

/** One entry of a game's map catalog (`MapInfoResponse`). */
export interface MapCatalogEntry {
  id: string
  display_name: string
}

/** The parts of `GameDetailResponse` the map-pool UI depends on. */
export interface GameMapCatalog {
  id: string
  slug: string
  display_name: string
  /** Every map legal for the game — one `.pool-card` each in the picker. */
  maps: MapCatalogEntry[]
  /** The game's default pool — what "Using game default" / "Reset to default" mean. */
  defaultPool: string[]
}

/**
 * The effective pool for a tournament. `source` is `tournament` when an
 * override row exists and `game` when it fell back to the game default —
 * i.e. it is the only externally visible difference between a PUT and a
 * DELETE having landed.
 */
export interface EffectiveMapPool {
  maps: string[]
  source: string
}

interface ApiResult<T> {
  data: T
}

async function jsonOrThrow<T>(response: Response, context: string): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${context} failed (${response.status}): ${text}`)
  }
  if (!text) {
    return {} as T
  }
  try {
    return JSON.parse(text) as T
  } catch (err) {
    throw new Error(`${context}: failed to parse JSON (${String(err)}): ${text}`)
  }
}

/**
 * The map catalog + default pool of a seeded game, by slug.
 *
 * Defaults to `cs2`: it is the seeded game that actually has a map catalog,
 * and the one specs are told never to mutate (AoE2 is the mutable one).
 */
export async function fetchGameCatalog(slug = 'cs2'): Promise<GameMapCatalog> {
  const listResp = await fetch(`${API_URL}/v1/games`)
  const list = await jsonOrThrow<ApiResult<Array<{ id: string; slug: string }>>>(
    listResp,
    'List games',
  )
  const summary = list.data?.find((g) => g.slug === slug)
  if (!summary) {
    throw new Error(`Game '${slug}' is not seeded — cannot build a map-pool scenario`)
  }

  const detailResp = await fetch(`${API_URL}/v1/games/${summary.id}`)
  const detail = await jsonOrThrow<
    ApiResult<{
      id: string
      slug: string
      display_name: string
      maps: MapCatalogEntry[]
      map_pool: string[]
    }>
  >(detailResp, `Fetch game ${slug}`)

  if (!detail.data.maps || detail.data.maps.length === 0) {
    throw new Error(`Game '${slug}' has no map catalog — the picker would not render`)
  }

  return {
    id: detail.data.id,
    slug: detail.data.slug,
    display_name: detail.data.display_name,
    maps: detail.data.maps,
    defaultPool: detail.data.map_pool ?? [],
  }
}

/** The map id behind a card label, so the spec can click a human name and assert an id. */
export function mapIdByDisplayName(catalog: GameMapCatalog, displayName: string): string {
  const found = catalog.maps.find((m) => m.display_name === displayName)
  if (!found) {
    throw new Error(
      `No map named '${displayName}' in the ${catalog.slug} catalog ` +
        `(have: ${catalog.maps.map((m) => m.display_name).join(', ')})`,
    )
  }
  return found.id
}

/** The effective pool + its source. The cross-check for every UI pool save. */
export async function fetchEffectiveMapPool(tournamentId: string): Promise<EffectiveMapPool> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/map-pool`)
  const body = await jsonOrThrow<ApiResult<EffectiveMapPool>>(resp, 'Fetch tournament map pool')
  return body.data
}

/**
 * Seed a tournament-level override so the spec can start from a *customised*
 * pool (the only state in which "Reset to default" renders,
 * `MapPoolPicker.vue:23`). Precondition only — the spec never resets through
 * this path.
 */
export async function setMapPoolViaApi(
  adminToken: string,
  tournamentId: string,
  mapIds: string[],
): Promise<EffectiveMapPool> {
  const resp = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/map-pool`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ map_ids: mapIds }),
  })
  const body = await jsonOrThrow<ApiResult<EffectiveMapPool>>(resp, 'Seed tournament map pool')
  return body.data
}

/** Resolve a tournament created through the UI back to its id. */
export async function fetchTournamentIdBySlug(slug: string): Promise<string> {
  const resp = await fetch(`${API_URL}/v1/tournaments/by-slug/${slug}`)
  const body = await jsonOrThrow<ApiResult<{ id: string }>>(resp, 'Fetch tournament by slug')
  return body.data.id
}
