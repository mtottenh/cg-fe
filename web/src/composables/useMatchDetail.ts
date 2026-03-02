import { ref, computed, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTournamentsStore, type TournamentMatchResponse } from '@/stores/tournaments'
import { useMatchSchedulingStore } from '@/stores/matchScheduling'
import { useMatchResultsStore, getTimeUntilAutoConfirm } from '@/stores/matchResults'

export function useMatchDetail() {
  const route = useRoute()
  const authStore = useAuthStore()
  const tournamentsStore = useTournamentsStore()
  const schedulingStore = useMatchSchedulingStore()
  const resultsStore = useMatchResultsStore()

  // Local state
  const match = ref<TournamentMatchResponse | null>(null)

  // Composed state from stores
  const tournament = computed(() => tournamentsStore.currentTournament)
  const activeProposal = computed(() => schedulingStore.activeProposal)
  const proposalHistory = computed(() => schedulingStore.proposalHistory)
  const currentResult = computed(() => resultsStore.currentResult)
  const resultHistory = computed(() => resultsStore.resultHistory)

  // Unified loading/error
  const loading = computed(() => tournamentsStore.loading)
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
    return (
      tournament.value.scheduling_mode === 'self_scheduled' &&
      ['pending', 'scheduling', 'scheduled'].includes(match.value.status)
    )
  })

  const isProposer = computed(() => {
    if (!activeProposal.value || !authStore.user) return false
    return activeProposal.value.proposed_by_user_id === authStore.user.id
  })

  const canPropose = computed(() => {
    if (!match.value) return false
    return ['pending', 'scheduling'].includes(match.value.status) && !activeProposal.value
  })

  // Result panel visibility
  const showResultPanel = computed(() => {
    if (!match.value) return false
    return ['in_progress', 'awaiting_result'].includes(match.value.status) || match.value.disputed
  })

  // Participant identity (placeholder — needs backend integration)
  const userRegistrationId = computed(() => {
    return null as string | null
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

  // Data fetching
  async function fetchResultData() {
    if (!match.value) return
    await Promise.all([
      resultsStore.fetchCurrentResult(match.value.id).catch(() => null),
      resultsStore.fetchResultHistory(match.value.id).catch(() => []),
    ])
  }

  async function fetchAll() {
    const tournamentSlug = route.params.tournamentSlug as string
    const matchId = route.params.matchId as string

    try {
      await tournamentsStore.fetchTournamentBySlug(tournamentSlug)

      if (tournamentsStore.currentTournament) {
        const tournamentId = tournamentsStore.currentTournament.id

        match.value = await tournamentsStore.fetchMatch(tournamentId, matchId)

        if (tournamentsStore.currentTournament.scheduling_mode === 'self_scheduled') {
          await Promise.all([
            schedulingStore.fetchActiveProposal(tournamentId, matchId).catch(() => null),
            schedulingStore.fetchProposalHistory(tournamentId, matchId).catch(() => []),
          ])
        }

        if (match.value && ['in_progress', 'awaiting_result', 'completed'].includes(match.value.status)) {
          await fetchResultData()
        }
      }
    } catch {
      // Errors captured in stores
    }
  }

  function clearError() {
    tournamentsStore.error = null
    schedulingStore.error = null
    resultsStore.error = null
  }

  // Cleanup
  onUnmounted(() => {
    schedulingStore.clear()
    resultsStore.clear()
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
    isProposer,
    canPropose,
    showResultPanel,
    userRegistrationId,
    showConfirmationPanel,
    canSubmitResult,
    showWaitingForOpponent,
    autoConfirmCountdown,

    // Actions
    fetchAll,
    fetchResultData,

    // Store access for scheduling actions
    schedulingStore,
    resultsStore,
  }
}
