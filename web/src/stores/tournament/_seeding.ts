import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'

type SeededParticipantResponse = components['schemas']['SeededParticipantResponse']

/**
 * Seeding slice: tournament seeding + map pool management.
 */
export function createSeedingSlice() {
  const seeding = ref<SeededParticipantResponse[]>([])

  const fetchSeedingState = createActionState()
  const autoSeedState = createActionState()
  const manualSeedState = createActionState()
  const clearSeedingState = createActionState()
  const getMapPoolState = createActionState()
  const setMapPoolState = createActionState()
  const deleteMapPoolState = createActionState()

  async function fetchSeeding(tournamentId: string): Promise<SeededParticipantResponse[]> {
    return withActionState(fetchSeedingState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/seeding', {
        params: { path: { tournament_id: tournamentId } },
      }))
      seeding.value = result.data
      return seeding.value
    }, 'Failed to fetch seeding')
  }

  async function autoSeed(
    tournamentId: string,
    algorithm?: string,
  ): Promise<SeededParticipantResponse[]> {
    return withActionState(autoSeedState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/seeding/auto', {
        params: { path: { tournament_id: tournamentId } },
        body: algorithm ? { algorithm } : {},
      }))
      seeding.value = result.data
      return seeding.value
    }, 'Failed to auto-seed tournament')
  }

  async function manualSeed(
    tournamentId: string,
    seeds: Array<{ registration_id: string; seed: number }>
  ): Promise<SeededParticipantResponse[]> {
    return withActionState(manualSeedState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/seeding/manual', {
        params: { path: { tournament_id: tournamentId } },
        body: { seeds },
      }))
      seeding.value = result.data
      return seeding.value
    }, 'Failed to save manual seeding')
  }

  async function clearSeeding(tournamentId: string): Promise<void> {
    return withActionState(clearSeedingState, async () => {
      await unwrapApi(api.DELETE('/v1/tournaments/{tournament_id}/seeding', {
        params: { path: { tournament_id: tournamentId } },
      }))
      seeding.value = []
    }, 'Failed to clear seeding')
  }

  async function getTournamentMapPool(tournamentId: string) {
    return withActionState(getMapPoolState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/map-pool', {
        params: { path: { tournament_id: tournamentId } },
      }))
      return result.data
    }, 'Failed to fetch tournament map pool')
  }

  async function setTournamentMapPool(tournamentId: string, mapIds: string[]) {
    return withActionState(setMapPoolState, async () => {
      const result = await unwrapApi(api.PUT('/v1/tournaments/{tournament_id}/map-pool', {
        params: { path: { tournament_id: tournamentId } },
        body: { map_ids: mapIds },
      }))
      return result.data
    }, 'Failed to set tournament map pool')
  }

  async function deleteTournamentMapPool(tournamentId: string) {
    return withActionState(deleteMapPoolState, async () => {
      await unwrapApi(api.DELETE('/v1/tournaments/{tournament_id}/map-pool', {
        params: { path: { tournament_id: tournamentId } },
      }))
    }, 'Failed to delete tournament map pool')
  }

  function clear() {
    seeding.value = []
  }

  return {
    seeding,
    fetchSeedingState,
    autoSeedState,
    manualSeedState,
    clearSeedingState,
    getMapPoolState,
    setMapPoolState,
    deleteMapPoolState,
    fetchSeeding,
    autoSeed,
    manualSeed,
    clearSeeding,
    getTournamentMapPool,
    setTournamentMapPool,
    deleteTournamentMapPool,
    clear,
  }
}
