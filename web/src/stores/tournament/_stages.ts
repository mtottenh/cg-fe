import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import type { CreateStageRequest } from '@/api/overrides'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'

type TournamentStageResponse = components['schemas']['TournamentStageResponse']
type UpdateStageRequest = components['schemas']['UpdateTournamentStageRequest']

/**
 * Stages slice: multi-phase tournament stages (group stage + playoffs, etc.).
 */
export function createStagesSlice() {
  const stages = ref<TournamentStageResponse[]>([])

  const fetchStagesState = createActionState()
  const createStageState = createActionState()
  const updateStageState = createActionState()

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

  async function updateStage(
    tournamentId: string,
    stageId: string,
    request: UpdateStageRequest,
  ): Promise<TournamentStageResponse> {
    return withActionState(updateStageState, async () => {
      const result = await unwrapApi(api.PATCH('/v1/tournaments/{tournament_id}/stages/{stage_id}', {
        params: { path: { tournament_id: tournamentId, stage_id: stageId } },
        body: request,
      }))
      const idx = stages.value.findIndex((s) => s.id === stageId)
      if (idx !== -1) stages.value[idx] = result.data
      return result.data
    }, 'Failed to update stage')
  }

  function clear() {
    stages.value = []
  }

  return {
    stages,
    fetchStagesState,
    createStageState,
    updateStageState,
    fetchStages,
    createStage,
    updateStage,
    clear,
  }
}
