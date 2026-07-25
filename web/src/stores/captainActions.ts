import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, getAuthToken } from '@/api'
import { createActionState, unwrapApi, withActionState } from '@/stores/helpers/apiAction'
import type { components } from '@/api/types'

/**
 * Aliased to the generated DTO rather than restated. The hand-written interface
 * this replaces declared `deadline: string | null`, while the DTO marks it
 * `#[serde(skip_serializing_if = "Option::is_none")]` — i.e. absent, not null —
 * so the two disagreed on the one field every consumer branches on.
 */
export type CaptainAction = components['schemas']['ActionItemResponse']

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
      // P-65: this used `api.GET('…' as never)` with hand-rolled `unknown` casts on
      // the result, because the operation was missing from `paths(...)` in
      // `openapi.rs` and so had no generated type. The route and the
      // `#[utoipa::path]` annotation both existed; only the registration line was
      // absent. It is registered now, so the call is typed end to end and the
      // response shape is checked against the DTO instead of asserted.
      const result = await unwrapApi(api.GET('/v1/users/me/action-items'))
      actions.value = result.data
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

function getUrgencyRank(deadline: string | null | undefined): number {
  if (!deadline) return 3
  const diff = new Date(deadline).getTime() - Date.now()
  if (diff < 3600000) return 1 // critical: < 1h
  if (diff < 86400000) return 2 // urgent: < 24h
  return 3 // normal
}
