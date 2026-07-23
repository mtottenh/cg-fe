import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState, aggregateActionStates } from '@/stores/helpers'
import { resultClaimStatusMap, getStatusColor as getMapColor, getStatusLabel as getMapLabel } from '@/utils/statusMaps'

// Use generated types
type ResultClaimResponse = components['schemas']['ResultClaimResponse']
type SubmitResultClaimRequest = components['schemas']['SubmitResultClaimRequest']
type DisputeResultClaimRequest = components['schemas']['DisputeResultClaimRequest']
type ResultClaimSubmissionResponse = components['schemas']['ResultClaimSubmissionResponse']
type ResultConfirmationResponse = components['schemas']['ResultConfirmationResponse']
type ResultDisputeResponse = components['schemas']['ResultDisputeResponse']
type GameResultInput = components['schemas']['GameResultInput']
type RaiseDisputeRequest = components['schemas']['RaiseDisputeRequest']
type DisputeResponse = components['schemas']['DisputeResponse']

// Result claim status enum
export const RESULT_CLAIM_STATUSES = ['pending', 'confirmed', 'disputed', 'expired', 'superseded'] as const
export type ResultClaimStatus = (typeof RESULT_CLAIM_STATUSES)[number]

export const useMatchResultsStore = defineStore('matchResults', () => {
  // State
  const currentResult = ref<ResultClaimResponse | null>(null)
  const resultHistory = ref<ResultClaimResponse[]>([])

  // Per-action states
  const fetchCurrentResultState = createActionState()
  const fetchResultHistoryState = createActionState()
  const submitResultState = createActionState()
  const confirmResultState = createActionState()
  const disputeResultState = createActionState()
  const raiseDisputeState = createActionState()

  const { loading, error } = aggregateActionStates([
    fetchCurrentResultState, fetchResultHistoryState, submitResultState,
    confirmResultState, disputeResultState, raiseDisputeState,
  ])

  // ==================== Result CRUD ====================

  /**
   * Fetch the current result claim for a match.
   *
   * "Current" is whichever claim speaks for the match right now: the pending
   * claim while the series is live, and the confirmed claim once it has
   * settled — so a completed match still resolves here and can show its
   * per-map breakdown (P-1).
   *
   * Returns null when the match has neither (never claimed, or only
   * disputed/superseded claims), which is a valid state.
   */
  async function fetchCurrentResult(matchId: string): Promise<ResultClaimResponse | null> {
    return withActionState(fetchCurrentResultState, async () => {
      try {
        const result = await unwrapApi(api.GET('/v1/matches/{match_id}/result', {
          params: { path: { match_id: matchId } },
        }))
        currentResult.value = result.data
        return currentResult.value
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          currentResult.value = null
          return null
        }
        throw e
      }
    }, 'Failed to fetch current result')
  }

  /**
   * Fetch the result claim history for a match.
   */
  async function fetchResultHistory(matchId: string): Promise<ResultClaimResponse[]> {
    return withActionState(fetchResultHistoryState, async () => {
      const result = await unwrapApi(api.GET('/v1/matches/{match_id}/result/history', {
        params: { path: { match_id: matchId } },
      }))
      resultHistory.value = result.data
      return resultHistory.value
    }, 'Failed to fetch result history')
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
    return withActionState(submitResultState, async () => {
      const body: SubmitResultClaimRequest = {
        claimed_winner_registration_id: claimedWinnerRegistrationId,
        participant1_score: participant1Score,
        participant2_score: participant2Score,
        game_results: gameResults,
        evidence_ids: evidenceIds,
        demo_link_ids: demoLinkIds,
        notes: notes ?? null,
      }

      const result = await unwrapApi(api.POST('/v1/matches/{match_id}/result', {
        params: { path: { match_id: matchId } },
        body,
      }))

      currentResult.value = result.data.claim
      return result.data
    }, 'Failed to submit result')
  }

  /**
   * Confirm an opponent's result claim.
   */
  async function confirmResult(
    matchId: string,
    claimId: string
  ): Promise<ResultConfirmationResponse> {
    return withActionState(confirmResultState, async () => {
      const result = await unwrapApi(api.POST('/v1/matches/{match_id}/result/{claim_id}/confirm', {
        params: { path: { match_id: matchId, claim_id: claimId } },
      }))

      currentResult.value = result.data.claim
      return result.data
    }, 'Failed to confirm result')
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
    return withActionState(disputeResultState, async () => {
      const body: DisputeResultClaimRequest = {
        reason,
        evidence_ids: evidenceIds,
      }

      const result = await unwrapApi(api.POST('/v1/matches/{match_id}/result/{claim_id}/dispute', {
        params: { path: { match_id: matchId, claim_id: claimId } },
        body,
      }))

      currentResult.value = result.data.claim
      return result.data
    }, 'Failed to dispute result')
  }

  /**
   * Raise a tournament-scoped dispute that appears in the admin queue.
   */
  async function raiseDispute(
    tournamentId: string,
    matchId: string,
    registrationId: string,
    reason: string,
    description: string,
    evidenceIds: string[] = [],
    resultClaimId?: string
  ): Promise<DisputeResponse> {
    return withActionState(raiseDisputeState, async () => {
      const body: RaiseDisputeRequest = {
        reason,
        description,
        registration_id: registrationId,
        evidence_ids: evidenceIds,
        result_claim_id: resultClaimId ?? null,
      }

      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/matches/{match_id}/dispute', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
        body,
      }))

      return result.data
    }, 'Failed to raise dispute')
  }

  // ==================== Utility ====================

  function clear() {
    currentResult.value = null
    resultHistory.value = []
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

    // Per-action states
    fetchCurrentResultState,
    fetchResultHistoryState,
    submitResultState,
    confirmResultState,
    disputeResultState,
    raiseDisputeState,

    // Actions
    fetchCurrentResult,
    fetchResultHistory,
    submitResult,
    confirmResult,
    disputeResult,
    raiseDispute,

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
  return getMapColor(resultClaimStatusMap, status)
}

export function getResultStatusLabel(status: string): string {
  return getMapLabel(resultClaimStatusMap, status)
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
