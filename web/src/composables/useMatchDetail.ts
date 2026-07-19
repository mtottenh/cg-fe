import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTournamentsStore, type TournamentMatchResponse } from '@/stores/tournaments'
import { useLeagueTeamsStore } from '@/stores/leagueTeams'
import { useMatchSchedulingStore } from '@/stores/matchScheduling'
import { useMatchResultsStore, getTimeUntilAutoConfirm } from '@/stores/matchResults'
import { useEvidenceStore } from '@/stores/evidence'
import { useResultReviewsStore } from '@/stores/resultReviews'
import { useDisputesStore } from '@/stores/disputes'
import { useMatchContext } from './useMatchContext'
import { api } from '@/api'
import { unwrapApi } from '@/stores/helpers/apiAction'
import type { components } from '@/api/types'

type SuggestedTimeResponse = components['schemas']['SuggestedTimeResponse']

export function useMatchDetail() {
  const route = useRoute()
  const authStore = useAuthStore()
  const tournamentsStore = useTournamentsStore()
  const leagueTeamsStore = useLeagueTeamsStore()
  const schedulingStore = useMatchSchedulingStore()
  const resultsStore = useMatchResultsStore()
  const evidenceStore = useEvidenceStore()
  const resultReviewsStore = useResultReviewsStore()
  const disputesStore = useDisputesStore()

  // Local state
  const match = ref<TournamentMatchResponse | null>(null)
  const suggestedTimes = ref<string[]>([])
  const suggestionsDetailed = ref<SuggestedTimeResponse[]>([])

  // Polling
  const POLL_MS = 15_000
  const TERMINAL_STATUSES = ['completed', 'cancelled']
  // During pick_ban and checking_in, the VetoPanel's websocket pushes all
  // relevant state changes live. Polling on top of the WS is redundant and
  // costs an extra round-trip per poll tick. If the WS drops, its own
  // reconnect loop owns the fallback poll (see useMatchLobbySocket).
  const WS_DRIVEN_STATUSES = ['checking_in', 'pick_ban']
  const pollInterval = ref<ReturnType<typeof setInterval> | null>(null)

  // Composed state from stores
  const tournament = computed(() => tournamentsStore.currentTournament)

  // Centralized user-match identity
  const { userRegistrationId, opponentPlayerId, opponentRegistrationId: _opponentRegistrationId } = useMatchContext(match, tournament)

  const activeProposal = computed(() => schedulingStore.activeProposal)
  const proposalHistory = computed(() => schedulingStore.proposalHistory)
  const currentResult = computed(() => resultsStore.currentResult)
  const resultHistory = computed(() => resultsStore.resultHistory)

  // Unified loading/error
  const loading = ref(false)
  const schedulingLoading = computed(() => schedulingStore.loading)
  const error = computed(
    () => tournamentsStore.error || schedulingStore.error || resultsStore.error
  )

  // Match format typed
  const matchFormat = computed((): 'bo1' | 'bo3' | 'bo5' | 'bo7' => {
    const format = match.value?.match_format
    if (format === 'bo1' || format === 'bo3' || format === 'bo5' || format === 'bo7') {
      return format
    }
    return 'bo1'
  })

  // Panel visibility
  const showSchedulingPanel = computed(() => {
    if (!tournament.value || !match.value) return false
    if (!userRegistrationId.value) return false
    return (
      tournament.value.scheduling_mode === 'self_scheduled' &&
      ['ready', 'scheduled'].includes(match.value.status)
    )
  })

  const showCheckInPanel = computed(() => {
    if (!match.value || !userRegistrationId.value) return false
    return ['scheduled', 'checking_in'].includes(match.value.status)
  })

  const isProposer = computed(() => {
    if (!activeProposal.value || !authStore.user) return false
    return activeProposal.value.proposed_by_user_id === authStore.user.id
  })

  const canPropose = computed(() => {
    if (!match.value || !userRegistrationId.value) return false
    return match.value.status === 'ready' && !activeProposal.value
  })

  // Result panel visibility
  const showResultPanel = computed(() => {
    if (!match.value) return false
    return ['in_progress', 'awaiting_result'].includes(match.value.status) || match.value.disputed
  })

  const showConfirmationPanel = computed(() => {
    if (!currentResult.value || !userRegistrationId.value) return false
    return (
      currentResult.value.status === 'pending' &&
      currentResult.value.submitted_by_registration_id !== userRegistrationId.value
    )
  })

  const canSubmitResult = computed(() => {
    if (!userRegistrationId.value) return false
    if (!match.value) return false
    return !currentResult.value || currentResult.value.status !== 'pending'
  })

  const showWaitingForOpponent = computed(() => {
    if (!currentResult.value || !userRegistrationId.value) return false
    return (
      currentResult.value.status === 'pending' &&
      currentResult.value.submitted_by_registration_id === userRegistrationId.value
    )
  })

  const autoConfirmCountdown = computed(() => {
    return getTimeUntilAutoConfirm(currentResult.value?.auto_confirm_at)
  })

  // Fetch suggestions from backend
  async function fetchBackendSuggestions(tournamentId: string, matchId: string) {
    try {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() + 1)
      const endDate = new Date()
      endDate.setDate(endDate.getDate() + 7)

      const result = await unwrapApi(api.POST(
        '/v1/tournaments/{tournament_id}/matches/{match_id}/suggestions/generate',
        {
          params: { path: { tournament_id: tournamentId, match_id: matchId } },
          body: {
            start_date: startDate.toISOString().split('T')[0]!,
            end_date: endDate.toISOString().split('T')[0]!,
          },
        }
      ))
      suggestionsDetailed.value = result.data
      suggestedTimes.value = result.data.map((s: SuggestedTimeResponse) => s.suggested_start)
    } catch {
      suggestionsDetailed.value = []
      suggestedTimes.value = []
    }
  }

  // Data fetching
  async function fetchResultData() {
    if (!match.value) return
    await Promise.all([
      resultsStore.fetchCurrentResult(match.value.id).catch(() => null),
      resultsStore.fetchResultHistory(match.value.id).catch(() => []),
    ])
  }

  /**
   * Refresh just the match-state-dependent endpoints. Used by the poll loop:
   * skips tournament metadata, registrations, my-teams, linked demos, evidence list —
   * none of which change during an in-flight match.
   */
  async function pollMatch() {
    const tournament = tournamentsStore.currentTournament
    if (!tournament || !match.value) return
    const tournamentId = tournament.id
    const matchId = match.value.id

    const refreshed = await tournamentsStore.fetchMatch(tournamentId, matchId).catch(() => null)
    if (refreshed) match.value = refreshed

    const tasks: Promise<unknown>[] = []

    if (tournament.scheduling_mode === 'self_scheduled' && match.value) {
      const status = match.value.status
      if (['ready', 'scheduled', 'checking_in'].includes(status)) {
        tasks.push(
          schedulingStore.fetchActiveProposal(tournamentId, matchId).catch(() => null),
          schedulingStore.fetchProposalHistory(tournamentId, matchId).catch(() => []),
        )
      }
    }

    // 'disputed' is a real MatchStatus (a claim dispute sets it), so it must
    // be included here or the dispute thread never loads for disputed matches.
    if (
      match.value &&
      ['in_progress', 'awaiting_result', 'completed', 'disputed'].includes(match.value.status)
    ) {
      tasks.push(fetchResultData())
      if (['in_progress', 'awaiting_result'].includes(match.value.status)) {
        // Backend pushes discovered demos as they upload — worth polling.
        tasks.push(evidenceStore.discoverDemos(match.value.id).catch(() => []))
      }
      if (match.value.disputed) {
        tasks.push(disputesStore.fetchMatchDispute(tournamentId, match.value.id).catch(() => null))
      }
    }

    await Promise.all(tasks)
  }

  async function fetchAll() {
    const tournamentSlug = route.params.tournamentSlug as string
    const matchId = route.params.matchId as string

    loading.value = true
    try {
      await tournamentsStore.fetchTournamentBySlug(tournamentSlug)

      if (tournamentsStore.currentTournament) {
        const tournamentId = tournamentsStore.currentTournament.id

        match.value = await tournamentsStore.fetchMatch(tournamentId, matchId)

        // Fetch registrations to resolve userRegistrationId for result submission
        if (authStore.playerId && tournamentsStore.currentTournament) {
          const fetchPromises: Promise<unknown>[] = [
            tournamentsStore.fetchRegistrations(tournamentsStore.currentTournament.id),
          ]
          // Fetch user's teams for team tournaments so useMatchContext can resolve registration
          if (tournamentsStore.currentTournament.participant_type === 'team') {
            fetchPromises.push(leagueTeamsStore.fetchMyTeams())
          }
          await Promise.all(fetchPromises)
        }

        if (tournamentsStore.currentTournament.scheduling_mode === 'self_scheduled') {
          await Promise.all([
            schedulingStore.fetchActiveProposal(tournamentId, matchId).catch(() => null),
            schedulingStore.fetchProposalHistory(tournamentId, matchId).catch(() => []),
          ])

          if (opponentPlayerId.value && showSchedulingPanel.value) {
            fetchBackendSuggestions(tournamentId, matchId)
          }
        }

        // 'disputed' is a real MatchStatus (a claim dispute sets it), so it
        // must be included here or the dispute thread never loads for
        // disputed matches.
        if (
          match.value &&
          ['in_progress', 'awaiting_result', 'completed', 'disputed'].includes(match.value.status)
        ) {
          const resultPromises: Promise<unknown>[] = [fetchResultData()]
          resultPromises.push(
            evidenceStore.fetchLinkedDemos(match.value.id).catch(() => []),
            evidenceStore.fetchEvidence(match.value.id).catch(() => []),
          )
          if (['in_progress', 'awaiting_result'].includes(match.value.status)) {
            resultPromises.push(
              evidenceStore.discoverDemos(match.value.id).catch(() => []),
            )
          }
          // Fetch result review for completed matches
          if (match.value.status === 'completed') {
            resultPromises.push(
              resultReviewsStore.fetchMatchResultReview(match.value.id).catch(() => null),
            )
          }
          // Fetch active dispute if match is disputed
          if (match.value.disputed) {
            resultPromises.push(
              disputesStore.fetchMatchDispute(tournamentId, match.value.id).catch(() => null),
            )
          }
          await Promise.all(resultPromises)
        }
      }
    } catch {
      // Errors captured in stores
    } finally {
      loading.value = false
      startPolling()
    }
  }

  function clearError() {
    tournamentsStore.error = null
    schedulingStore.error = null
    resultsStore.error = null
  }

  // Polling
  const isPolling = ref(false)

  function startPolling() {
    stopPolling()
    pollInterval.value = setInterval(async () => {
      if (document.visibilityState === 'hidden') return
      if (isPolling.value) return
      const status = match.value?.status
      if (!status) return
      if (TERMINAL_STATUSES.includes(status)) return
      // Websocket drives state during pick_ban/checking_in — skip HTTP poll.
      if (WS_DRIVEN_STATUSES.includes(status)) return
      isPolling.value = true
      try {
        // Only refresh match-state-dependent endpoints; fetchAll re-hit 10+
        // endpoints every 15s including invariant data (tournament, my teams).
        await pollMatch()
      } finally {
        isPolling.value = false
      }
    }, POLL_MS)
  }

  function stopPolling() {
    if (pollInterval.value) {
      clearInterval(pollInterval.value)
      pollInterval.value = null
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') return
    const status = match.value?.status
    if (!status) return
    if (TERMINAL_STATUSES.includes(status)) return
    if (WS_DRIVEN_STATUSES.includes(status)) return
    // Same rationale as startPolling: tab-regain shouldn't re-fetch invariants.
    pollMatch()
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  // Cleanup
  onUnmounted(() => {
    stopPolling()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    schedulingStore.clear()
    resultsStore.clear()
    evidenceStore.clear()
    resultReviewsStore.clear()
    disputesStore.clear()
  })

  return {
    // State
    match,
    tournament,
    activeProposal,
    proposalHistory,
    currentResult,
    resultHistory,
    matchFormat,

    // Loading/Error
    loading,
    schedulingLoading,
    error,
    clearError,

    // Panel visibility
    showSchedulingPanel,
    showCheckInPanel,
    isProposer,
    canPropose,
    showResultPanel,
    userRegistrationId,
    opponentPlayerId,
    suggestedTimes,
    suggestionsDetailed,
    showConfirmationPanel,
    canSubmitResult,
    showWaitingForOpponent,
    autoConfirmCountdown,

    // Actions
    fetchAll,
    fetchResultData,

    // Store access
    schedulingStore,
    resultsStore,
    evidenceStore,
  }
}
