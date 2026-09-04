import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'
import { replaceById } from '@/utils/collections'

// Use generated types
type LeagueSeasonResponse = components['schemas']['LeagueSeasonResponse']
type CreateLeagueSeasonRequest = components['schemas']['CreateLeagueSeasonRequest']
type UpdateLeagueSeasonRequest = components['schemas']['UpdateLeagueSeasonRequest']

export const useLeagueSeasonsStore = defineStore('leagueSeasons', () => {
  const seasons = ref<LeagueSeasonResponse[]>([])
  const currentSeason = ref<LeagueSeasonResponse | null>(null)

  // Per-action states
  const fetchSeasonsState = createActionState()
  const createSeasonState = createActionState()
  const updateSeasonState = createActionState()
  const archiveSeasonState = createActionState()

  // Computed aliases for backward compatibility
  const loading = computed(() => fetchSeasonsState.loading)
  const error = computed({
    get: () => fetchSeasonsState.error,
    set: (val: string | null) => { fetchSeasonsState.error = val },
  })

  /** `includeArchived` is for operator views: the default listing is the one
   *  players see. */
  async function fetchSeasons(
    leagueId: string,
    includeArchived = false,
  ): Promise<LeagueSeasonResponse[]> {
    return withActionState(fetchSeasonsState, async () => {
      const result = await unwrapApi(api.GET('/v1/league-seasons', {
        params: { query: { league_id: leagueId, include_archived: includeArchived } },
      }))
      seasons.value = result.data
      return seasons.value
    }, 'Failed to fetch seasons')
  }

  // No single-season fetch here: P-67 retired it once as a superseded getter,
  // P-148's lock resolution briefly revived it, and P-200 (the lock riding on
  // the team-season response) killed its last consumer again. A dead action is
  // the shape of an unwired feature — deleted rather than left ambiguous.

  async function createSeason(seasonData: CreateLeagueSeasonRequest): Promise<LeagueSeasonResponse> {
    return withActionState(createSeasonState, async () => {
      const result = await unwrapApi(api.POST('/v1/league-seasons', {
        body: seasonData,
      }))
      const newSeason = result.data
      seasons.value = [...seasons.value, newSeason]
      currentSeason.value = newSeason
      return newSeason
    }, 'Failed to create season')
  }

  async function updateSeason(seasonId: string, seasonData: UpdateLeagueSeasonRequest): Promise<LeagueSeasonResponse> {
    return withActionState(updateSeasonState, async () => {
      const result = await unwrapApi(api.PATCH('/v1/league-seasons/{season_id}', {
        params: { path: { season_id: seasonId } },
        body: seasonData,
      }))
      const updatedSeason = result.data
      replaceById(seasons.value, updatedSeason)
      currentSeason.value = updatedSeason
      return updatedSeason
    }, 'Failed to update season')
  }

  /** Archive or restore a season. Archiving hides it from player-facing
   *  listings; its own status is untouched, so restoring is exact. */
  async function setSeasonArchived(
    seasonId: string,
    archived: boolean,
  ): Promise<LeagueSeasonResponse> {
    return withActionState(archiveSeasonState, async () => {
      const path = archived
        ? '/v1/league-seasons/{season_id}/archive'
        : '/v1/league-seasons/{season_id}/restore'
      const result = await unwrapApi(api.POST(path, {
        params: { path: { season_id: seasonId } },
      }))
      const updated = result.data
      replaceById(seasons.value, updated)
      if (currentSeason.value?.id === seasonId) currentSeason.value = updated
      return updated
    }, archived ? 'Failed to archive season' : 'Failed to restore season')
  }

  function clearCurrent() {
    currentSeason.value = null
  }

  function clearSeasons() {
    seasons.value = []
    currentSeason.value = null
  }

  return {
    seasons,
    currentSeason,
    loading,
    error,
    fetchSeasons,
    createSeason,
    updateSeason,
    setSeasonArchived,
    clearCurrent,
    clearSeasons,
    // Per-action states
    fetchSeasonsState,
    createSeasonState,
    updateSeasonState,
    archiveSeasonState,
  }
})

// Re-export types for convenience
export type { LeagueSeasonResponse, CreateLeagueSeasonRequest, UpdateLeagueSeasonRequest }
