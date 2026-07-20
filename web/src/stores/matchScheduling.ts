import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, unwrapApiOptional, createActionState, withActionState, aggregateActionStates } from '@/stores/helpers'
import { proposalStatusMap, getStatusColor as getMapColor, getStatusLabel as getMapLabel } from '@/utils/statusMaps'

// Use generated types
type ScheduleProposalResponse = components['schemas']['ScheduleProposalResponse']
type AcceptScheduleProposalRequest = components['schemas']['AcceptScheduleProposalRequest']
type RejectScheduleProposalRequest = components['schemas']['RejectScheduleProposalRequest']

// Proposal status enum
export const PROPOSAL_STATUSES = ['pending', 'accepted', 'rejected', 'expired', 'counter_proposed'] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

export const useMatchSchedulingStore = defineStore('matchScheduling', () => {
  // State
  const activeProposal = ref<ScheduleProposalResponse | null>(null)
  const proposalHistory = ref<ScheduleProposalResponse[]>([])

  // Per-action states
  const fetchActiveProposalState = createActionState()
  const fetchProposalHistoryState = createActionState()
  const proposeScheduleState = createActionState()
  const acceptProposalState = createActionState()
  const rejectProposalState = createActionState()
  const counterProposeState = createActionState()

  const { loading, error } = aggregateActionStates([
    fetchActiveProposalState, fetchProposalHistoryState, proposeScheduleState,
    acceptProposalState, rejectProposalState, counterProposeState,
  ])

  // ==================== Proposal CRUD ====================

  async function fetchActiveProposal(tournamentId: string, matchId: string): Promise<ScheduleProposalResponse | null> {
    return withActionState(fetchActiveProposalState, async () => {
      const result = await unwrapApiOptional(api.GET('/v1/tournaments/{tournament_id}/matches/{match_id}/schedule/active', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
      }))
      activeProposal.value = result?.data ?? null
      return activeProposal.value
    }, 'Failed to fetch active proposal')
  }

  async function fetchProposalHistory(tournamentId: string, matchId: string): Promise<ScheduleProposalResponse[]> {
    return withActionState(fetchProposalHistoryState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/matches/{match_id}/schedule/history', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
      }))
      proposalHistory.value = result.data
      return proposalHistory.value
    }, 'Failed to fetch proposal history')
  }

  async function proposeSchedule(
    tournamentId: string,
    matchId: string,
    proposedTimes: string[],
    notes?: string,
  ): Promise<ScheduleProposalResponse> {
    return withActionState(proposeScheduleState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/matches/{match_id}/schedule/propose', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
        body: {
          proposed_times: proposedTimes,
          ...(notes ? { notes } : {}),
        },
      }))
      activeProposal.value = result.data
      return activeProposal.value
    }, 'Failed to propose schedule')
  }

  async function acceptProposal(
    tournamentId: string,
    matchId: string,
    request: AcceptScheduleProposalRequest
  ): Promise<void> {
    return withActionState(acceptProposalState, async () => {
      await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/matches/{match_id}/schedule/accept', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
        body: request,
      }))
      // Accept returns a match response, not a proposal — clear the active proposal
      activeProposal.value = null
    }, 'Failed to accept proposal')
  }

  async function rejectProposal(
    tournamentId: string,
    matchId: string,
    request: RejectScheduleProposalRequest,
    reason?: string,
  ): Promise<ScheduleProposalResponse> {
    return withActionState(rejectProposalState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/matches/{match_id}/schedule/reject', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
        body: { ...request, ...(reason ? { reason } : {}) },
      }))
      // Clear active proposal after rejection
      activeProposal.value = null
      return result.data
    }, 'Failed to reject proposal')
  }

  async function counterPropose(
    tournamentId: string,
    matchId: string,
    originalProposalId: string,
    proposedTimes: string[],
    notes?: string,
  ): Promise<ScheduleProposalResponse> {
    return withActionState(counterProposeState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/matches/{match_id}/schedule/counter', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
        body: {
          original_proposal_id: originalProposalId,
          proposed_times: proposedTimes,
          ...(notes ? { notes } : {}),
        },
      }))
      activeProposal.value = result.data
      return activeProposal.value
    }, 'Failed to counter propose')
  }

  // ==================== Utility ====================

  function clear() {
    activeProposal.value = null
    proposalHistory.value = []
    error.value = null
  }

  function $reset() {
    clear()
  }

  return {
    // State
    activeProposal,
    proposalHistory,
    loading,
    error,

    // Per-action states
    fetchActiveProposalState,
    fetchProposalHistoryState,
    proposeScheduleState,
    acceptProposalState,
    rejectProposalState,
    counterProposeState,

    // Actions
    fetchActiveProposal,
    fetchProposalHistory,
    proposeSchedule,
    acceptProposal,
    rejectProposal,
    counterPropose,

    // Utility
    clear,
    $reset,
  }
})

// Re-export types for convenience
export type { ScheduleProposalResponse, AcceptScheduleProposalRequest, RejectScheduleProposalRequest }

// Helper functions
export function getProposalStatusColor(status: string): string {
  return getMapColor(proposalStatusMap, status)
}

export function getProposalStatusLabel(status: string): string {
  return getMapLabel(proposalStatusMap, status)
}

export function formatProposedTime(time: string): string {
  return new Date(time).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function isProposalExpired(proposal: ScheduleProposalResponse): boolean {
  return new Date(proposal.expires_at) < new Date()
}

export function getTimeUntilExpiration(proposal: ScheduleProposalResponse): string {
  const now = new Date()
  const expires = new Date(proposal.expires_at)
  const diff = expires.getTime() - now.getTime()

  if (diff <= 0) return 'Expired'

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (hours > 24) {
    const days = Math.floor(hours / 24)
    return `${days} day${days > 1 ? 's' : ''}`
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`
  } else {
    return `${minutes} min`
  }
}
