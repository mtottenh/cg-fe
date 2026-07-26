import { ref } from 'vue'
import { api, ApiError } from '@/api'
import { unwrapApi, unwrapApiOptional } from '@/stores/helpers'
import type { components } from '@/api/types'

type PublicMmStatsResponse = components['schemas']['PublicMmStatsResponse']
type PlayerRatingHistoryResponse = components['schemas']['PlayerRatingHistoryResponse']
type MatchHistoryEntryResponse = components['schemas']['MatchHistoryEntryResponse']

const GAME_SLUG = 'cs2'
const MATCH_HISTORY_PAGE_SIZE = 10

export function usePlayerStats(playerId: string) {
  const mmStats = ref<PublicMmStatsResponse | null>(null)
  const mmStatsLoading = ref(false)
  const mmStatsError = ref<string | null>(null)
  const mmStatsNotTracked = ref(false)

  const ratingHistory = ref<PlayerRatingHistoryResponse[]>([])
  const ratingHistoryLoading = ref(false)
  const ratingHistoryError = ref<string | null>(null)

  const matchHistory = ref<MatchHistoryEntryResponse[]>([])
  const matchHistoryLoading = ref(false)
  const matchHistoryError = ref<string | null>(null)
  const matchHistoryHasMore = ref(true)
  const matchHistoryOffset = ref(0)

  async function fetchMmStats(): Promise<void> {
    mmStatsLoading.value = true
    mmStatsError.value = null
    mmStatsNotTracked.value = false
    try {
      // 404 is valid: player has no MM stats yet.
      const result = await unwrapApiOptional(api.GET(
        '/v1/players/{player_id}/games/{game_id}/mm-stats',
        { params: { path: { player_id: playerId, game_id: GAME_SLUG } } },
      ))
      if (result === null) {
        mmStatsNotTracked.value = true
      } else {
        mmStats.value = result.data
      }
    } catch (e: unknown) {
      mmStatsError.value = e instanceof ApiError ? e.detail : 'Failed to fetch MM stats'
    } finally {
      mmStatsLoading.value = false
    }
  }

  async function fetchRatingHistory(limit = 50): Promise<void> {
    ratingHistoryLoading.value = true
    ratingHistoryError.value = null
    try {
      const result = await unwrapApi(api.GET(
        '/v1/players/{player_id}/games/{game_id}/rating-history',
        { params: { path: { player_id: playerId, game_id: GAME_SLUG }, query: { limit } } },
      ))
      ratingHistory.value = result.data
    } catch {
      ratingHistoryError.value = 'Failed to load rating history'
    } finally {
      ratingHistoryLoading.value = false
    }
  }

  async function fetchMatchHistory(): Promise<void> {
    matchHistoryLoading.value = true
    matchHistoryError.value = null
    matchHistoryOffset.value = 0
    try {
      const result = await unwrapApi(api.GET(
        '/v1/players/{player_id}/games/{game_id}/match-history',
        {
          params: {
            path: { player_id: playerId, game_id: GAME_SLUG },
            query: { limit: MATCH_HISTORY_PAGE_SIZE, offset: 0 },
          },
        },
      ))
      matchHistory.value = result.data
      matchHistoryHasMore.value = result.data.length >= MATCH_HISTORY_PAGE_SIZE
    } catch {
      matchHistoryError.value = 'Failed to load match history'
    } finally {
      matchHistoryLoading.value = false
    }
  }

  async function loadMoreMatchHistory(): Promise<void> {
    matchHistoryLoading.value = true
    const newOffset = matchHistoryOffset.value + MATCH_HISTORY_PAGE_SIZE
    try {
      const result = await unwrapApi(api.GET(
        '/v1/players/{player_id}/games/{game_id}/match-history',
        {
          params: {
            path: { player_id: playerId, game_id: GAME_SLUG },
            query: { limit: MATCH_HISTORY_PAGE_SIZE, offset: newOffset },
          },
        },
      ))
      matchHistoryOffset.value = newOffset
      matchHistory.value = [...matchHistory.value, ...result.data]
      matchHistoryHasMore.value = result.data.length >= MATCH_HISTORY_PAGE_SIZE
    } catch {
      matchHistoryError.value = 'Failed to load more match history'
    } finally {
      matchHistoryLoading.value = false
    }
  }

  return {
    mmStats,
    mmStatsLoading,
    mmStatsError,
    mmStatsNotTracked,
    ratingHistory,
    ratingHistoryLoading,
    ratingHistoryError,
    matchHistory,
    matchHistoryLoading,
    matchHistoryError,
    matchHistoryHasMore,
    fetchMmStats,
    fetchRatingHistory,
    fetchMatchHistory,
    loadMoreMatchHistory,
  }
}
