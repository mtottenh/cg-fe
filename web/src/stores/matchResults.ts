import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '@/api'
import type { components } from '@/api/types'

// Use generated types
type ResultClaimResponse = components['schemas']['ResultClaimResponse']
type SubmitResultClaimRequest = components['schemas']['SubmitResultClaimRequest']
type DisputeResultClaimRequest = components['schemas']['DisputeResultClaimRequest']
type ResultClaimSubmissionResponse = components['schemas']['ResultClaimSubmissionResponse']
type ResultConfirmationResponse = components['schemas']['ResultConfirmationResponse']
type ResultDisputeResponse = components['schemas']['ResultDisputeResponse']
type GameResultInput = components['schemas']['GameResultInput']
type ApiErrorResponse = components['schemas']['ApiError']

// Result claim status enum
export const RESULT_CLAIM_STATUSES = ['pending', 'confirmed', 'disputed', 'expired', 'superseded'] as const
export type ResultClaimStatus = (typeof RESULT_CLAIM_STATUSES)[number]

export const useMatchResultsStore = defineStore('matchResults', () => {
  // State
  const currentResult = ref<ResultClaimResponse | null>(null)
  const resultHistory = ref<ResultClaimResponse[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // ==================== Result CRUD ====================

  /**
   * Fetch the current pending result claim for a match.
   * Returns null if no pending claim exists (which is a valid state).
   */
  async function fetchCurrentResult(matchId: string): Promise<ResultClaimResponse | null> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/matches/{match_id}/result', {
        params: { path: { match_id: matchId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentResult.value = data!.data
      return currentResult.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        // 404 means no pending result, which is valid state
        if (e.status === 404) {
          currentResult.value = null
          return null
        }
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch current result'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  /**
   * Fetch the result claim history for a match.
   */
  async function fetchResultHistory(matchId: string): Promise<ResultClaimResponse[]> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/matches/{match_id}/result/history', {
        params: { path: { match_id: matchId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      resultHistory.value = data!.data
      return resultHistory.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch result history'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  /**
   * Submit a result claim for a match.
   *
   * @param matchId - The match ID
   * @param claimedWinnerRegistrationId - Registration ID of the claimed winner
   * @param participant1Score - Series score for participant 1
   * @param participant2Score - Series score for participant 2
   * @param gameResults - Game-by-game results for series matches
   * @param evidenceIds - Evidence IDs (Phase 2 integration, empty in Phase 1)
   * @param demoLinkIds - Demo link IDs (Phase 3 integration, empty in Phase 1)
   * @param notes - Optional notes
   */
  async function submitResult(
    matchId: string,
    claimedWinnerRegistrationId: string,
    participant1Score: number,
    participant2Score: number,
    gameResults: GameResultInput[] = [],
    evidenceIds: string[] = [],
    demoLinkIds: string[] = [],
    notes?: string
  ): Promise<ResultClaimSubmissionResponse> {
    loading.value = true
    error.value = null
    try {
      const body: SubmitResultClaimRequest = {
        claimed_winner_registration_id: claimedWinnerRegistrationId,
        participant1_score: participant1Score,
        participant2_score: participant2Score,
        game_results: gameResults,
        evidence_ids: evidenceIds,
        demo_link_ids: demoLinkIds,
        notes: notes ?? null,
      }

      const { data, error: apiError } = await api.POST('/v1/matches/{match_id}/result', {
        params: { path: { match_id: matchId } },
        body,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentResult.value = data!.data.claim
      return data!.data
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to submit result'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  /**
   * Confirm an opponent's result claim.
   */
  async function confirmResult(
    matchId: string,
    claimId: string
  ): Promise<ResultConfirmationResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/matches/{match_id}/result/{claim_id}/confirm', {
        params: { path: { match_id: matchId, claim_id: claimId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentResult.value = data!.data.claim
      return data!.data
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to confirm result'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  /**
   * Dispute a result claim.
   *
   * @param matchId - The match ID
   * @param claimId - The claim ID to dispute
   * @param reason - Reason for the dispute (min 10 chars)
   * @param evidenceIds - Evidence IDs supporting the dispute (Phase 2 integration)
   */
  async function disputeResult(
    matchId: string,
    claimId: string,
    reason: string,
    evidenceIds: string[] = []
  ): Promise<ResultDisputeResponse> {
    loading.value = true
    error.value = null
    try {
      const body: DisputeResultClaimRequest = {
        reason,
        evidence_ids: evidenceIds,
      }

      const { data, error: apiError } = await api.POST('/v1/matches/{match_id}/result/{claim_id}/dispute', {
        params: { path: { match_id: matchId, claim_id: claimId } },
        body,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentResult.value = data!.data.claim
      return data!.data
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to dispute result'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  // ==================== Utility ====================

  function clear() {
    currentResult.value = null
    resultHistory.value = []
    loading.value = false
    error.value = null
  }

  function $reset() {
    clear()
  }

  return {
    // State
    currentResult,
    resultHistory,
    loading,
    error,

    // Actions
    fetchCurrentResult,
    fetchResultHistory,
    submitResult,
    confirmResult,
    disputeResult,

    // Utility
    clear,
    $reset,
  }
})

// Re-export types for convenience
export type {
  ResultClaimResponse,
  SubmitResultClaimRequest,
  DisputeResultClaimRequest,
  ResultClaimSubmissionResponse,
  ResultConfirmationResponse,
  ResultDisputeResponse,
  GameResultInput,
}

// Helper functions
export function getResultStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'warning'
    case 'confirmed':
      return 'success'
    case 'disputed':
      return 'error'
    case 'expired':
      return 'grey'
    case 'superseded':
      return 'grey-darken-1'
    default:
      return 'grey'
  }
}

export function getResultStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Awaiting Confirmation'
    case 'confirmed':
      return 'Confirmed'
    case 'disputed':
      return 'Disputed'
    case 'expired':
      return 'Expired'
    case 'superseded':
      return 'Superseded'
    default:
      return status
  }
}

export function formatResultDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getTimeUntilAutoConfirm(autoConfirmAt: string | null | undefined): string | null {
  if (!autoConfirmAt) return null

  const now = new Date()
  const autoConfirm = new Date(autoConfirmAt)
  const diff = autoConfirm.getTime() - now.getTime()

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
