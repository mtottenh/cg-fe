<template>
  <div data-testid="update-job">
    <div class="d-flex align-center ga-2 flex-wrap mb-3">
      <v-btn
        v-if="closable"
        aria-label="Back to the overview"
        title="Back to the overview"
        size="small"
        variant="text"
        prepend-icon="mdi-arrow-left"
        data-testid="update-job-back"
        @click="$emit('close')"
      >
        Back
      </v-btn>
      <span class="text-subtitle-1">
        {{ getStatusLabel(updateOperationMap, job.operation) }}
      </span>
      <v-chip
        size="small"
        variant="tonal"
        :color="getStatusColor(updateJobStatusMap, job.status)"
        :prepend-icon="getStatusIcon(updateJobStatusMap, job.status)"
        data-testid="update-job-status"
      >
        {{ getStatusLabel(updateJobStatusMap, job.status) }}
      </v-chip>
      <v-chip v-if="job.forced" size="x-small" variant="tonal" color="warning">Forced</v-chip>
      <span class="text-caption text-medium-emphasis">
        {{ getStatusLabel(updateTriggerMap, job.trigger) }}
        <template v-if="job.requested_by_username">· {{ job.requested_by_username }}</template>
        · {{ formatDateTime(job.created_at) }}
      </span>
    </div>

    <!-- Phase stepper -->
    <ol class="phase-steps mb-3" aria-label="Phases" data-testid="update-job-phases">
      <li
        v-for="step in steps"
        :key="step.phase"
        :class="['phase-step', `phase-step--${step.state}`]"
        :data-state="step.state"
        :data-phase="step.phase"
      >
        <v-progress-circular
          v-if="step.state === 'active'"
          indeterminate
          size="14"
          width="2"
          color="info"
        />
        <v-icon v-else size="16" :color="STEP_COLORS[step.state]">{{ STEP_ICONS[step.state] }}</v-icon>
        <span>{{ step.label }}</span>
      </li>
    </ol>

    <v-alert
      v-if="outcome"
      :type="outcome.type"
      variant="tonal"
      density="compact"
      class="mb-3"
      data-testid="update-job-outcome"
    >
      <div class="font-weight-medium">{{ outcome.title }}</div>
      <div v-if="job.failed_phase" class="text-body-2">
        Broke in: {{ phaseLabel(job.failed_phase) }}
      </div>
      <div v-if="job.error" class="text-body-2" data-testid="update-job-error">{{ job.error }}</div>
    </v-alert>
    <v-alert
      v-if="job.agent_synthesized"
      type="info"
      variant="tonal"
      density="compact"
      class="mb-3"
      data-testid="update-job-synthesized"
    >
      The helper never reported on this job; the agent wrote this result itself, so the details are
      incomplete.
    </v-alert>

    <!-- Result -->
    <template v-if="terminal">
      <v-table v-if="versionRows.length" density="compact" class="mb-3" data-testid="update-job-versions">
        <thead>
          <tr>
            <th>Component</th>
            <th>Before</th>
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in versionRows" :key="row.label">
            <td>{{ row.label }}</td>
            <td><code>{{ row.before ?? '—' }}</code></td>
            <td>
              <code>{{ row.after ?? '—' }}</code>
              <v-icon v-if="row.changed" size="small" color="success" class="ml-1" title="Changed">
                mdi-arrow-up-bold
              </v-icon>
            </td>
          </tr>
        </tbody>
      </v-table>

      <div class="d-flex flex-wrap ga-2 mb-3 text-body-2 align-center">
        <span data-testid="update-job-restarted">{{ restartedLabel }}</span>
        <template v-if="job.load">
          <LoadHealthChips :load="job.load" />
        </template>
      </div>

      <div v-if="job.config_report" class="mb-3" data-testid="update-job-config-report">
        <div class="text-subtitle-2 mb-1">MatchZy config</div>
        <p v-if="reportEmpty" class="text-body-2 text-medium-emphasis">
          No operator settings changed.
        </p>
        <ul v-else class="text-body-2 config-report">
          <li v-for="c in job.config_report.cvars_changed" :key="`c-${c.name}`">
            <code>{{ c.name }}</code> changed from <code>{{ c.before ?? '(unset)' }}</code> to
            <code>{{ c.after ?? '(unset)' }}</code>
          </li>
          <li v-for="name in job.config_report.cvars_removed" :key="`r-${name}`">
            <code>{{ name }}</code> no longer exists
          </li>
          <li v-for="name in job.config_report.cvars_added" :key="`a-${name}`">
            <code>{{ name }}</code> is new
          </li>
          <li v-for="file in job.config_report.files_changed" :key="`f-${file}`">
            <code>{{ file }}</code> differed from the new upstream copy
          </li>
        </ul>
      </div>
    </template>

    <div v-if="job.log_tail" class="mb-1">
      <div class="text-subtitle-2 mb-1">Log</div>
      <pre ref="logEl" class="log-tail" data-testid="update-job-log">{{ job.log_tail }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import LoadHealthChips from '@/components/admin/server-updates/LoadHealthChips.vue'
import { formatDateTime } from '@/utils/formatters'
import {
  isTerminalStatus,
  phaseLabel,
  phaseSteps,
  updateJobStatusMap,
  updateOperationMap,
  updateTriggerMap,
  type PhaseState,
  type UpdateJobResponse,
  type UpdateVersions,
} from '@/utils/gameServerUpdates'
import { getStatusColor, getStatusIcon, getStatusLabel } from '@/utils/statusMaps'

const props = defineProps<{
  job: UpdateJobResponse
  /** Show a Back button (the job was opened from the overview). */
  closable?: boolean
}>()

defineEmits<{ close: [] }>()

const STEP_ICONS: Record<PhaseState, string> = {
  complete: 'mdi-check-circle',
  active: 'mdi-progress-clock',
  pending: 'mdi-circle-outline',
  error: 'mdi-close-circle',
  skipped: 'mdi-minus-circle-outline',
}
const STEP_COLORS: Record<PhaseState, string> = {
  complete: 'success',
  active: 'info',
  pending: 'grey',
  error: 'error',
  skipped: 'grey',
}

const VERSION_LABELS: Array<[keyof UpdateVersions, string]> = [
  ['lgsm', 'LinuxGSM'],
  ['cs2_build', 'CS2 build'],
  ['metamod', 'Metamod'],
  ['cssharp', 'CounterStrikeSharp'],
  ['matchzy', 'MatchZy'],
]

const steps = computed(() => phaseSteps(props.job))
const terminal = computed(() => isTerminalStatus(props.job.status))

const outcome = computed<{ type: 'error' | 'warning' | 'success'; title: string } | null>(() => {
  switch (props.job.status) {
    case 'failed':
      return { type: 'error', title: 'The update failed.' }
    case 'rolled_back':
      return {
        type: 'warning',
        title: 'The update was rolled back: the previous plugin set was restored.',
      }
    case 'lost':
      return {
        type: 'error',
        title: 'No word from the agent for 20 minutes; the outcome is unknown. Check the server.',
      }
    case 'succeeded':
      return { type: 'success', title: 'The update succeeded.' }
    default:
      return null
  }
})

const versionRows = computed(() => {
  const before = props.job.before
  const after = props.job.after
  if (!before && !after) return []
  return VERSION_LABELS.map(([key, label]) => {
    const b = before?.[key] ?? null
    const a = after?.[key] ?? null
    return { label, before: b, after: a, changed: b !== null && a !== null && a !== b }
  }).filter((r) => r.before !== null || r.after !== null)
})

const restartedLabel = computed(() => {
  if (props.job.restarted === true) return 'CS2 was restarted.'
  if (props.job.restarted === false) return 'CS2 was not restarted.'
  return 'Whether CS2 was restarted is unknown.'
})

const reportEmpty = computed(() => {
  const r = props.job.config_report
  if (!r) return true
  return (
    r.cvars_changed.length + r.cvars_removed.length + r.cvars_added.length + r.files_changed.length === 0
  )
})

// Keep the newest log lines in view as the tail grows.
const logEl = ref<HTMLElement | null>(null)
watch(
  () => props.job.log_tail,
  async () => {
    await nextTick()
    if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
  },
  { immediate: true },
)
</script>

<style scoped>
.phase-steps {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.phase-step {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8125rem;
}
.phase-step--pending,
.phase-step--skipped {
  opacity: 0.6;
}
.phase-step--skipped span {
  text-decoration: line-through;
}
.phase-step--active {
  font-weight: 600;
}
.phase-step--error {
  color: rgb(var(--v-theme-error));
  font-weight: 600;
}
.log-tail {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.75rem;
  line-height: 1.35;
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  padding: 8px;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.config-report {
  padding-left: 1.25rem;
}
</style>
