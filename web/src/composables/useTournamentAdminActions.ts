import { computed, type Ref } from 'vue'
import { useTournamentsStore, type TournamentResponse } from '@/stores/tournaments'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useActionFeedback } from '@/composables/useActionFeedback'

/**
 * Organizes tournament lifecycle actions (publish, open-/close-registration,
 * start, complete, finalize, cancel, advance, process-no-shows) with:
 *
 *  - `can*` computed guards derived from the tournament's current status
 *  - action handlers that wire up snackbar + optional refetch via useActionFeedback
 *  - destructive ones gated by useConfirmDialog
 *
 * Host pages decide which buttons to show (by reading `can*`) and which handler
 * to call on click. See `TournamentStatusActions.vue` for the default UI.
 *
 * Usage:
 *
 *   const actions = useTournamentAdminActions(tournament, { after: fetchData })
 *   // template: <v-btn v-if="actions.canPublish" @click="actions.publish()">...
 */
export function useTournamentAdminActions(
  tournament: Ref<TournamentResponse | null>,
  opts: { after?: () => void | Promise<void> } = {},
) {
  const store = useTournamentsStore()
  const confirmDialog = useConfirmDialog()
  const feedback = useActionFeedback()

  const status = computed(() => tournament.value?.status ?? null)

  const canPublish = computed(() => status.value === 'draft')
  const canOpenRegistration = computed(() => status.value === 'published')
  const canCloseRegistration = computed(() => status.value === 'registration')
  const canStart = computed(() => status.value === 'scheduled')
  const canComplete = computed(() => status.value === 'in_progress')
  const canFinalize = computed(() => status.value === 'completed')
  const canCancel = computed(() =>
    status.value !== null && !['completed', 'finalized', 'cancelled'].includes(status.value)
  )
  const canProcessNoShows = computed(() =>
    status.value === 'scheduled' && tournament.value?.check_in_required === true
  )

  function feedbackOptions(success: string) {
    return {
      success,
      errorSource: store,
      after: opts.after,
    }
  }

  async function publish() {
    if (!tournament.value) return
    await feedback.run(() => store.publishTournament(tournament.value!.id),
      feedbackOptions('Tournament published successfully'))
  }

  async function openRegistration() {
    if (!tournament.value) return
    await feedback.run(() => store.openRegistration(tournament.value!.id),
      feedbackOptions('Registration opened successfully'))
  }

  async function closeRegistration() {
    if (!tournament.value) return
    await feedback.run(() => store.closeRegistration(tournament.value!.id),
      feedbackOptions('Registration closed successfully'))
  }

  async function start() {
    if (!tournament.value) return
    await feedback.run(() => store.startTournament(tournament.value!.id),
      feedbackOptions('Tournament started successfully'))
  }

  async function complete() {
    if (!tournament.value) return
    await feedback.run(() => store.completeTournament(tournament.value!.id),
      feedbackOptions('Tournament completed successfully'))
  }

  async function finalize() {
    if (!tournament.value) return
    await feedback.run(() => store.finalizeTournament(tournament.value!.id),
      feedbackOptions('Tournament finalized successfully'))
  }

  function cancel() {
    if (!tournament.value) return
    confirmDialog.confirm({
      title: 'Cancel Tournament',
      message: 'Are you sure you want to cancel this tournament? This action cannot be undone.',
      action: 'Cancel Tournament',
      color: 'error',
      handler: async () => {
        if (!tournament.value) return
        await feedback.run(() => store.cancelTournament(tournament.value!.id),
          { ...feedbackOptions('Tournament cancelled'), rethrow: true })
      },
    })
  }

  async function advanceRound() {
    if (!tournament.value) return
    await feedback.run(() => store.generateNextRound(tournament.value!.id),
      feedbackOptions('Next round generated successfully'))
  }

  async function processNoShows() {
    if (!tournament.value) return
    await feedback.run(() => store.processNoShows(tournament.value!.id),
      feedbackOptions('No-shows processed'))
  }

  return {
    // Guards
    canPublish,
    canOpenRegistration,
    canCloseRegistration,
    canStart,
    canComplete,
    canFinalize,
    canCancel,
    canProcessNoShows,
    // Actions
    publish,
    openRegistration,
    closeRegistration,
    start,
    complete,
    finalize,
    cancel,
    advanceRound,
    processNoShows,
    // Shared UI state
    confirmDialog,
  }
}
