<template>
  <div v-if="match" data-testid="rescue-tab">
    <div class="d-flex align-center justify-space-between mb-3">
      <div class="text-subtitle-1">What is going on with this match</div>
      <v-btn
        size="small"
        variant="tonal"
        prepend-icon="mdi-refresh"
        :loading="rescueStore.diagnosticsState.loading"
        data-testid="rescue-refresh"
        @click="loadDiagnostics"
      >
        Refresh
      </v-btn>
    </div>

    <v-alert
      v-if="rescueStore.diagnosticsState.error"
      type="warning"
      variant="tonal"
      density="compact"
      class="mb-3"
      data-testid="rescue-diagnostics-error"
    >
      Diagnostics could not be loaded: {{ rescueStore.diagnosticsState.error }}
      The summary below comes from the match itself, and the tools still work.
    </v-alert>

    <!-- Summary -->
    <v-table density="compact" class="mb-4" data-testid="rescue-summary">
      <tbody>
        <tr v-for="row in summary" :key="row.label">
          <td class="text-medium-emphasis" width="190">{{ row.label }}</td>
          <td :class="row.tone ? `text-${row.tone}` : undefined">{{ row.value }}</td>
        </tr>
      </tbody>
    </v-table>

    <!-- Problems -->
    <div v-if="diagnostics" class="mb-4" data-testid="rescue-problems">
      <v-alert
        v-if="diagnostics.problems.length === 0"
        type="success"
        variant="tonal"
        density="compact"
        data-testid="rescue-no-problems"
      >
        Nothing looks wrong with this match.
      </v-alert>
      <v-alert
        v-for="problem in diagnostics.problems"
        :key="problem.code"
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-2"
        :data-testid="`rescue-problem-${problem.code}`"
      >
        <div class="d-flex align-center justify-space-between ga-3 flex-wrap">
          <span>{{ problem.message }}</span>
          <v-btn
            v-if="suggestedActionCopy(problem.suggested_action)"
            size="small"
            variant="flat"
            :color="suggestedActionCopy(problem.suggested_action)!.color"
            :prepend-icon="suggestedActionCopy(problem.suggested_action)!.icon"
            :data-testid="`rescue-fix-${problem.code}`"
            @click="runSuggested(problem.suggested_action)"
          >
            {{ suggestedActionCopy(problem.suggested_action)!.label }}
          </v-btn>
        </div>
      </v-alert>
    </div>

    <!-- Guided reopen for a match the expired window already decided -->
    <v-card
      v-if="tool('reopen').enabled"
      variant="outlined"
      color="warning"
      class="mb-4"
      data-testid="rescue-reopen-card"
    >
      <v-card-title class="text-subtitle-1">
        <v-icon class="mr-2">mdi-lock-open-variant</v-icon>
        Reopen match and check-in
      </v-card-title>
      <v-card-text>
        <p class="text-body-2 mb-3">
          This match was {{ match.status === 'forfeit' ? 'forfeited' : 'cancelled' }}
          without being played. If that was a missed check-in and the teams are
          ready to play now, reopen it: the result is cleared, the match goes
          back to Ready, and a new check-in window opens until the deadline
          below. The match time is set to now.
        </p>
        <p class="text-body-2 text-medium-emphasis mb-3">
          To replay on another day instead, use "Reset match to Ready" below and
          then "Set match time".
        </p>
        <v-btn
          color="warning"
          variant="flat"
          prepend-icon="mdi-lock-open-variant"
          :disabled="!deadlineIso"
          :loading="reopening"
          data-testid="rescue-reopen"
          @click="confirmReopen"
        >
          Reopen match and check-in
        </v-btn>
        <v-alert
          v-if="reopenFailure"
          type="error"
          variant="tonal"
          density="compact"
          class="mt-3"
          data-testid="rescue-reopen-failure"
        >
          {{ reopenFailure }}
        </v-alert>
      </v-card-text>
    </v-card>

    <!-- Check-in -->
    <v-card variant="outlined" class="mb-4" data-testid="rescue-checkin-card">
      <v-card-title class="text-subtitle-1">
        <v-icon class="mr-2">mdi-account-check</v-icon>
        Check-in
      </v-card-title>
      <v-card-text>
        <v-row align="center">
          <v-col cols="12" md="5">
            <v-text-field
              v-model="deadlineInput"
              type="datetime-local"
              label="Check-in deadline"
              aria-label="Check-in deadline"
              variant="outlined"
              density="compact"
              hide-details
              data-testid="rescue-deadline"
            />
          </v-col>
          <v-col cols="12" md="7" class="d-flex align-center flex-wrap ga-2">
            <v-chip
              v-for="minutes in DEADLINE_STEPS"
              :key="minutes"
              size="small"
              variant="tonal"
              :data-testid="`rescue-deadline-plus-${minutes}`"
              @click="applyStep(minutes)"
            >
              +{{ minutes }} min
            </v-chip>
            <span class="text-caption text-medium-emphasis">
              from {{ currentDeadlineIsFuture ? 'the current deadline' : 'now' }}
            </span>
          </v-col>
        </v-row>
        <p class="text-caption text-medium-emphasis mt-2 mb-3">
          Times are in your local timezone. Opening check-in on a match with no
          time sets its time to now. Teams already checked in stay checked in.
        </p>
        <div class="d-flex flex-wrap ga-2">
          <RescueToolButton
            :state="deadlineIso ? tool('check_in_window') : missingDeadline"
            icon="mdi-timer-plus"
            :loading="rescueStore.checkInWindowState.loading"
            testid="rescue-checkin-window"
            @run="confirmCheckInWindow"
          >
            {{ checkInWindowLabel(match.status) }}
          </RescueToolButton>
          <RescueToolButton
            v-for="team in teamsToCheckIn"
            :key="team.registrationId"
            :state="tool('check_in_team')"
            icon="mdi-account-check"
            :loading="checkingInId === team.registrationId"
            :testid="`rescue-checkin-team-${team.slot}`"
            @run="confirmCheckInTeam(team)"
          >
            Check in {{ team.name }}
          </RescueToolButton>
        </div>
      </v-card-text>
    </v-card>

    <!-- Match state tools -->
    <v-card variant="outlined" class="mb-4" data-testid="rescue-tools-card">
      <v-card-title class="text-subtitle-1">
        <v-icon class="mr-2">mdi-wrench</v-icon>
        Move the match on
      </v-card-title>
      <v-card-text>
        <div class="d-flex flex-wrap ga-2 mb-2">
          <RescueToolButton
            :state="tool('set_time')"
            icon="mdi-calendar-clock"
            testid="rescue-set-time"
            @run="$emit('set-time')"
          >
            {{ match.scheduled_at ? 'Change match time' : 'Set match time' }}
          </RescueToolButton>
          <RescueToolButton
            :state="tool('start_veto')"
            icon="mdi-play"
            :loading="transitioningTo === 'pick_ban'"
            testid="rescue-start-veto"
            @run="confirmStartVeto"
          >
            Start veto
          </RescueToolButton>
          <RescueToolButton
            :state="tool('reset_veto')"
            icon="mdi-restart"
            color="warning"
            :loading="rescueStore.vetoResetState.loading"
            testid="rescue-reset-veto"
            @run="confirmResetVeto"
          >
            Restart veto
          </RescueToolButton>
          <RescueToolButton
            :state="tool('skip_veto')"
            icon="mdi-skip-next"
            color="warning"
            :loading="transitioningTo === 'in_progress'"
            testid="rescue-skip-veto"
            @run="confirmSkipVeto"
          >
            Skip veto and start match
          </RescueToolButton>
          <RescueToolButton
            :state="tool('retry_completion')"
            icon="mdi-refresh"
            :loading="rescueStore.retryCompletionState.loading"
            testid="rescue-retry-completion"
            @run="confirmRetryCompletion"
          >
            Retry completion
          </RescueToolButton>
        </div>
        <v-divider class="my-3" />
        <RescueToolButton
          :state="tool('reset')"
          icon="mdi-backup-restore"
          color="error"
          :loading="rescueStore.resetState.loading"
          testid="rescue-reset"
          @run="confirmReset"
        >
          Reset match to Ready
        </RescueToolButton>
        <p class="text-caption text-medium-emphasis mt-1 mb-0">
          The way out of any stuck state: clears the time, check-ins, veto,
          result or forfeit, and the server reservation, and starts over.
        </p>
      </v-card-text>
    </v-card>

    <MatchServerRescueCard
      ref="serverCard"
      :match-id="match.id"
      :reservation="diagnostics?.reservation ?? null"
      @changed="afterAction"
    />

    <ConfirmDialogHost :dialog="confirmDialog" />
    <ReasonDialogHost :dialog="reasonDialog" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import MatchServerRescueCard from './MatchServerRescueCard.vue'
