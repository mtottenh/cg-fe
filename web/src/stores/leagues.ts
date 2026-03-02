import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'

// Use generated types
type LeagueResponse = components['schemas']['LeagueResponse']
type CreateLeagueRequest = components['schemas']['CreateLeagueRequest']
type UpdateLeagueRequest = components['schemas']['UpdateLeagueRequest']
type UserLeagueMembership = components['schemas']['UserLeagueMembershipResponse']
type PaginationMeta = components['schemas']['PaginationMeta']

export const useLeaguesStore = defineStore('leagues', () => {
  const leagues = ref<LeagueResponse[]>([])
  const currentLeague = ref<LeagueResponse | null>(null)
  const myLeagues = ref<UserLeagueMembership[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pagination = ref<PaginationMeta>({ page: 1, per_page: 20, total_items: 0, total_pages: 0 })

  // Per-action states
  const fetchLeaguesState = createActionState()
  const fetchLeagueState = createActionState()
  const fetchLeagueBySlugState = createActionState()
  const createLeagueState = createActionState()
  const updateLeagueState = createActionState()
  const fetchMyLeaguesState = createActionState()
  const joinLeagueState = createActionState()
  const leaveLeagueState = createActionState()

  async function fetchLeagues(page = 1, perPage = 20, gameId?: string): Promise<LeagueResponse[]> {
    return withActionState(fetchLeaguesState, async () => {
      const result = await unwrapApi(api.GET('/v1/leagues', {
        params: { query: { page, per_page: perPage, game_id: gameId } },
      }))
      leagues.value = result.data
      pagination.value = result.pagination
      return leagues.value
    }, 'Failed to fetch leagues')
  }

  async function fetchLeague(leagueId: string): Promise<LeagueResponse> {
    return withActionState(fetchLeagueState, async () => {
      const result = await unwrapApi(api.GET('/v1/leagues/{league_id}', {
        params: { path: { league_id: leagueId } },
      }))
      currentLeague.value = result.data
      return currentLeague.value
    }, 'Failed to fetch league')
  }

  async function fetchLeagueBySlug(slug: string): Promise<LeagueResponse> {
    return withActionState(fetchLeagueBySlugState, async () => {
      const result = await unwrapApi(api.GET('/v1/leagues/by-slug/{slug}', {
        params: { path: { slug } },
      }))
      currentLeague.value = result.data
      return currentLeague.value
    }, 'Failed to fetch league')
  }

  async function createLeague(leagueData: CreateLeagueRequest): Promise<LeagueResponse> {
    return withActionState(createLeagueState, async () => {
      const result = await unwrapApi(api.POST('/v1/leagues', {
        body: leagueData,
      }))
      const newLeague = result.data
      leagues.value = [...leagues.value, newLeague]
      currentLeague.value = newLeague
      return newLeague
    }, 'Failed to create league')
  }

  async function updateLeague(leagueId: string, leagueData: UpdateLeagueRequest): Promise<LeagueResponse> {
    return withActionState(updateLeagueState, async () => {
      const result = await unwrapApi(api.PATCH('/v1/leagues/{league_id}', {
        params: { path: { league_id: leagueId } },
        body: leagueData,
      }))
      const updatedLeague = result.data
      const index = leagues.value.findIndex(l => l.id === leagueId)
      if (index !== -1) {
        leagues.value[index] = updatedLeague
      }
      currentLeague.value = updatedLeague
      return updatedLeague
    }, 'Failed to update league')
  }

  async function fetchMyLeagues(): Promise<UserLeagueMembership[]> {
    return withActionState(fetchMyLeaguesState, async () => {
      const result = await unwrapApi(api.GET('/v1/users/me/leagues'))
      myLeagues.value = result as unknown as UserLeagueMembership[]
      return myLeagues.value
    }, 'Failed to fetch my leagues')
  }

  async function joinLeague(leagueId: string): Promise<void> {
    return withActionState(joinLeagueState, async () => {
      await unwrapApi(api.POST('/v1/leagues/{league_id}/join', {
        params: { path: { league_id: leagueId } },
      }))
      await fetchMyLeagues()
    }, 'Failed to join league')
  }

  async function leaveLeague(leagueId: string): Promise<void> {
    return withActionState(leaveLeagueState, async () => {
      await unwrapApi(api.POST('/v1/leagues/{league_id}/leave', {
        params: { path: { league_id: leagueId } },
      }))
      myLeagues.value = myLeagues.value.filter(m => m.league_id !== leagueId)
    }, 'Failed to leave league')
  }

  function clearCurrent() {
    currentLeague.value = null
  }

  return {
    leagues,
    currentLeague,
    myLeagues,
    loading,
    error,
    pagination,
    fetchLeagues,
    fetchLeague,
    fetchLeagueBySlug,
    createLeague,
    updateLeague,
    fetchMyLeagues,
    joinLeague,
    leaveLeague,
    clearCurrent,
    // Per-action states
    fetchLeaguesState,
    fetchLeagueState,
    fetchLeagueBySlugState,
    createLeagueState,
    updateLeagueState,
    fetchMyLeaguesState,
    joinLeagueState,
    leaveLeagueState,
  }
})

// Re-export types for convenience
export type { LeagueResponse, CreateLeagueRequest, UpdateLeagueRequest, UserLeagueMembership }
