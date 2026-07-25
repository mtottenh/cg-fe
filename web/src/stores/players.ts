import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState, aggregateActionStates } from '@/stores/helpers'

// Use generated types
type Player = components['schemas']['PlayerResponse']
type PlayerSearchResult = components['schemas']['PlayerSearchResponse']
type SocialLinks = components['schemas']['SocialLinksResponse']
type UpdateProfileRequest = components['schemas']['UpdatePlayerProfileRequest']
type PaginationMeta = components['schemas']['PaginationMeta']
type SubmitRatingRequest = components['schemas']['SubmitRatingRequest']
type PlayerGameProfile = components['schemas']['PlayerGameProfileResponse']
type PlayerRatingHistory = components['schemas']['PlayerRatingHistoryResponse']

/**
 * @deprecated The old PlayerTeamMembershipResponse type has been replaced with league team memberships.
 * Use /v1/players/me/league-teams for the current player's league team memberships.
 */
interface PlayerTeam {
  team_id: string
  team_name: string
  team_tag: string
  team_logo_url: string | null
  role: string
  joined_at: string
}

export const usePlayersStore = defineStore('players', () => {
  const players = ref<PlayerSearchResult[]>([])
  const currentPlayer = ref<Player | null>(null)
  const playerTeams = ref<PlayerTeam[]>([])
  const myMatches = ref<components['schemas']['TournamentMatchResponse'][]>([])
  const pagination = ref<PaginationMeta>({ page: 1, per_page: 20, total_items: 0, total_pages: 0 })

  const fetchPlayersState = createActionState()
  const fetchPlayerState = createActionState()
  const fetchMyProfileState = createActionState()
  const updateMyProfileState = createActionState()
  const fetchMyMatchesState = createActionState()
  const submitPlayerRatingState = createActionState()
  const fetchRatingHistoryState = createActionState()

  const { loading, error } = aggregateActionStates([
    fetchPlayersState, fetchPlayerState, fetchMyProfileState,
    updateMyProfileState, fetchMyMatchesState,
  ])

  async function fetchPlayers(filters?: {
    q?: string
    game_id?: string
    team_status?: string
    country_code?: string
    page?: number
    per_page?: number
  }) {
    return withActionState(fetchPlayersState, async () => {
      const result = await unwrapApi(api.GET('/v1/players', {
        params: {
          query: {
            page: filters?.page ?? 1,
            per_page: filters?.per_page ?? 20,
            q: filters?.q,
            game_id: filters?.game_id,
            team_status: filters?.team_status,
            country_code: filters?.country_code,
          },
        },
      }))
      players.value = result.data
      pagination.value = result.pagination
      return players.value
    }, 'Failed to fetch players')
  }

  async function fetchPlayer(id: string) {
    return withActionState(fetchPlayerState, async () => {
      const result = await unwrapApi(api.GET('/v1/players/{player_id}', {
        params: { path: { player_id: id } },
      }))
      currentPlayer.value = result.data
      return currentPlayer.value
    }, 'Failed to fetch player')
  }

  /**
   * @deprecated The old /v1/players/{player_id}/teams endpoint has been removed.
   * Use /v1/players/{player_id}/league-teams for league team memberships instead.
   */
  async function fetchPlayerTeams(_playerId: string): Promise<PlayerTeam[]> {
    console.warn('[DEPRECATED] usePlayersStore.fetchPlayerTeams - Use /v1/players/{player_id}/league-teams instead')
    error.value = 'Player teams are now managed through league teams. Please use the new league team endpoints.'
    return []
  }

  async function fetchMyProfile() {
    return withActionState(fetchMyProfileState, async () => {
      const result = await unwrapApi(api.GET('/v1/players/me'))
      currentPlayer.value = result.data
      return currentPlayer.value
    }, 'Failed to fetch profile')
  }

  async function updateMyProfile(profileData: UpdateProfileRequest) {
    return withActionState(updateMyProfileState, async () => {
      const result = await unwrapApi(api.PATCH('/v1/players/me', {
        body: profileData,
      }))
      currentPlayer.value = result.data
      return currentPlayer.value
    }, 'Failed to update profile')
  }

  async function fetchMyMatches(filters?: {
    status?: string
    tournament_id?: string
    limit?: number
    offset?: number
  }) {
    return withActionState(fetchMyMatchesState, async () => {
      const result = await unwrapApi(api.GET('/v1/users/me/matches', {
        params: { query: filters },
      }))
      myMatches.value = result.data
      return myMatches.value
    }, 'Failed to fetch matches')
  }

  /**
   * P-68: operator override for a wrong scraped rating.
   *
   * Ratings normally arrive from the enricher's demo-derived path
   * (`handlers/internal.rs process_demo_ratings`). That value drives seeding
   * and league entry gates (`min_rating_per_player`), so a bad extraction
   * silently misseeds brackets and can lock a player out of a league — and
   * until now `POST /v1/players/{id}/games/{game}/rating` had no UI consumer
   * at all, so there was no remedy short of SQL.
   *
   * `source` is the audit trail: it is stored verbatim on the history row
   * (`player_rating_history.source`, VARCHAR(64)) and is the only free-text
   * field the table has — there is no separate `reason` column, so the
   * operator's reason goes here rather than being collected and discarded
   * (P-84/P-94).
   */
  async function submitPlayerRating(
    playerId: string,
    gameId: string,
    body: SubmitRatingRequest,
  ): Promise<PlayerGameProfile> {
    return withActionState(submitPlayerRatingState, async () => {
      const result = await unwrapApi(api.POST('/v1/players/{player_id}/games/{game_id}/rating', {
        params: { path: { player_id: playerId, game_id: gameId } },
        body,
      }))
      return result.data
    }, 'Failed to submit rating')
  }

  /** Rating history for a player+game, newest first. */
  async function fetchRatingHistory(
    playerId: string,
    gameId: string,
    limit = 10,
  ): Promise<PlayerRatingHistory[]> {
    return withActionState(fetchRatingHistoryState, async () => {
      const result = await unwrapApi(
        api.GET('/v1/players/{player_id}/games/{game_id}/rating-history', {
          params: { path: { player_id: playerId, game_id: gameId }, query: { limit } },
        }),
      )
      return result.data
    }, 'Failed to fetch rating history')
  }

  return {
    players,
    currentPlayer,
    playerTeams,
    myMatches,
    loading,
    error,
    pagination,
    fetchPlayersState,
    fetchPlayerState,
    fetchMyProfileState,
    updateMyProfileState,
    fetchPlayers,
    fetchPlayer,
    fetchPlayerTeams,
    fetchMyProfile,
    updateMyProfile,
    fetchMyMatches,
    fetchMyMatchesState,
    submitPlayerRating,
    submitPlayerRatingState,
    fetchRatingHistory,
    fetchRatingHistoryState,
  }
})

// Re-export types for convenience
export type {
  Player,
  PlayerSearchResult,
  PlayerTeam,
  SocialLinks,
  UpdateProfileRequest,
  SubmitRatingRequest,
  PlayerGameProfile,
  PlayerRatingHistory,
}
