import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import type { CreateStageRequest } from '@/api/overrides'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'

type TournamentStageResponse = components['schemas']['TournamentStageResponse']

/**
 * Stages slice: multi-phase tournament stages (group stage + playoffs, etc.).
 */
export function createStagesSlice() {
  const stages = ref<TournamentStageResponse[]>([])

  const fetchStagesState = createActionState()
  const createStageState = createActionState()

  async function fetchStages(tournamentId: string): Promise<TournamentStageResponse[]> {
    return withActionState(fetchStagesState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/stages', {
        params: { path: { tournament_id: tournamentId } },
      }))
      stages.value = result.data
      return stages.value
    }, 'Failed to fetch stages')
  }

  async function createStage(
    tournamentId: string,
    request: CreateStageRequest,
  ): Promise<TournamentStageResponse> {
    return withActionState(createStageState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/stages', {
        params: { path: { tournament_id: tournamentId } },
        body: request,
      }))
      stages.value.push(result.data)
      return result.data
    }, 'Failed to create stage')
  }

  function clear() {
    stages.value = []
  }

  return {
    stages,
    fetchStagesState,
    createStageState,
    fetchStages,
    createStage,
    clear,
  }
}