import ReasonDialogHost from './ReasonDialogHost.vue'
import RescueToolButton from './RescueToolButton.vue'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useReasonDialog } from '@/composables/useReasonDialog'
import { useSnackbar } from '@/composables/useSnackbar'
import { useMatchRescueStore } from '@/stores/matchRescue'
import { useTournamentsStore, type TournamentMatchResponse } from '@/stores/tournaments'
import { formatDateTime, formatDateTimeForInput } from '@/utils/formatters'
import {
  DEADLINE_STEPS, DEFAULT_WINDOW_MINUTES, bumpDeadline, checkInWindowLabel, describeRelative,
  isPast, runGuidedReopen, suggestedActionCopy, toolState,
  type RescueTool, type SuggestedAction, type ToolState,
} from '@/utils/matchRescue'
import { getStatusLabel, matchStatusMap, reservationStatusMap } from '@/utils/statusMaps'

const props = defineProps<{
  match: TournamentMatchResponse | null
  tournamentId: string
  /** Load diagnostics only while the tab is on screen. */
  active: boolean
}>()

const emit = defineEmits<{
  updated: []
  /** Take the admin to the schedule form. */
  'set-time': []
}>()

const rescueStore = useMatchRescueStore()
const tournamentsStore = useTournamentsStore()
const { diagnostics } = storeToRefs(rescueStore)
const feedback = useActionFeedback()
const snackbar = useSnackbar()
const confirmDialog = useConfirmDialog()
const reasonDialog = useReasonDialog()

