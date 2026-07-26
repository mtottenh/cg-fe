import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTournamentsStore, type TournamentMatchResponse } from '@/stores/tournaments'
import { useMatchSchedulingStore } from '@/stores/matchScheduling'
import { useMatchResultsStore, getTimeUntilAutoConfirm } from '@/stores/matchResults'
import { useEvidenceStore } from '@/stores/evidence'
import { useResultReviewsStore } from '@/stores/resultReviews'
import { useDisputesStore } from '@/stores/disputes'
import { useVetoStore } from '@/stores/veto'
import { useMatchServerStore } from '@/stores/matchServer'
import { useMatchContext } from './useMatchContext'
import { api } from '@/api'
import { unwrapApi } from '@/stores/helpers/apiAction'
import { formatMapName } from '@/utils/maps'
import type { components } from '@/api/types'

type SuggestedTimeResponse = components['schemas']['SuggestedTimeResponse']

export function useMatchDetail() {
  const route = useRoute()
  const authStore = useAuthStore()
  const tournamentsStore = useTournamentsStore()
  const schedulingStore = useMatchSchedulingStore()
  const resultsStore = useMatchResultsStore()
  const evidenceStore = useEvidenceStore()
  const resultReviewsStore = useResultReviewsStore()
  const disputesStore = useDisputesStore()
  const vetoStore = useVetoStore()

  // Local state
  const match = ref<TournamentMatchResponse | null>(null)
  /** Tournament map pool ids, used when a match has no veto. */
  const tournamentMapPool = ref<string[]>([])
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

  // Centralized user-match identity. Resolved by the server from the match
  // row (P-53/P-56) rather than by scanning the paginated registrations list —
  // see `useMatchContext` for why that scan was a hard 100-participant ceiling
  // on submitting a result at all.
  const {
    myRegistration,
    userRegistrationId,
    canCheckIn,
    opponentPlayerId,
    opponentRegistrationId: _opponentRegistrationId,
  } = useMatchContext(match)

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

  // P-193: gated on the server-computed check-in authorization, not mere
  // participation — a plain roster member speaks for the registration but
  // cannot check in (captain/owner/delegate/player only), and showing the
  // panel to them produced a silent 403. Both conditions: the panel needs
  // the registration id to POST with, and the authorization to offer it.
  const showCheckInPanel = computed(() => {
    if (!match.value || !userRegistrationId.value || !canCheckIn.value) return false
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

  // Tick once per second while any live countdown is on screen so displayed
  // countdowns actually count down instead of freezing between polls.
  const nowTick = ref(Date.now())
  let countdownTimer: ReturnType<typeof setInterval> | null = null
  const needsTicker = computed(() => {
    if (currentResult.value?.auto_confirm_at) return true
    const status = match.value?.status
    if ((status === 'scheduled' || status === 'checking_in') && match.value?.scheduled_at) {
      return true
    }
    return false
  })
  watch(
    needsTicker,
    (needed) => {
      if (countdownTimer) {
        clearInterval(countdownTimer)
        countdownTimer = null
      }
      if (needed) {
        countdownTimer = setInterval(() => {
          nowTick.value = Date.now()
        }, 1_000)
      }
    },
    { immediate: true },
  )

  const autoConfirmCountdown = computed(() => {
    void nowTick.value
    return getTimeUntilAutoConfirm(currentResult.value?.auto_confirm_at)
  })

  /** Maps selected by the veto (picks + decider) in game order — feeds the
   * result submission panel and the per-map results summary. Empty when the
   * match had no veto. */
  const vetoPickedMaps = computed(() => {
    const maps = vetoStore.sessionState?.maps
    if (!maps) return []
    return maps
      .filter((m) => (m.status === 'picked' || m.status === 'decider') && m.game_number != null)
      .sort((a, b) => (a.game_number ?? 0) - (b.game_number ?? 0))
      .map((m) => ({ id: m.map_id, name: m.map_name }))
  })

  /** Maps the submitter may choose from when there was no veto. */
  const selectableMaps = computed(() =>
    tournamentMapPool.value.map((id) => ({ id, name: formatMapName(id) })),
  )

  /** Time remaining until the scheduled start while check-in is relevant —
   * null once the start time passes (or none is set). */
  const checkInCountdown = computed(() => {
    void nowTick.value
    const at = match.value?.scheduled_at
    if (!at) return null
    const diff = new Date(at).getTime() - Date.now()
    if (diff <= 0) return null
    const hours = Math.floor(diff / 3_600_000)
    const minutes = Math.floor((diff % 3_600_000) / 60_000)
    const seconds = Math.floor((diff % 60_000) / 1_000)
    if (hours > 0) return `${hours}h ${minutes}m`
    if (minutes > 0) return `${minutes}m ${seconds}s`
    return `${seconds}s`
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
  /**
   * Refetch the current claim and the claim history for this match.
   *
   * P-6: both legs used to carry `.catch(() => …)`, which converted a failed
   * refresh into a RESOLVED promise — every caller then continued as though
   * the page were current, and the only trace of the failure was a store error
   * nobody was obliged to read. Failures now propagate.
   *
   * `allSettled` rather than a bare `Promise.all`: `Promise.all` rejects on the
   * first failure and leaves a second, later rejection unhandled. Both legs are
   * always awaited here, and the first failure is rethrown.
   */
  async function fetchResultData() {
    if (!match.value) return
    const settled = await Promise.allSettled([
      resultsStore.fetchCurrentResult(match.value.id),
      resultsStore.fetchResultHistory(match.value.id),
    ])
    const failure = settled.find((r) => r.status === 'rejected')
    if (failure) throw (failure as PromiseRejectedResult).reason
  }

  /**
   * Refresh just the match-state-dependent endpoints. Used by the poll loop:
   * skips tournament metadata, registrations, my-teams, linked demos, evidence list —
   * none of which change during an in-flight match.
   */
  async function pollMatch() {
    // Keep the server panel fresh on the polling path too (§7.3 / M7).
    // Fire-and-forget READ: `void` alone discards the promise but not its
    // rejection, which then fails whole unit runs as an unhandled rejection
    // (the P-107 shape). Failure already lands in the store's action state,
    // so swallowing the rejection here loses nothing — this is not the
    // P-105 pattern (a swallowed MUTATION reported as success).
    if (match.value?.id) {
      useMatchServerStore()
        .fetchMatchServer(match.value.id)
        .catch(() => {})
    }
    const tournament = tournamentsStore.currentTournament
    if (!tournament || !match.value) return
    const gen = fetchGen
    const tournamentId = tournament.id
    const matchId = match.value.id

    const refreshed = await tournamentsStore.fetchMatch(tournamentId, matchId).catch(() => null)
    // A newer fetchAll started while we were in flight — its data wins.
    if (gen !== fetchGen) return
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

    // `allSettled`, not `all`: since P-6 un-swallowed `fetchResultData`, one
    // failing leg would otherwise reject the whole tick — and a rejection
    // inside a `setInterval` callback is an unhandled rejection, not an error
    // anyone sees. Each action still records its own error in its store state.
    await Promise.allSettled(tasks)
  }

  /**
   * P-6 — refresh the MATCH when the claim's status changes under the page.
   *
   * `MatchDetailPage` wires `@disputed` / `@confirmed` on
   * `ResultConfirmationPanel`, but **those handlers never run.** The panel is
   * rendered behind `showConfirmationPanel`, which requires the claim to still
   * be `pending`; `disputeResult`/`confirmResult` write the new claim into the
   * store *before* returning, so Vue has already unmounted the panel — and the
   * `ResultDisputeModal` inside it — by the time `handleDispute` resumes to
   * `emit('disputed')`. The event is emitted into a torn-down tree.
   *
   * Measured, not inferred: a network probe over a real UI dispute recorded the
   * dispute POST and then **no further requests at all**, and the page sat on
   * pre-dispute state — header still "Awaiting Result", no dispute thread —
   * until the 15s poll tick. That is exactly the symptom P-6 was filed for.
   *
   * Reacting to STATE instead of to an event is immune to that teardown: no
   * matter which component performed the write, or whether it survived it, the
   * match is re-read. `pollMatch` (not `fetchAll`) because only match-derived
   * state is stale — the tournament, registrations and rosters have not moved.
   */
  watch(
    () => resultsStore.currentResult?.status,
    (status, previous) => {
      // `previous === undefined` is the first claim this page ever saw (a load,
      // or a first submission), not a transition that happened under the user.
      if (previous === undefined || status === undefined || status === previous) return
      // Only the transitions that also rewrite the MATCH are worth a round-trip:
      // `disputed` sets match.status = disputed + match.disputed, `confirmed`
      // completes it. `superseded`/`cancelled` leave the match where it was.
      if (status !== 'disputed' && status !== 'confirmed') return
      void pollMatch()
    },
  )

  /**
   * P-127 — the same defect, on the SUBMIT path. The watcher above does not
   * cover it, and that was verified rather than assumed: a first submission
   * is the transition `undefined → 'pending'`, which both of its guards
   * reject (`previous === undefined` returns early, and `pending` is neither
   * `disputed` nor `confirmed`).
   *
   * `ResultSubmissionPanel` renders behind `canSubmitResult`, which is
   * `!currentResult || currentResult.status !== 'pending'`. `submitResult`
   * writes the new **pending** claim into the store before it resolves, so
   * that gate is already false — and the panel already unmounted — by the
   * time `handleSubmit` resumes to `emit('submitted')`. Vue's `emit()` opens
   * with `if (instance.isUnmounted) return`, so the event is not merely
   * late, it is discarded; `MatchDetailPage.handleResultSubmitted` never
   * runs. The page therefore kept rendering the pre-submit match (`Live`
   * rather than `Awaiting Result`) with the new claim missing from its
   * history until the 15s poll tick — on the most-used flow in the product.
   *
   * Moving the emit ahead of the `await` is not the fix: it would fire
   * before the write it is announcing has landed, trading a dropped event
   * for a stale one. The durable signal is the STORE's own action state,
   * which outlives the component that started the write — `loading` falling
   * back to false with no error means "a submission from this page just
   * succeeded", and it is untouched by fetches, so a poll or a page load
   * discovering someone else's claim cannot trigger it.
   */
  watch(
    () => resultsStore.submitResultState.loading,
    (isLoading, wasLoading) => {
      if (isLoading || !wasLoading) return
      // `withActionState` writes `error` (in its catch) before `loading`
      // (in its finally), so by this edge the outcome is already readable.
      if (resultsStore.submitResultState.error) return
      void pollMatch()
    },
  )

  /**
   * P-134 — fetch the result review for a match that COMPLETES under the page.
   *
   * `fetchAll` fetches the review only when the match is ALREADY `completed` at
   * load time, and `pollMatch` never fetched it at all. So the review alert
   * added by P-4C appeared for someone opening a finished match later, and
   * never for the two captains sitting on the page while the opponent confirms
   * — the audience the alert exists for. Completion is precisely the moment the
   * backend can raise a review (roster/score/winner mismatch is computed from
   * the confirmed result), so "completed while you were watching" is the
   * COMMON case, not an edge one.
   *
   * Reacting to the match's own status rather than to an event, for the reason
   * P-6 and P-127 both document: `emit()` opens with
   * `if (instance.isUnmounted) return`, so an event fired from an async
   * callback after its component has been torn down is DISCARDED, not delayed.
   * A watcher on store/composable state has no component to lose — it fires
   * from whichever path rewrote `match`, which is `pollMatch` on the poll tick,
   * on tab-regain, and on the `confirmed` claim transition alike.
   *
   * `previous === undefined` is the initial load (or the first match this page
   * ever saw), which `fetchAll` already covers and awaits; re-firing here would
   * duplicate that request on every page open.
   */
  watch(
    () => match.value?.status,
    (status, previous) => {
      if (status !== 'completed') return
      if (previous === undefined || previous === 'completed') return
      const matchId = match.value?.id
      if (!matchId) return
      void resultReviewsStore.fetchMatchResultReview(matchId).catch(() => null)
    },
  )

  async function fetchAll() {
    const tournamentSlug = route.params.tournamentSlug as string
    const matchId = route.params.matchId as string
    const gen = ++fetchGen

    loading.value = true
    try {
      await tournamentsStore.fetchTournamentBySlug(tournamentSlug)
      if (gen !== fetchGen) return

      if (tournamentsStore.currentTournament) {
        const tournamentId = tournamentsStore.currentTournament.id

        const fetched = await tournamentsStore.fetchMatch(tournamentId, matchId)
        if (gen !== fetchGen) return
        match.value = fetched

        // Resolve BOTH of this match's registrations, and which one is the
        // caller's, in one targeted request (P-53/P-56).
        //
        // This replaced `fetchRegistrations(..., { per_page: 100 })`. That
        // fetch existed only so `useMatchContext` could SCAN the list for the
        // caller's row, and `PaginationParams::limit` clamps `per_page` at
        // 100 — so in any tournament with more than 100 participants every
        // player past row 100 resolved to `null` and lost the submit, confirm,
        // schedule and check-in affordances entirely, with no error shown.
        // Nothing on this page needs the whole registrations list, so the
        // paged fetch is gone rather than merely widened: keeping it is how
        // the ceiling comes back.
        //
        // Anonymous viewers skip it — the endpoint requires auth, and every
        // gate it feeds is participant-only anyway.
        if (authStore.isAuthenticated) {
          await tournamentsStore
            .fetchMatchParticipants(tournamentId, matchId)
            .catch(() => null)
          if (gen !== fetchGen) return
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
          // Veto session carries the picked maps (real ids + names + game
          // order) — result submission and the per-map summary need them.
          if (match.value.veto_required) {
            resultPromises.push(vetoStore.getVetoSession(match.value.id).catch(() => null))
          } else {
            // No veto: the submitter chooses which map was played, from the
            // tournament's pool. map_id is validated server-side, so the
            // panel must offer real maps rather than "map_1" placeholders.
            resultPromises.push(
              tournamentsStore
                .getTournamentMapPool(tournamentId)
                .then((pool) => { tournamentMapPool.value = pool?.maps ?? [] })
                .catch(() => { tournamentMapPool.value = [] }),
            )
          }
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
  // Route-change / stale-response guard: bumped by each fetchAll; in-flight
  // work from an older generation must not write state.
  let fetchGen = 0
  // Set on unmount so a fetchAll that resolves after navigation can't
  // resurrect the poll interval via its `finally` block.
  let disposed = false

  function startPolling() {
    if (disposed) return
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
    disposed = true
    fetchGen++
    stopPolling()
    if (countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
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
    checkInCountdown,
    vetoPickedMaps,
    selectableMaps,

    myRegistration,

    // Actions
    fetchAll,
    fetchResultData,

    // Store access
    schedulingStore,
    resultsStore,
    evidenceStore,
  }
}
