import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, getAuthToken } from '@/api'
import { createActionState, withActionState } from '@/stores/helpers/apiAction'

export interface CaptainAction {
  action_type: string
  match_id: string
  tournament_id: string
  tournament_slug: string
  tournament_name: string
  match_label: string
  deadline: string | null
  created_at: string
}

export const useCaptainActionsStore = defineStore('captainActions', () => {
  const actions = ref<CaptainAction[]>([])

  const fetchActionsState = createActionState()
  const loading = computed(() => fetchActionsState.loading)
  const error = computed({
    get: () => fetchActionsState.error,
    set: (val: string | null) => { fetchActionsState.error = val },
  })

  const actionCount = computed(() => actions.value.length)

  const hasCritical = computed(() =>
    actions.value.some((a) => {
      if (!a.deadline) return false
      const diff = new Date(a.deadline).getTime() - Date.now()
      return diff < 3600000 // < 1 hour
    })
  )

  const sortedActions = computed(() => {
    return [...actions.value].sort((a, b) => {
      const urgencyA = getUrgencyRank(a.deadline)
      const urgencyB = getUrgencyRank(b.deadline)
      if (urgencyA !== urgencyB) return urgencyA - urgencyB
      // Then by deadline ascending (soonest first)
      if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
      if (a.deadline) return -1
      if (b.deadline) return 1
      return 0
    })
  })

  async function fetchActions() {
    const token = getAuthToken()
    if (!token) return

    return withActionState(fetchActionsState, async () => {
      // Endpoint not in OpenAPI spec — use api client for auth middleware benefits
      const { data, error: apiError } = await api.GET('/v1/users/me/action-items' as never)
      if (apiError) {
        throw new Error((apiError as Record<string, string>).detail || 'Failed to fetch action items')
      }
      actions.value = ((data as Record<string, unknown>)?.data as CaptainAction[]) ?? []
    }, 'Failed to fetch action items')
  }

  function $reset() {
    actions.value = []
    fetchActionsState.loading = false
    fetchActionsState.error = null
  }

  return {
    actions,
    loading,
    error,
    fetchActionsState,
    actionCount,
    hasCritical,
    sortedActions,
    fetchActions,
    $reset,
  }
})

function getUrgencyRank(deadline: string | null): number {
  if (!deadline) return 3
  const diff = new Date(deadline).getTime() - Date.now()
  if (diff < 3600000) return 1 // critical: < 1h
  if (diff < 86400000) return 2 // urgent: < 24h
  return 3 // normal
}
