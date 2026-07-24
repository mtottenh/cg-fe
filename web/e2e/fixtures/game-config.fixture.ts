import type { components } from '@/api/types'

/**
 * Admin game-configuration helpers.
 *
 * **Games are global config with no create endpoint.** `migrations/0003_create_games.sql:68-70`
 * inserts exactly two rows (`cs2`, `aoe4`) and `routes/games.rs` has no `POST /`, so
 * a spec cannot build its own game the way the tournament fixtures build their own
 * tournament (`portal-cli game create` exists, but shelling out to a cargo binary is
 * not an API seeding path and would not work against a plain dev stack). Every mutating
 * helper here therefore comes with a restore counterpart, and the spec puts the game
 * back in a `finally`.
 *
 * `cs2` is depended on by most of the suite (the seeded tournament, league, team,
 * awards and demo fixtures all resolve it), so the **mutation target is `aoe4`** — it
 * is referenced only by `admin-management.spec.ts`'s read-only Games section. The
 * mutations are kept short-lived and display-name changes are *suffixed* rather than
 * replaced, because Playwright's substring matching means that spec's
 * `getByText('Age of Empires IV')` still passes while a suffixed rename is in flight
 * (`fullyParallel: true` locally; CI pins `workers: 1`).
 *
 * The one residual cross-file window is the disable→enable pair: while `aoe4` is in
 * maintenance it drops out of `GET /v1/games` (`list_active`), so a *locally* parallel
 * worker loading `/admin/games` in that ~1s window would not see the row. It cannot be
 * designed away without a create endpoint; `admin-games-config.spec.ts` runs serially so
 * the window is a single short one, and CI's `workers: 1` removes it entirely.
 *
 * ## `id` is a UUID, `slug` is the human key — and the write path only accepts the slug
 *
 * `migrations/0024_restructure_games_uuid.sql` moved `games.id` to a UUID and added
 * `slug` ('cs2' / 'aoe4'). `GameSummaryResponse.id` is that UUID, and it is what the
 * frontend store passes to every game endpoint. Only three handlers resolve it —
 * `update_game`, `enable_game`, `disable_game` call `resolve_game_slug`
 * (`handlers/games.rs:339,551,609`). The six *config* write handlers do not: they read
 * the game with `find_by_id_or_slug` and then write with
 * `game_repo.update(&game_id, ..)` (`handlers/games.rs:508,778,851,902,989,1055`),
 * which is `WHERE slug = $1` (`portal-db/src/repositories/game.rs:106,151-153`). Passing
 * a UUID therefore 404s. The helpers below that hit those endpoints are declared to take
 * a **slug** for that reason; the spec header documents the consequence for the UI.
 *
 * Types come from the generated client rather than being hand-declared, so a DTO change
 * breaks the fixture at compile time (the P-86 rule). Note `GameSummaryResponse.status`
 * is a bare `string` in the OpenAPI spec — the backend never declared a game-status enum
 * — so there is no union in `api-status.ts` to import for it. Its real values are
 * `active` / `maintenance` / `deprecated`, and `POST /disable` writes **`maintenance`**
 * (`portal-db/src/repositories/game.rs:182`), not `disabled`.
 */

type S = components['schemas']

export type GameSummary = S['GameSummaryResponse']
export type GameDetail = S['GameDetailResponse']
export type UpdateGameRequest = S['UpdateGameRequest']
export type MapInfo = S['MapInfoResponse']
export type RankTier = S['RankTierResponse']

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

/** The seeded game this spec is allowed to mutate. See the module doc. */
export const MUTABLE_GAME_SLUG = 'aoe4'
/** Its migration-seeded display name — the value every mutation restores to. */
export const MUTABLE_GAME_NAME = 'Age of Empires IV'
/** Its migration-seeded short name. */
export const MUTABLE_GAME_SHORT_NAME = 'AoE4'

/** The read-only game used for the config-dialog test: it is the one with plugin defaults. */
export const PLUGIN_GAME_SLUG = 'cs2'
export const PLUGIN_GAME_NAME = 'Counter-Strike 2'

