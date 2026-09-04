<template>
  <v-card variant="outlined">
    <v-card-title class="d-flex align-center">
      <v-icon start>mdi-timeline-clock</v-icon>
      Match Status
    </v-card-title>
    <v-divider />
    <v-card-text>
      <div class="status-timeline">
        <div
          v-for="(step, index) in steps"
          :key="step.status"
          :class="['step', getStepClass(step, index)]"
        >
          <div class="step-indicator">
            <div class="step-icon">
              <v-icon v-if="isStepComplete(step)" color="success" size="small">mdi-check</v-icon>
              <v-icon v-else-if="isStepCurrent(step)" :color="getStepColor(step)" size="small">{{ step.icon }}</v-icon>
              <span v-else class="step-number">{{ index + 1 }}</span>
            </div>
            <div v-if="index < steps.length - 1" class="step-line" :class="{ 'complete': isStepComplete(step) }" />
          </div>
          <div class="step-content">
            <div class="step-title" :class="{ 'font-weight-bold': isStepCurrent(step) }">
              {{ step.label }}
            </div>
            <div v-if="getStepTimestamp(step)" class="text-caption text-medium-emphasis">
              {{ formatDateTime(getStepTimestamp(step)!) }}
            </div>
            <div v-if="getStepNote(step)" class="text-caption text-medium-emphasis font-italic">
              {{ getStepNote(step) }}
            </div>
          </div>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TournamentMatchResponse } from '@/stores/tournaments'
import type { components } from '@/api/types'
import { formatDateTime } from '@/utils/formatters'

type MatchStatusLogResponse = components['schemas']['MatchStatusLogResponse']

const props = defineProps<{
  match: TournamentMatchResponse
  schedulingMode?: 'live' | 'self_scheduled' | 'hybrid'
  /**
   * P-66: the real transition log. When present, steps show the moment the
   * match actually entered them (and flag admin overrides) instead of the
   * three-timestamp inference below; absent, the old static rendering holds.
   */
  history?: MatchStatusLogResponse[]
  /**
   * The tournament (or stage) configures a map veto. `match.veto_required`
   * is only set once a session exists, which made the stepper grow a
   * Pick/Ban step mid-match; this keeps it there from the start.
   */
  vetoConfigured?: boolean
}>()

interface Step {
  status: string
  label: string
  icon: string
}

const allSteps: Step[] = [
  { status: 'pending', label: 'Awaiting Participants', icon: 'mdi-account-clock' },
  { status: 'ready', label: 'Ready', icon: 'mdi-account-check' },
  { status: 'scheduled', label: 'Scheduled', icon: 'mdi-calendar-check' },
  { status: 'checking_in', label: 'Check-in', icon: 'mdi-checkbox-marked-circle-outline' },
  { status: 'pick_ban', label: 'Pick/Ban', icon: 'mdi-sword-cross' },
  { status: 'in_progress', label: 'In Progress', icon: 'mdi-play-circle' },
  { status: 'awaiting_result', label: 'Awaiting Result', icon: 'mdi-clock-check' },
  { status: 'completed', label: 'Completed', icon: 'mdi-trophy' },
]

const liveSteps = new Set(['pending', 'ready', 'pick_ban', 'in_progress', 'awaiting_result', 'completed'])
const selfScheduledSteps = new Set(['pending', 'ready', 'scheduled', 'checking_in', 'pick_ban', 'in_progress', 'awaiting_result', 'completed'])

/**
 * Terminal outcomes other than `completed`. `forfeit` and `disputed` are real
 * backend statuses (`TournamentMatchStatus`,
 * api/crates/portal-core/src/types/tournament.rs:231) that appeared in NO step
 * and in no `statusOrder` entry, so a forfeited or disputed match highlighted
 * no current step and marked nothing complete — the whole timeline rendered
 * greyed out. They replace the final `Completed` step, which is the slot they
 * actually occupy in the lifecycle. See COVERAGE-PLAN.md §9c.
 */
const terminalOutcomeSteps: Record<string, Step> = {
  forfeit: { status: 'forfeit', label: 'Forfeit', icon: 'mdi-flag-off' },
  disputed: { status: 'disputed', label: 'Disputed', icon: 'mdi-alert-octagon' },
}