const serverCard = ref<InstanceType<typeof MatchServerRescueCard> | null>(null)
const deadlineInput = ref('')
const checkingInId = ref<string | null>(null)
const transitioningTo = ref<string | null>(null)
const reopening = ref(false)
const reopenFailure = ref<string | null>(null)

const missingDeadline: ToolState = { enabled: false, why: 'Pick a check-in deadline first.' }

function tool(name: RescueTool): ToolState {
  return toolState(name, props.match?.status ?? '')
}

/** The deadline in force: diagnostics first, the match row when it carries one. */
const currentDeadline = computed<string | null>(() => {
  if (diagnostics.value) return diagnostics.value.check_in_deadline ?? null
  return props.match?.check_in_deadline ?? null
})
const currentDeadlineIsFuture = computed(() => !!currentDeadline.value && !isPast(currentDeadline.value))

const deadlineIso = computed<string | null>(() => {
  if (!deadlineInput.value) return null
  const date = new Date(deadlineInput.value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
})

function applyStep(minutes: number) {
  deadlineInput.value = formatDateTimeForInput(bumpDeadline(currentDeadline.value, minutes).toISOString())
}

function resetDeadlineInput() {
  deadlineInput.value = formatDateTimeForInput(
    bumpDeadline(null, DEFAULT_WINDOW_MINUTES).toISOString(),
  )
}

interface TeamSlot {
  slot: 1 | 2
  registrationId: string
  name: string
}

const teamsToCheckIn = computed<TeamSlot[]>(() => {
  const m = props.match
  if (!m) return []
  const d = diagnostics.value
  const teams: TeamSlot[] = []
  if (m.participant1_registration_id && !(d?.participant1_checked_in_at ?? m.participant1_checked_in_at)) {
    teams.push({ slot: 1, registrationId: m.participant1_registration_id, name: m.participant1_name || 'Team 1' })
  }
  if (m.participant2_registration_id && !(d?.participant2_checked_in_at ?? m.participant2_checked_in_at)) {
    teams.push({ slot: 2, registrationId: m.participant2_registration_id, name: m.participant2_name || 'Team 2' })
  }
  return teams
})

interface SummaryRow {
  label: string
  value: string
  tone?: 'error' | 'warning'
}

function checkedInText(name: string | null | undefined, at: string | null | undefined): string {
  return `${name || 'TBD'}: ${at ? `checked in ${formatDateTime(at)}` : 'not checked in'}`
}

const VETO_LABELS: Record<string, string> = {
  pending: 'Created, waiting for both teams to check in',
  coin_flip: 'Waiting for the coin flip',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

/** Plain-language state of the match: what the admin would otherwise ask the database. */
const summary = computed<SummaryRow[]>(() => {
  const m = props.match
  if (!m) return []
  const d = diagnostics.value
  const rows: SummaryRow[] = []
  rows.push({ label: 'Status', value: getStatusLabel(matchStatusMap, d?.status ?? m.status) })

  const scheduledAt = d ? d.scheduled_at : m.scheduled_at
  rows.push(scheduledAt
    ? { label: 'Match time', value: formatDateTime(scheduledAt) }
    : { label: 'Match time', value: 'Not set', tone: m.status === 'scheduled' ? 'error' : undefined })

  const deadline = currentDeadline.value
  if (deadline) {
    const expired = isPast(deadline)
    rows.push({
      label: 'Check-in deadline',
      value: `${formatDateTime(deadline)} (${describeRelative(deadline)})`,
      tone: expired && m.status === 'checking_in' ? 'error' : undefined,
    })
  } else {
    rows.push({ label: 'Check-in deadline', value: 'No window open' })
  }
  rows.push({
    label: 'Checked in',
    value: [
      checkedInText(m.participant1_name, d ? d.participant1_checked_in_at : m.participant1_checked_in_at),
      checkedInText(m.participant2_name, d ? d.participant2_checked_in_at : m.participant2_checked_in_at),
    ].join(' · '),
  })

  if (!d) return rows

  if (d.veto) {
    const action = d.veto.status === 'in_progress' ? `, on action ${d.veto.current_action_number}` : ''
    const clock = d.veto.action_deadline ? `, turn ends ${describeRelative(d.veto.action_deadline)}` : ''
    rows.push({ label: 'Veto', value: `${VETO_LABELS[d.veto.status] ?? d.veto.status}${action}${clock}` })
  } else {
    rows.push({
      label: 'Veto',
      value: d.veto_required ? 'Required, but no veto session exists' : 'None for this match yet',
      tone: d.veto_required ? 'error' : undefined,
    })
  }

  if (d.reservation) {
    const parts = [getStatusLabel(reservationStatusMap, d.reservation.status)]
    if (d.reservation.server_name) parts.push(`on ${d.reservation.server_name}`)
    if (d.reservation.queue_position) parts.push(`number ${d.reservation.queue_position} in the queue`)
    if (d.reservation.failure_reason) parts.push(d.reservation.failure_reason)
    rows.push({
      label: 'Game server',
      value: parts.join(', '),
      tone: d.reservation.status === 'failed' ? 'error' : undefined,
    })
  } else {
    rows.push({ label: 'Game server', value: 'No reservation' })
  }

  if (d.pending_proposal) {
    const by = d.pending_proposal.proposed_by_registration_id === m.participant1_registration_id
      ? m.participant1_name
      : m.participant2_name
    rows.push({
      label: 'Time proposal',
      value: `Pending from ${by || 'a team'}, expires ${formatDateTime(d.pending_proposal.expires_at)}`,
    })
  }
  if (d.pending_claim) {
    const source = d.pending_claim.source === 'server' ? 'the game server' : 'a team'
    const auto = d.pending_claim.auto_confirm_at
      ? `, confirms itself ${formatDateTime(d.pending_claim.auto_confirm_at)}`
      : ''
    rows.push({
      label: 'Result',
      value: `Pending claim from ${source}${auto}`,
    })
  }
  if (d.open_dispute_id) {
    rows.push({ label: 'Dispute', value: 'Open: resolve it from Admin → Disputes', tone: 'warning' })
  } else if (d.disputed) {
    rows.push({ label: 'Dispute', value: 'Marked disputed, but no dispute is open', tone: 'warning' })
  }
  if (d.saga) {
    const failed = d.saga.failed_step ? `, stopped at "${d.saga.failed_step.replace(/_/g, ' ')}"` : ''
    rows.push({
      label: 'Completion',
      value: `${d.saga.status.replace(/_/g, ' ')}${failed} (${formatDateTime(d.saga.updated_at)})`,
      tone: d.saga.failed_step ? 'error' : undefined,
    })
  }
  return rows
})

async function loadDiagnostics() {
  if (!props.match) return
  // Failure is shown inline; the tools stay usable without diagnostics.
  await rescueStore.fetchDiagnostics(props.tournamentId, props.match.id).catch(() => null)
}

/** After any action: re-read the diagnosis and let the page refetch the match. */
async function afterAction() {
  emit('updated')
  await loadDiagnostics()
}

watch(
  () => [props.match?.id, props.active] as const,
  ([id, active], previous) => {
    if (id !== previous?.[0]) {
      rescueStore.clear()
      reopenFailure.value = null
      resetDeadlineInput()
    }
    if (id && active) void loadDiagnostics()
  },
  { immediate: true },
)

// ---- Actions ---------------------------------------------------------------

function confirmCheckInWindow() {
  const match = props.match
  const deadline = deadlineIso.value
  if (!match || !deadline) return
  const opening = match.status !== 'checking_in'
  reasonDialog.confirm({
    title: checkInWindowLabel(match.status),
    message: opening
      ? `Open check-in for this match now, until ${formatDateTime(deadline)}?`
      : `Move the check-in deadline to ${formatDateTime(deadline)}?`,
    effects: opening
      ? [
          'The match moves to check-in immediately',
          match.scheduled_at ? 'The match time stays as it is' : 'The match time is set to now',
          'The veto is prepared, as it is when a window opens on its own',
        ]
      : ['Teams already checked in stay checked in'],
    action: checkInWindowLabel(match.status),
    defaultReason: opening ? 'Opening check-in by hand' : 'Giving the teams more time to check in',
    handler: async (reason) => {
      await feedback.run(
        () => rescueStore.setCheckInWindow(props.tournamentId, match.id, deadline, reason),
        {
          success: opening ? 'Check-in is open' : 'Check-in deadline moved',
          errorSource: rescueStore.checkInWindowState,
          after: afterAction,
          rethrow: true,
        },
      )
    },
  })
}

function confirmCheckInTeam(team: TeamSlot) {
  const match = props.match
  if (!match) return
  confirmDialog.confirm({
    title: `Check in ${team.name}`,
    message:
      `Check ${team.name} in on their behalf? Once both teams are checked in the match ` +
      'moves on to the veto (or straight to the match when there is none).',
    action: 'Check in',
    handler: async () => {
      checkingInId.value = team.registrationId
      try {
        await feedback.run(
          () => tournamentsStore.matchCheckIn(props.tournamentId, match.id, team.registrationId),
          {
            success: `${team.name} checked in`,
            errorSource: tournamentsStore.matchCheckInState,
            after: afterAction,
            rethrow: true,
          },
        )
      } finally {
        checkingInId.value = null
      }
    },
  })
}

function transition(toStatus: 'pick_ban' | 'in_progress', reason: string, success: string) {
  const match = props.match
  if (!match) return Promise.resolve()
  transitioningTo.value = toStatus
  return feedback
    .run(
      () => tournamentsStore.adminMatchTransition(props.tournamentId, match.id, toStatus, reason),
      {
        success,
        errorSource: tournamentsStore.adminMatchTransitionState,
        after: afterAction,
        rethrow: true,
      },
    )
    .finally(() => { transitioningTo.value = null })
}

function confirmStartVeto() {
  reasonDialog.confirm({
    title: 'Start veto',
    message: 'Move this match from check-in to pick/ban and start the map veto, without waiting for both teams to check in?',
    action: 'Start veto',
    defaultReason: 'Starting the veto without waiting for check-in',
    handler: async (reason) => { await transition('pick_ban', reason, 'Veto started') },
  })
}

function confirmSkipVeto() {
  reasonDialog.confirm({
    title: 'Skip veto and start match',
    message: 'Move this match straight to in progress, leaving the veto unfinished?',
    warning:
      'No maps will have been picked and the portal will not load the match onto a game ' +
      'server: the teams play on a server arranged by hand and report the result themselves.',
    action: 'Skip veto',
    color: 'warning',
    defaultReason: 'Skipping the veto; match played on a manually arranged server',
    handler: async (reason) => { await transition('in_progress', reason, 'Match started without a veto') },
  })
}

function confirmResetVeto() {
  const match = props.match
  if (!match) return
  reasonDialog.confirm({
    title: 'Restart veto',
    message: 'Discard the current veto and start a fresh one?',
    effects: [
      'Every ban, pick and side choice made so far is discarded',
      'Any game server reservation for this match is released',
      'The match moves to pick/ban with a new coin flip',
    ],
    action: 'Restart veto',
    color: 'warning',
    defaultReason: 'Restarting a veto that went wrong',
    handler: async (reason) => {
      await feedback.run(
        () => rescueStore.resetVeto(props.tournamentId, match.id, reason),
        {
          success: 'Veto restarted',
          errorSource: rescueStore.vetoResetState,
          after: afterAction,
          rethrow: true,
        },
      )
    },
  })
}

/** Exactly what a reset clears, shown before the admin confirms. */
const RESET_EFFECTS = [
  'The match time',
  'Both teams\' check-ins and the check-in deadline',
  'The veto: bans, picks and side choices',
  'Any result, forfeit or dispute flag on the match, and pending result claims',
  'Pending time proposals',
  'The game server reservation (the match is unloaded from the server)',
]

function confirmReset() {
  const match = props.match
  if (!match) return
  reasonDialog.confirm({
    title: 'Reset match to Ready',
    message: 'Put this match back to Ready, as if it had never been scheduled? This clears:',
    effects: RESET_EFFECTS,
    warning: 'Standings are recalculated without this match. This cannot be undone.',
    action: 'Reset match',
    color: 'error',
    defaultReason: 'Resetting a stuck match',
    handler: async (reason) => {
      await feedback.run(
        () => rescueStore.resetMatch(props.tournamentId, match.id, reason),
        {
          success: 'Match reset to Ready',
          errorSource: rescueStore.resetState,
          after: afterAction,
          rethrow: true,
        },
      )
    },
  })
}

function confirmReopen() {
  const match = props.match
  const deadline = deadlineIso.value
  if (!match || !deadline) return
  reasonDialog.confirm({
    title: 'Reopen match and check-in',
    message: `Clear the ${match.status === 'forfeit' ? 'forfeit' : 'cancellation'} and open check-in until ${formatDateTime(deadline)}? This clears:`,
    effects: RESET_EFFECTS,
    warning: 'Standings are recalculated without this match. The match time is set to now.',
    action: 'Reopen match',
    color: 'warning',
    defaultReason: 'Reopening a match decided by a missed check-in',
    handler: async (reason) => {
      reopening.value = true
      reopenFailure.value = null
      try {
        const result = await runGuidedReopen({
          reset: () => rescueStore.resetMatch(props.tournamentId, match.id, reason),
          openCheckIn: () => rescueStore.setCheckInWindow(props.tournamentId, match.id, deadline, reason),
        })
        // The first step may have gone through even when the second failed.
        if (result.failedStep !== 'reset') await afterAction()
        if (!result.ok) {
          reopenFailure.value = result.message
          snackbar.show(result.message, 'error')
          // A half-done reopen is reported in the tab, where the next step is.
          if (result.failedStep === 'reset') throw new Error(result.message)
          return
        }
        snackbar.show(`${result.message} until ${formatDateTime(deadline)}`, 'success')
      } finally {
        reopening.value = false
      }
    },
  })
}

function confirmRetryCompletion() {
  const match = props.match
  if (!match) return
  reasonDialog.confirm({
    title: 'Retry completion',
    message:
      'Re-run what happens after a match is decided: standings are recalculated and the ' +
      'stage is settled. Safe to run more than once.',
    action: 'Retry completion',
    defaultReason: 'Re-running completion for a match whose standings did not update',
    handler: async (reason) => {
      const result = await feedback.run(
        () => rescueStore.retryCompletion(props.tournamentId, match.id, reason),
        { errorSource: rescueStore.retryCompletionState, rethrow: true },
      )
      if (result) {
        snackbar.show(
          result.ran ? `Completion re-run: ${result.outcome}` : `Nothing to re-run: ${result.outcome}`,
          result.ran ? 'success' : 'info',
        )
      }
      await afterAction()
    },
  })
}

/** Run the tool a diagnosed problem points at. */
function runSuggested(action: string) {
  switch (action as SuggestedAction) {
    case 'set_time': emit('set-time'); break
    case 'extend_checkin': confirmCheckInWindow(); break
    case 'reset_veto': confirmResetVeto(); break
    case 'reset': confirmReset(); break
    case 'retry_completion': confirmRetryCompletion(); break
    case 'assign_server':
    case 'reload_server':
    case 'clear_server':
    case 'roster_check':
      serverCard.value?.runSuggested(action as SuggestedAction)
      break
  }
}
</script>
