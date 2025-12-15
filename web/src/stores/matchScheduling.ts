import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '@/api'
import type { components } from '@/api/types'

// Use generated types
type ScheduleProposalResponse = components['schemas']['ScheduleProposalResponse']
type AcceptScheduleProposalRequest = components['schemas']['AcceptScheduleProposalRequest']
type RejectScheduleProposalRequest = components['schemas']['RejectScheduleProposalRequest']
type ApiErrorResponse = components['schemas']['ApiError']

// Proposal status enum
export const PROPOSAL_STATUSES = ['pending', 'accepted', 'rejected', 'expired', 'counter_proposed'] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

export const useMatchSchedulingStore = defineStore('matchScheduling', () => {
  // State
  const activeProposal = ref<ScheduleProposalResponse | null>(null)
  const proposalHistory = ref<ScheduleProposalResponse[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // ==================== Proposal CRUD ====================

  async function fetchActiveProposal(tournamentId: string, matchId: string): Promise<ScheduleProposalResponse | null> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/tournaments/{tournament_id}/matches/{match_id}/schedule/active', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      activeProposal.value = data!.data
      return activeProposal.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        // 404 means no active proposal, which is valid
        if (e.status === 404) {
          activeProposal.value = null
          return null
        }
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch active proposal'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchProposalHistory(tournamentId: string, matchId: string): Promise<ScheduleProposalResponse[]> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/tournaments/{tournament_id}/matches/{match_id}/schedule/history', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      proposalHistory.value = data!.data
      return proposalHistory.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch proposal history'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function proposeSchedule(
    tournamentId: string,
    matchId: string,
    proposedTimes: string[],
    notes?: string
  ): Promise<ScheduleProposalResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/tournaments/{tournament_id}/matches/{match_id}/schedule/propose', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
        body: {
          proposed_times: proposedTimes,
          notes: notes ?? null,
        },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      activeProposal.value = data!.data
      return activeProposal.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to propose schedule'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function acceptProposal(
    tournamentId: string,
    matchId: string,
    request: AcceptScheduleProposalRequest
  ): Promise<ScheduleProposalResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/tournaments/{tournament_id}/matches/{match_id}/schedule/accept', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
        body: request,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      activeProposal.value = data!.data
      return activeProposal.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to accept proposal'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function rejectProposal(
    tournamentId: string,
    matchId: string,
    request: RejectScheduleProposalRequest
  ): Promise<ScheduleProposalResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/tournaments/{tournament_id}/matches/{match_id}/schedule/reject', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
        body: request,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      // Clear active proposal after rejection
      activeProposal.value = null
      return data!.data
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to reject proposal'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function counterPropose(
    tournamentId: string,
    matchId: string,
    proposedTimes: string[],
    notes?: string
  ): Promise<ScheduleProposalResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/tournaments/{tournament_id}/matches/{match_id}/schedule/counter', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
        body: {
          proposed_times: proposedTimes,
          notes: notes ?? null,
        },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      activeProposal.value = data!.data
      return activeProposal.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to counter propose'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  // ==================== Utility ====================

  function clear() {
    activeProposal.value = null
    proposalHistory.value = []
    loading.value = false
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
  switch (status) {
    case 'pending':
      return 'warning'
    case 'accepted':
      return 'success'
    case 'rejected':
      return 'error'
    case 'expired':
      return 'grey'
    case 'counter_proposed':
      return 'info'
    default:
      return 'grey'
  }
}

export function getProposalStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Awaiting Response'
    case 'accepted':
      return 'Accepted'
    case 'rejected':
      return 'Rejected'
    case 'expired':
      return 'Expired'
    case 'counter_proposed':
      return 'Counter Proposed'
    default:
      return status
  }
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