const steps = computed<Step[]>(() => {
  if (props.match.status === 'cancelled') {
    return [{ status: 'cancelled', label: 'Cancelled', icon: 'mdi-close-circle' }]
  }

  let filtered: Step[]
  if (props.schedulingMode === 'live') {
    filtered = allSteps.filter(s => liveSteps.has(s.status))
  } else if (props.schedulingMode === 'self_scheduled') {
    filtered = allSteps.filter(s => selfScheduledSteps.has(s.status))
  } else {
    filtered = [...allSteps]
  }

  // Only show pick_ban step if this match has (or will have) a veto
  if (!props.match.veto_required && !props.vetoConfigured) {
    filtered = filtered.filter(s => s.status !== 'pick_ban')
  }

  const outcome = terminalOutcomeSteps[props.match.status]
  if (outcome) {
    filtered = filtered.map(s => (s.status === 'completed' ? outcome : s))
  }

  return filtered
})

const statusOrder = [
  'pending',
  'ready',
  'scheduled',
  'checking_in',
  'pick_ban',
  'in_progress',
  'awaiting_result',
  'completed',
]

function getStepIndex(status: string): number {
  // `forfeit` / `disputed` end the match where `completed` would, so they rank
  // at the same position — everything before them is done.
  if (status in terminalOutcomeSteps) return statusOrder.indexOf('completed')
  return statusOrder.indexOf(status)
}

function isStepComplete(step: Step): boolean {
  const currentIndex = getStepIndex(props.match.status)
  const stepIndex = getStepIndex(step.status)
  return stepIndex < currentIndex
}

function isStepCurrent(step: Step): boolean {
  return step.status === props.match.status
}

function getStepClass(step: Step, _index: number): string {
  if (isStepComplete(step)) return 'complete'
  if (isStepCurrent(step)) return 'current'
  return 'pending'
}

function getStepColor(step: Step): string {
  switch (step.status) {
    case 'in_progress':
      return 'primary'
    case 'checking_in':
    case 'awaiting_result':
      return 'warning'
    case 'ready':
      return 'info'
    case 'completed':
      return 'success'
    case 'cancelled':
    case 'forfeit':
    case 'disputed':
      return 'error'
    default:
      return 'primary'
  }
}

/**
 * P-66: the latest log row that put the match INTO this step's status. The
 * log is the authority — it records every transition with when and by what —
 * where the match row only carries three timestamp columns.
 */
function logEntryFor(step: Step): MatchStatusLogResponse | null {
  const rows = props.history?.filter((h) => h.to_status === step.status)
  return rows && rows.length > 0 ? rows[rows.length - 1]! : null
}

function getStepTimestamp(step: Step): string | null {
  if (isStepComplete(step) || isStepCurrent(step)) {
    const logged = logEntryFor(step)
    if (logged) return logged.transitioned_at
    switch (step.status) {
      case 'scheduled':
        return props.match.scheduled_at || null
      case 'in_progress':
        return props.match.started_at || null
      case 'completed':
      case 'forfeit':
      case 'disputed':
        return props.match.completed_at || null
      default:
        return null
    }
  }
  return null
}

/**
 * A short provenance note for a step, from the log: an admin override is the
 * one actor worth flagging (it is the audited case — P-84's lesson), and a
 * recorded reason beats inference. System transitions stay unlabelled.
 */
function getStepNote(step: Step): string | null {
  if (!isStepComplete(step) && !isStepCurrent(step)) return null
  const logged = logEntryFor(step)
  if (!logged) return null
  if (logged.is_admin_override) return 'admin override'
  return logged.transition_reason ?? null
}

</script>

<style scoped>
.status-timeline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.step {
  display: flex;
  align-items: flex-start;
  min-width: 100px;
  flex: 1;
}

.step-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-right: 8px;
}

.step-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(var(--v-theme-surface-variant), 0.5);
  border: 2px solid rgba(var(--v-border-color), 0.3);
}

.step.complete .step-icon {
  background-color: rgba(var(--v-theme-success), 0.1);
  border-color: rgb(var(--v-theme-success));
}

.step.current .step-icon {
  background-color: rgba(var(--v-theme-primary), 0.1);
  border-color: rgb(var(--v-theme-primary));
}

.step-number {
  font-size: 12px;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.step-line {
  width: 2px;
  flex: 1;
  min-height: 20px;
  background-color: rgba(var(--v-border-color), 0.3);
  margin-top: 4px;
}

.step-line.complete {
  background-color: rgb(var(--v-theme-success));
}

.step-content {
  flex: 1;
  padding-bottom: 16px;
}

.step-title {
  font-size: 14px;
}

.step.pending .step-title {
  color: rgba(var(--v-theme-on-surface), 0.5);
}

@media (max-width: 600px) {
  .status-timeline {
    flex-direction: column;
  }

  .step {
    min-width: 100%;
  }
}
</style>
