import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'
import { replaceById } from '@/utils/collections'

// Use generated types
type GameSummary = components['schemas']['GameSummaryResponse']
type GameDetail = components['schemas']['GameDetailResponse']
type MapInfo = components['schemas']['MapInfoResponse']
type AddMapRequest = components['schemas']['AddMapRequest']
type UpdateMapRequest = components['schemas']['UpdateMapRequest']

export const useGamesStore = defineStore('games', () => {
  const games = ref<GameSummary[]>([])
  const currentGame = ref<GameDetail | null>(null)
  const loading = computed(() => fetchGamesState.loading)
  const error = computed({
    get: () => fetchGamesState.error,
    set: (val: string | null) => { fetchGamesState.error = val },
  })

  const fetchGamesState = createActionState()
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
   * The game catalog. Every caller treats this as "all the games" — it backs
   * the game filter selects on `/tournaments`, `/leagues` and `/players` — but
   * `GET /v1/games` is paginated server-side and the request carried no
   * `per_page`, so it silently returned only the first 20
   * (portal-api/src/handlers/games.rs:32 takes `Query<PaginationParams>`,
   * default 20). The catalog is admin-curated and tiny today, so 100 — the
   * server's hard cap (portal-api/src/dto/common.rs:47) — covers it with room
   * to spare. Past 100 games this needs a real pager; there is no response
   * `PaginationMeta` on this endpoint to detect that from, which is recorded in
   * the sweep notes.
   */
  async function fetchGames(): Promise<GameSummary[]> {
    return withActionState(fetchGamesState, async () => {
      const result = await unwrapApi(api.GET('/v1/games', {
        params: { query: { per_page: 100 } },
      }))
      games.value = result.data
      return games.value
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
      // Update in list if present
      replaceById(games.value, item)
      return item
    }, 'Failed to enable game')
  }

  async function disableGame(gameId: string): Promise<GameSummary> {
    return withActionState(disableGameState, async () => {
      const result = await unwrapApi(api.POST('/v1/games/{game_id}/disable', {
        params: { path: { game_id: gameId } },
      }))
      const item = result.data
      // Update in list if present
      replaceById(games.value, item)
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
    currentGame,
    loading,
    error,
    fetchGamesState,
    fetchGameState,
    enableGameState,
    disableGameState,
    fetchGames,
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
