import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState, aggregateActionStates } from '@/stores/helpers'
import { replaceById } from '@/utils/collections'

// Use generated types
type GameSummary = components['schemas']['GameSummaryResponse']
type GameDetail = components['schemas']['GameDetailResponse']
type MapInfo = components['schemas']['MapInfoResponse']
type AddMapRequest = components['schemas']['AddMapRequest']
type UpdateMapRequest = components['schemas']['UpdateMapRequest']

export const useGamesStore = defineStore('games', () => {
  const games = ref<GameSummary[]>([])
  /**
   * The **admin** catalog: every game, including the ones that are not `active`.
   * Deliberately a separate list from `games` — `games` is the *active* catalog
   * that the public game-filter selects on `/tournaments`, `/leagues` and
   * `/players` render, and quietly widening it from an admin page would leak a
   * disabled game into those selects. See `fetchAllGames`.
   */
  const allGames = ref<GameSummary[]>([])
  const currentGame = ref<GameDetail | null>(null)
  // P-122: `loading` and `error` used to alias BOTH fetch states — `error` read
  // `fetchGamesState.error ?? fetchAllGamesState.error` and its setter wrote to
  // both. Only `AdminGamesPage` calls `fetchAllGames` (it is the admin-only
  // `include_inactive` catalog and 403s for everyone else, by design — see
  // `fetchAllGames`). Every other consumer calls `fetchGames`.
  //
  // So the alias produced two distinct failures. Reading: an admin's 403 from
  // `fetchAllGames` surfaced verbatim in the PUBLIC HomePage alert, because
  // HomePage read the OR of both. Writing: `gamesStore.error = null` on
  // AdminLeaguesPage silently discarded an AdminGamesPage error the operator
  // had not seen yet.
  //
  // Same class as P-116 and P-124 — a whole-store error alias reporting one
  // action's failure on another action's surface. The remedy is the same one
  // used there: consumers read the specific action state they awaited. The
  // aliases are removed rather than deprecated so a new consumer cannot
  // reintroduce the coupling by reaching for the convenient name.

  const fetchGamesState = createActionState()
  const fetchAllGamesState = createActionState()
  const fetchGameState = createActionState()
  const enableGameState = createActionState()
  const disableGameState = createActionState()
  const fetchMapsState = createActionState()
  const setMapPoolState = createActionState()
  const catalogMapState = createActionState()
  const updateCatalogMapState = createActionState()
  const deleteCatalogMapState = createActionState()
  const fetchRankTiersState = createActionState()
  const setRankTiersState = createActionState()
  const updateTeamSizeState = createActionState()

  /**
   * The admin games surface performs eleven different writes and needs a single
   * banner for whichever one failed, so it genuinely wants an aggregate — unlike
   * the public pages, which each await exactly one action.
   *
   * `AdminGamesPage` already carried a comment saying its `loading`/`error` came
   * from `aggregateActionStates`. They did not: the store hand-rolled a computed
   * over just `fetchGamesState` and `fetchAllGamesState`, so the comment
   * described a helper that was never called, over "every games-action state"
   * when it covered two of thirteen. Enabling a game and having it fail left the
   * page silent.
   *
   * Deliberately EXCLUDES `fetchGamesState` — that is the public catalog fetch
   * (P-122). Including it is what let an admin-only 403 reach the public
   * HomePage alert, and it would put a public failure in the admin banner too.
   */
  const { loading: adminLoading, error: adminError } = aggregateActionStates([
    fetchAllGamesState,
    fetchGameState,
    enableGameState,
    disableGameState,
    fetchMapsState,
    setMapPoolState,
    catalogMapState,
    updateCatalogMapState,
    deleteCatalogMapState,
    fetchRankTiersState,
    setRankTiersState,
    updateTeamSizeState,
  ])

  /**
   * A page-1 fetch that silently drops everything past `per_page` is
   * indistinguishable from a complete catalog, and every caller here treats the
   * result as "all the games" — it backs the game filter selects on
   * `/tournaments`, `/leagues` and `/players`, where a missing game means a
   * tournament nobody can filter to.
   *
   * `warnIfTruncated` exists because the truncation risk is NEW. `per_page` on
   * this endpoint used to be decorative: the handler threaded it into the
   * response metadata and never applied it to the list (P-121), so this request
   * always received the whole catalog no matter what it asked for. Fixing the
   * handler to actually paginate made the cap real for the first time, which
   * means the comment that used to sit here — "past 100 games this needs a real
   * pager" — went from a hypothetical to a live cliff.
   *
   * It also made the cliff detectable, which it previously was not. The old
   * comment claimed there was no `PaginationMeta` to check; there is
   * (`PaginatedResponse` serialises `{data, pagination, meta}`), so the honest
   * thing is to compare the two and say so rather than truncate in silence. 100
   * is the server's hard cap (portal-api/src/dto/common.rs:47), so past that a
   * real pager is required and no `per_page` value can paper over it.
   */
  function warnIfTruncated(
    label: string,
    received: number,
    pagination: { total_items: number },
  ): void {
    if (pagination.total_items > received) {
      console.warn(
        `[games] ${label} returned ${received} of ${pagination.total_items} games. ` +
          `The catalog has outgrown the server's per_page cap of 100 and this list ` +
          `is now incomplete — game filters will be missing entries. This needs a ` +
          `real pager, not a larger per_page.`,
      )
    }
  }

  /** The public game catalog (active games only). */
  async function fetchGames(): Promise<GameSummary[]> {
    return withActionState(fetchGamesState, async () => {
      const result = await unwrapApi(api.GET('/v1/games', {
        params: { query: { per_page: 100 } },
      }))
      warnIfTruncated('fetchGames', result.data.length, result.pagination)
      games.value = result.data
      return games.value
    }, 'Failed to fetch games')
  }

  /**
   * The full catalog, disabled games included — `GET /v1/games?include_inactive=true`.
   *
   * P-88: the admin games table used to read `fetchGames`, i.e. `list_active()`.
   * Its Enable button exists only *inside* a row, so disabling a game removed
   * the row on the very next fetch and took the only control that could undo the
   * disable with it — the game was gone from the portal for good. The admin
   * surface therefore needs a list that is **not** filtered by status.
   *
   * The endpoint refuses this parameter without `admin.games.manage` rather than
   * silently returning the active list, so a 403 here means "not an admin", not
   * "no inactive games".
   */
  async function fetchAllGames(): Promise<GameSummary[]> {
    return withActionState(fetchAllGamesState, async () => {
      const result = await unwrapApi(api.GET('/v1/games', {
        params: { query: { per_page: 100, include_inactive: true } },
      }))
      warnIfTruncated('fetchAllGames', result.data.length, result.pagination)
      allGames.value = result.data
      return allGames.value
    }, 'Failed to fetch games')
  }

  async function fetchGame(gameId: string): Promise<GameDetail> {
    return withActionState(fetchGameState, async () => {
      const result = await unwrapApi(api.GET('/v1/games/{game_id}', {
        params: { path: { game_id: gameId } },
      }))
      currentGame.value = result.data
      return currentGame.value
    }, 'Failed to fetch game')
  }

  async function enableGame(gameId: string): Promise<GameSummary> {
    return withActionState(enableGameState, async () => {
      const result = await unwrapApi(api.POST('/v1/games/{game_id}/enable', {
        params: { path: { game_id: gameId } },
      }))
      const item = result.data
      // Update in whichever list holds it. `games` is active-only, so an
      // enable usually finds nothing there until the next public refetch;
      // `allGames` (the admin catalog) always holds the row.
      replaceById(games.value, item)
      replaceById(allGames.value, item)
      return item
    }, 'Failed to enable game')
  }

  async function disableGame(gameId: string): Promise<GameSummary> {
    return withActionState(disableGameState, async () => {
      const result = await unwrapApi(api.POST('/v1/games/{game_id}/disable', {
        params: { path: { game_id: gameId } },
      }))
      const item = result.data
      // `allGames` keeps the row (it is the unfiltered admin catalog, so this
      // patch matches what a refetch would return). `games` is active-only and
      // its copy is now stale, but the row is dropped on its next fetch.
      replaceById(games.value, item)
      replaceById(allGames.value, item)
      return item
    }, 'Failed to disable game')
  }

  // ==================== Maps ====================

  async function fetchMaps(gameId: string) {
    return withActionState(fetchMapsState, async () => {
      const result = await unwrapApi(api.GET('/v1/games/{game_id}/maps', {
        params: { path: { game_id: gameId } },
      }))
      return result.data
    }, 'Failed to fetch maps')
  }

  async function setMapPool(gameId: string, mapIds: string[]) {
    return withActionState(setMapPoolState, async () => {
      const result = await unwrapApi(api.PUT('/v1/games/{game_id}/maps', {
        params: { path: { game_id: gameId } },
        body: { map_ids: mapIds },
      }))
      return result.data
    }, 'Failed to set map pool')
  }

  async function catalogMap(gameId: string, data: AddMapRequest) {
    return withActionState(catalogMapState, async () => {
      const result = await unwrapApi(api.POST('/v1/games/{game_id}/maps/catalog', {
        params: { path: { game_id: gameId } },
        body: data,
      }))
      return result.data
    }, 'Failed to catalog map')
  }

  async function updateCatalogMap(gameId: string, mapId: string, data: UpdateMapRequest) {
    return withActionState(updateCatalogMapState, async () => {
      const result = await unwrapApi(api.PATCH('/v1/games/{game_id}/maps/catalog/{map_id}', {
        params: { path: { game_id: gameId, map_id: mapId } },
        body: data,
      }))
      return result.data
    }, 'Failed to update map')
  }

  async function deleteCatalogMap(gameId: string, mapId: string) {
    return withActionState(deleteCatalogMapState, async () => {
      await unwrapApi(api.DELETE('/v1/games/{game_id}/maps/catalog/{map_id}', {
        params: { path: { game_id: gameId, map_id: mapId } },
      }))
    }, 'Failed to delete map')
  }

  // ==================== Rank Tiers ====================

  async function fetchRankTiers(gameId: string) {
    return withActionState(fetchRankTiersState, async () => {
      const result = await unwrapApi(api.GET('/v1/games/{game_id}/rank-tiers', {
        params: { path: { game_id: gameId } },
      }))
      return result.data
    }, 'Failed to fetch rank tiers')
  }

  async function setRankTiers(gameId: string, rankTiers: components['schemas']['RankTierInput'][]) {
    return withActionState(setRankTiersState, async () => {
      const result = await unwrapApi(api.PUT('/v1/games/{game_id}/rank-tiers', {
        params: { path: { game_id: gameId } },
        body: { rank_tiers: rankTiers },
      }))
      return result.data
    }, 'Failed to set rank tiers')
  }

  // ==================== Team Size ====================

  async function updateTeamSize(gameId: string, config: { default?: number | null; min?: number | null; max?: number | null }) {
    return withActionState(updateTeamSizeState, async () => {
      const result = await unwrapApi(api.PATCH('/v1/games/{game_id}/team-size', {
        params: { path: { game_id: gameId } },
        body: config,
      }))
      return result.data
    }, 'Failed to update team size')
  }

  function clearCurrent() {
    currentGame.value = null
  }

  return {
    games,
    allGames,
    currentGame,
    adminLoading,
    adminError,
    fetchGamesState,
    fetchAllGamesState,
    fetchGameState,
    enableGameState,
    disableGameState,
    fetchGames,
    fetchAllGames,
    fetchGame,
    enableGame,
    disableGame,
    // Maps
    fetchMaps,
    setMapPool,
    catalogMap,
    updateCatalogMap,
    deleteCatalogMap,
    fetchMapsState,
    setMapPoolState,
    catalogMapState,
    updateCatalogMapState,
    deleteCatalogMapState,
    // Rank Tiers
    fetchRankTiers,
    setRankTiers,
    fetchRankTiersState,
    setRankTiersState,
    // Team Size
    updateTeamSize,
    updateTeamSizeState,
    clearCurrent,
  }
})

// Re-export types for convenience
export type { GameSummary, GameDetail, MapInfo, AddMapRequest, UpdateMapRequest }