async function jsonOrThrow<T>(response: Response, context: string): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${context} failed (${response.status}): ${text}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

/**
 * The public game catalog — `GET /v1/games`.
 *
 * This is `GameRepository::list_active()` (`portal-db/src/repositories/game.rs:71-79`),
 * i.e. `WHERE status = 'active'`, and it is the *only* list the admin page has.
 */
export async function listGamesViaApi(): Promise<GameSummary[]> {
  const resp = await fetch(`${API_URL}/v1/games?per_page=100`)
  const body = await jsonOrThrow<{ data: GameSummary[] }>(resp, 'List games')
  return body.data ?? []
}

/**
 * Read one game by slug **or** UUID — `GET /v1/games/{game_id}` resolves either
 * (`GameRepository::find_by_id_or_slug`) and, unlike the list, is not filtered by
 * status, so it can read a game the spec has just disabled.
 */
export async function getGameDetailViaApi(idOrSlug: string): Promise<GameDetail> {
  const resp = await fetch(`${API_URL}/v1/games/${idOrSlug}`)
  const body = await jsonOrThrow<{ data: GameDetail }>(resp, `Get game ${idOrSlug}`)
  return body.data
}

/** `GET /v1/games/{game_id}/maps` — the catalog the config dialog renders. */
export async function getGameMapsViaApi(idOrSlug: string): Promise<MapInfo[]> {
  const resp = await fetch(`${API_URL}/v1/games/${idOrSlug}/maps`)
  const body = await jsonOrThrow<{ data: MapInfo[] }>(resp, `Get maps for ${idOrSlug}`)
  return body.data ?? []
}

/** `GET /v1/games/{game_id}/rank-tiers` — the tiers the config dialog renders. */
export async function getGameRankTiersViaApi(idOrSlug: string): Promise<RankTier[]> {
  const resp = await fetch(`${API_URL}/v1/games/${idOrSlug}/rank-tiers`)
  const body = await jsonOrThrow<{ data: RankTier[] }>(resp, `Get rank tiers for ${idOrSlug}`)
  return body.data ?? []
}

/** Restore/precondition helper: put a game back to `active`. Accepts a UUID or a slug. */
export async function enableGameViaApi(adminToken: string, idOrSlug: string): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/games/${idOrSlug}/enable`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  await jsonOrThrow<unknown>(resp, `Enable game ${idOrSlug}`)
}

/**
 * Restore helper for the edit-modal tests — `PATCH /v1/games/{game_id}`.
 *
 * Only fields that are currently non-null may be restored this way: the update
 * statement is `COALESCE($n, column)` for every column
 * (`portal-db/src/repositories/game.rs:106-131`), so sending `null` preserves the old
 * value instead of clearing it. Specs must therefore only mutate fields that already
 * have a value — which is why the edit-modal test moves `display_name`, `short_name`
 * and `is_featured` and leaves `description` / `icon_url` (both NULL on `aoe4`) alone.
 */
export async function patchGameViaApi(
  adminToken: string,
  idOrSlug: string,
  body: UpdateGameRequest,
): Promise<GameDetail> {
  const resp = await fetch(`${API_URL}/v1/games/${idOrSlug}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify(body),
  })
  const parsed = await jsonOrThrow<{ data: GameDetail }>(resp, `Update game ${idOrSlug}`)
  return parsed.data
}

/**
 * Put `aoe4` back exactly as migration 0003 seeded it: active, original names, featured.
 * Safe to call when nothing was changed.
 */
export async function restoreMutableGame(adminToken: string): Promise<void> {
  await enableGameViaApi(adminToken, MUTABLE_GAME_SLUG)
  await patchGameViaApi(adminToken, MUTABLE_GAME_SLUG, {
    display_name: MUTABLE_GAME_NAME,
    short_name: MUTABLE_GAME_SHORT_NAME,
    is_featured: true,
  })
}
