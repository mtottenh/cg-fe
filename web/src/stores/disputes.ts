import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, unwrapApiOptional, createActionState, withActionState, aggregateActionStates } from '@/stores/helpers'
import {
  disputeStatusMap,
  disputePriorityMap,
  disputeReasonMap,
  getStatusColor as getMapColor,
  getStatusLabel as getMapLabel,
} from '@/utils/statusMaps'

type DisputeResponse = components['schemas']['DisputeResponse']
type DisputeMessageResponse = components['schemas']['DisputeMessageResponse']
type DisputeResolutionResultResponse = components['schemas']['DisputeResolutionResultResponse']
type ResolveUpholdRequest = components['schemas']['ResolveUpholdRequest']
type ResolveOverturnRequest = components['schemas']['ResolveOverturnRequest']
type ResolveAdjustedRequest = components['schemas']['ResolveAdjustedRequest']
type ResolveRematchRequest = components['schemas']['ResolveRematchRequest']
type ResolveDoubleDqRequest = components['schemas']['ResolveDoubleDqRequest']

export interface DisputeFilters {
  status?: string
  priority?: string
  tournament_id?: string
  match_id?: string
  page?: number
  page_size?: number
}

export const useDisputesStore = defineStore('disputes', () => {
  // State
  const disputes = ref<DisputeResponse[]>([])
  const currentDispute = ref<DisputeResponse | null>(null)
  const currentThread = ref<DisputeMessageResponse[]>([])
  const pagination = ref({ page: 1, page_size: 20, total: 0 })

  // Per-action states
  const fetchDisputesState = createActionState()
  const fetchDisputeState = createActionState()
  const assignDisputeState = createActionState()
  const addMessageState = createActionState()
  const resolveUpholdState = createActionState()
  const resolveOverturnState = createActionState()
  const resolveAdjustedState = createActionState()
  const resolveRematchState = createActionState()
  const resolveDoubleDqState = createActionState()
  const fetchMatchDisputeState = createActionState()

  const { loading, error } = aggregateActionStates([
    fetchDisputesState, fetchDisputeState, assignDisputeState, addMessageState,
    resolveUpholdState, resolveOverturnState, resolveAdjustedState,
    resolveRematchState, resolveDoubleDqState, fetchMatchDisputeState,
  ])

  // ==================== Match Dispute Lookup ====================

  const matchDispute = ref<DisputeResponse | null>(null)

  async function fetchMatchDispute(
    tournamentId: string,
    matchId: string
  ): Promise<DisputeResponse | null> {
    return withActionState(fetchMatchDisputeState, async () => {
      // 404 = no active dispute (a valid state) → null. Any other failure
      // (500, auth, network) must surface through the action state instead
      // of silently rendering as "no dispute".
      const result = await unwrapApiOptional(api.GET('/v1/tournaments/{tournament_id}/matches/{match_id}/dispute', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
      }))
      matchDispute.value = result?.data ?? null
      return matchDispute.value
    }, 'Failed to fetch match dispute')
  }

  // ==================== Admin: Dispute List ====================

  async function fetchDisputes(filters: DisputeFilters = {}): Promise<DisputeResponse[]> {
    return withActionState(fetchDisputesState, async () => {
      const result = await unwrapApi(api.GET('/v1/admin/disputes', {
        params: {
          query: {
            status: filters.status || undefined,
            priority: filters.priority || undefined,
            tournament_id: filters.tournament_id || undefined,
            match_id: filters.match_id || undefined,
            page: filters.page ?? pagination.value.page,
            page_size: filters.page_size ?? pagination.value.page_size,
          },
        },
      }))
      disputes.value = result.data.disputes
      pagination.value.total = result.data.total ?? 0
      if (filters.page) pagination.value.page = filters.page
      return disputes.value
    }, 'Failed to fetch disputes')
  }

  async function fetchDispute(disputeId: string): Promise<void> {
    return withActionState(fetchDisputeState, async () => {
      const result = await unwrapApi(api.GET('/v1/disputes/{dispute_id}', {
        params: { path: { dispute_id: disputeId } },
      }))
      currentDispute.value = result.data.dispute
      currentThread.value = result.data.messages
    }, 'Failed to fetch dispute')
  }

  async function assignDispute(disputeId: string): Promise<DisputeResponse> {
    return withActionState(assignDisputeState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/disputes/{dispute_id}/assign', {
        params: { path: { dispute_id: disputeId } },
      }))
      const updated = result.data
      currentDispute.value = updated
      // Update in list
      const idx = disputes.value.findIndex(d => d.id === disputeId)
      if (idx !== -1) disputes.value[idx] = updated
      return updated
    }, 'Failed to assign dispute')
  }

  async function addMessage(
    disputeId: string,
    message: string,
    isInternal: boolean = false,
    evidenceIds: string[] = []
  ): Promise<DisputeMessageResponse> {
    return withActionState(addMessageState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/disputes/{dispute_id}/messages', {
        params: { path: { dispute_id: disputeId } },
        body: { message, is_internal: isInternal, evidence_ids: evidenceIds },
      }))
      const msg = result.data
      currentThread.value.push(msg)
      return msg
    }, 'Failed to add message')
  }

  async function resolveUphold(disputeId: string, notes: string): Promise<DisputeResolutionResultResponse> {
    return withActionState(resolveUpholdState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/disputes/{dispute_id}/resolve/uphold', {
        params: { path: { dispute_id: disputeId } },
        body: { notes } as ResolveUpholdRequest,
      }))
      currentDispute.value = result.data.dispute
      updateDisputeInList(disputeId, result.data.dispute)
      return result.data
    }, 'Failed to uphold dispute')
  }

  async function resolveOverturn(disputeId: string, body: ResolveOverturnRequest): Promise<DisputeResolutionResultResponse> {
    return withActionState(resolveOverturnState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/disputes/{dispute_id}/resolve/overturn', {
        params: { path: { dispute_id: disputeId } },
        body,
      }))
      currentDispute.value = result.data.dispute
      updateDisputeInList(disputeId, result.data.dispute)
      return result.data
    }, 'Failed to overturn dispute')
  }

  async function resolveAdjusted(disputeId: string, body: ResolveAdjustedRequest): Promise<DisputeResolutionResultResponse> {
    return withActionState(resolveAdjustedState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/disputes/{dispute_id}/resolve/adjusted', {
        params: { path: { dispute_id: disputeId } },
        body,
      }))
      currentDispute.value = result.data.dispute
      updateDisputeInList(disputeId, result.data.dispute)
      return result.data
    }, 'Failed to adjust dispute scores')
  }

  async function resolveRematch(disputeId: string, notes: string): Promise<DisputeResolutionResultResponse> {
    return withActionState(resolveRematchState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/disputes/{dispute_id}/resolve/rematch', {
        params: { path: { dispute_id: disputeId } },
        body: { notes } as ResolveRematchRequest,
      }))
      currentDispute.value = result.data.dispute
      updateDisputeInList(disputeId, result.data.dispute)
      return result.data
    }, 'Failed to order rematch')
  }

  async function resolveDoubleDq(disputeId: string, notes: string): Promise<DisputeResolutionResultResponse> {
    return withActionState(resolveDoubleDqState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/disputes/{dispute_id}/resolve/double-dq', {
        params: { path: { dispute_id: disputeId } },
        body: { notes } as ResolveDoubleDqRequest,
      }))
      currentDispute.value = result.data.dispute
      updateDisputeInList(disputeId, result.data.dispute)
      return result.data
    }, 'Failed to double DQ')
  }

  function updateDisputeInList(disputeId: string, updated: DisputeResponse) {
    const idx = disputes.value.findIndex(d => d.id === disputeId)
    if (idx !== -1) disputes.value[idx] = updated
  }

  // ==================== Player-Side Actions ====================

  const addPlayerMessageState = createActionState()

  async function addPlayerMessage(
    disputeId: string,
    message: string,
    evidenceIds: string[] = []
  ): Promise<DisputeMessageResponse> {
    return withActionState(addPlayerMessageState, async () => {
      const result = await unwrapApi(api.POST('/v1/disputes/{dispute_id}/messages', {
        params: { path: { dispute_id: disputeId } },
        body: { message, evidence_ids: evidenceIds },
      }))
      const msg = result.data
      currentThread.value.push(msg)
      return msg
    }, 'Failed to send message')
  }

  function clear() {
    disputes.value = []
    currentDispute.value = null
    currentThread.value = []
    matchDispute.value = null
    pagination.value = { page: 1, page_size: 20, total: 0 }
    error.value = null
  }

  function $reset() {
    clear()
  }

  return {
    // State
    disputes,
    currentDispute,
    currentThread,
    pagination,
    loading,
    error,

    // Per-action states
    fetchDisputesState,
    fetchDisputeState,
    assignDisputeState,
    addMessageState,
    resolveUpholdState,
    resolveOverturnState,
    resolveAdjustedState,
    resolveRematchState,
    resolveDoubleDqState,

    // Actions
    fetchDisputes,
    fetchDispute,
    assignDispute,
    addMessage,
    resolveUphold,
    resolveOverturn,
    resolveAdjusted,
    resolveRematch,
    resolveDoubleDq,

    // Match Dispute Lookup
    matchDispute,
    fetchMatchDispute,
    fetchMatchDisputeState,

    // Player-Side Actions
    addPlayerMessage,
    addPlayerMessageState,

    // Utility
    clear,
    $reset,
  }
})

export type {
  DisputeResponse,
  DisputeMessageResponse,
  DisputeResolutionResultResponse,
  ResolveOverturnRequest,
  ResolveAdjustedRequest,
}

export function getDisputeStatusColor(status: string): string {
  return getMapColor(disputeStatusMap, status)
}

export function getDisputeStatusLabel(status: string): string {
  return getMapLabel(disputeStatusMap, status)
}

export function getDisputePriorityColor(priority: string): string {
  return getMapColor(disputePriorityMap, priority)
}

export function getDisputePriorityLabel(priority: string): string {
  return getMapLabel(disputePriorityMap, priority)
}

// P-131: `reason` is an enum (`DisputeReason`), not the free text its `pre-wrap`
// styling in the detail modal implied — `description` is the free-text field.
// Same accessor shape as the two above so both admin surfaces reach it the same
// way they reach status and priority.
export function getDisputeReasonColor(reason: string): string {
  return getMapColor(disputeReasonMap, reason)
}

export function getDisputeReasonLabel(reason: string): string {
  return getMapLabel(disputeReasonMap, reason)
}
