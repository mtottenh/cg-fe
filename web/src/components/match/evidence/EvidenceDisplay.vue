<template>
  <div>
    <!-- Loading -->
    <div v-if="loading" class="text-center pa-4">
      <v-progress-circular indeterminate color="primary" size="32" />
    </div>

    <template v-else>
      <!-- Linked Demos -->
      <div v-if="linkedDemos.length > 0">
        <div :class="titleClass" class="mb-2">Linked Demos ({{ linkedDemos.length }})</div>
        <v-table density="compact">
          <thead>
            <tr>
              <th>File Name</th>
              <th>Map</th>
              <th>Game #</th>
              <th v-if="detailed">Validated</th>
              <th v-if="detailed">Linked At</th>
              <th v-if="editable"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="dl in linkedDemos" :key="dl.link.id" :data-testid="`demo-link-row-${dl.link.id}`">
              <td>{{ dl.demo.file_name }}</td>
              <td>{{ (dl.demo.metadata as Record<string, unknown>)?.map_name || '-' }}</td>
              <td>{{ dl.link.game_number ?? '-' }}</td>
              <td v-if="detailed" :data-testid="`demo-link-validated-${dl.link.id}`">
                <v-icon :color="dl.link.validated ? 'success' : 'grey'" size="small">
                  {{ dl.link.validated ? 'mdi-check-circle' : 'mdi-circle-outline' }}
                </v-icon>
                <span class="text-caption ml-1">{{ dl.link.validated ? 'Validated' : 'Not validated' }}</span>
              </td>
              <td v-if="detailed">{{ formatDateTime(dl.link.linked_at) }}</td>
              <td v-if="editable">
                <!--
                  P-111: the control that makes the tick to the left reachable.
                  `DemoMatchLinkRepository::mark_validated` had no caller
                  anywhere in the workspace, so `validated` was false on every
                  row that has ever existed and the column was dead template.

                  It validates against the claimed score for THIS demo's game,
                  read off the result claim — a demo records one map's rounds,
                  while the match row carries the series score, so the match row
                  is the wrong thing to compare against. With no per-game score
                  recorded there is nothing to validate against, and the button
                  says so instead of validating against a guess.
                -->
                <v-btn
                  variant="tonal"
                  size="small"
                  class="mr-1"
                  :loading="validatingLinkId === dl.link.id"
                  :disabled="validatingLinkId !== null || !claimedGameScore(dl)"
                  :title="claimedGameScore(dl)
                    ? 'Check this demo against the reported score for its game'
                    : 'No per-game score has been reported for this game yet'"
                  :data-testid="`validate-demo-${dl.link.id}`"
                  @click="validateDemoLink(dl)"
                >
                  Validate
                </v-btn>
                <v-btn aria-label="Unlink demo" icon variant="text" size="small" color="error" @click="emit('unlink', dl.link.demo_id)">
                  <v-icon size="small">mdi-link-off</v-icon>
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>

        <!--
          The verdict, per link. A failing validation is the interesting
          outcome — the demo contradicts the recorded score — so it stays on
          screen next to the demo it is about rather than in a snackbar.
        -->
        <v-alert
          v-for="dl in linkedDemos"
          v-show="validationResults[dl.link.id]"
          :key="`verdict-${dl.link.id}`"
          :type="validationResults[dl.link.id]?.is_valid ? 'success' : 'error'"
          variant="tonal"
          density="compact"
          class="mt-2"
          :data-testid="`demo-link-verdict-${dl.link.id}`"
        >
          <div class="text-body-2">
            {{ validationResults[dl.link.id]?.is_valid
              ? `${dl.demo.file_name} matches the recorded result`
              : `${dl.demo.file_name} does not match the recorded result` }}
          </div>
          <div v-for="err in validationResults[dl.link.id]?.errors ?? []" :key="err" class="text-caption">
            {{ err }}
          </div>
          <div v-for="warn in validationResults[dl.link.id]?.warnings ?? []" :key="warn" class="text-caption">
            {{ warn }}
          </div>
        </v-alert>

        <v-alert
          v-if="validationError"
          type="error"
          variant="tonal"
          density="compact"
          closable
          class="mt-2"
          @click:close="validationError = null"
        >
          {{ validationError }}
        </v-alert>
      </div>

      <!-- Evidence Records -->
      <div v-if="evidence.length > 0" :class="{ 'mt-4': linkedDemos.length > 0 }">
        <div :class="titleClass" class="mb-2">Evidence Records ({{ evidence.length }})</div>
        <v-table density="compact">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th v-if="detailed">Status</th>
              <th>Validated</th>
              <th v-if="detailed">Created</th>
              <th v-if="matchId">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ev in evidence" :key="ev.id">
              <td>{{ ev.name }}</td>
              <td>
                <v-chip size="x-small" variant="tonal">{{ ev.evidence_type }}</v-chip>
              </td>
              <td v-if="detailed">
                <v-chip size="x-small" :color="evidenceStatusColor(ev.status)" variant="tonal">
                  {{ evidenceStatusLabel(ev.status) }}
                </v-chip>
              </td>
              <td>
                <v-icon :color="ev.validated ? 'success' : 'grey'" size="small">
                  {{ ev.validated ? 'mdi-check-circle' : 'mdi-circle-outline' }}
                </v-icon>
              </td>
              <td v-if="detailed">{{ formatDateTime(ev.created_at) }}</td>
              <td v-if="matchId">
                <v-btn aria-label="View evidence"
                  icon
                  variant="text"
                  size="small"
                  :loading="accessLoading === ev.id"
                  @click="viewEvidence(ev.id)"
                >
                  <v-icon size="small">mdi-open-in-new</v-icon>
                  <v-tooltip activator="parent" location="top">View / Download</v-tooltip>
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>
      </div>

      <!-- Empty State -->
      <div v-if="linkedDemos.length === 0 && evidence.length === 0 && showEmptyState" class="text-center pa-8">
        <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-file-video-outline</v-icon>
        <h3 class="text-h6 mb-2">No Evidence Linked</h3>
        <p class="text-medium-emphasis">No demos or evidence records have been linked to this match.</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import type { DemoMatchLinkWithDemoResponse, EvidenceSummaryResponse } from '@/stores/evidence'
import { useEvidenceStore } from '@/stores/evidence'
import { useMatchResultsStore } from '@/stores/matchResults'
import type { components } from '@/api/types'
import { formatDateTime } from '@/utils/formatters'
import { evidenceStatusMap, getStatusColor, getStatusLabel } from '@/utils/statusMaps'

const props = withDefaults(
  defineProps<{
    linkedDemos: DemoMatchLinkWithDemoResponse[]
    evidence: EvidenceSummaryResponse[]
    matchId?: string
    detailed?: boolean
    loading?: boolean
    showEmptyState?: boolean
    editable?: boolean
  }>(),
  {
    matchId: undefined,
    detailed: false,
    loading: false,
    showEmptyState: false,
    editable: false,
  }
)

const emit = defineEmits<{
  unlink: [demoId: string]
}>()

const evidenceStore = useEvidenceStore()
const matchResultsStore = useMatchResultsStore()
const accessLoading = ref<string | null>(null)

// Demo validation (P-111), keyed by demo_match_link id.
type ValidationResult = components['schemas']['ValidationResultResponse']
const validatingLinkId = ref<string | null>(null)
const validationResults = reactive<Record<string, ValidationResult | undefined>>({})
const validationError = ref<string | null>(null)

const titleClass = computed(() => props.detailed ? 'text-subtitle-1' : 'text-subtitle-2')

/**
 * The reported score for the game this demo covers, or `null` when none has
 * been reported. A demo is one map: `game_results` is the only place the
 * product records a per-map score, so it is the only thing a demo can honestly
 * be checked against.
 */
function claimedGameScore(
  dl: DemoMatchLinkWithDemoResponse,
): { participant1Score: number; participant2Score: number } | null {
  const game = matchResultsStore.currentResult?.game_results?.find(
    (g) => g.game_number === (dl.link.game_number ?? 1),
  )
  if (!game) return null
  return {
    participant1Score: game.participant1_score,
    participant2Score: game.participant2_score,
  }
}

async function validateDemoLink(dl: DemoMatchLinkWithDemoResponse) {
  const claimed = claimedGameScore(dl)
  if (!claimed) return
  validatingLinkId.value = dl.link.id
  validationError.value = null
  try {
    validationResults[dl.link.id] = await evidenceStore.validateDemoLink(
      dl.link.match_id,
      dl.link.id,
      claimed,
    )
  } catch {
    delete validationResults[dl.link.id]
    validationError.value = evidenceStore.validateDemoState.error || 'Failed to validate demo'
  } finally {
    validatingLinkId.value = null
  }
}

// The status cell rendered the RAW value (`quarantined`, `pending`, …) with a
// binary active/not-active colour. `evidenceStatusMap` mirrors the
// `match_evidence_check_status` CHECK
// (api/migrations/0060_evidence_pending_status.sql). See COVERAGE-PLAN.md §9c.
function evidenceStatusColor(status: string): string {
  return getStatusColor(evidenceStatusMap, status)
}

function evidenceStatusLabel(status: string): string {
  return getStatusLabel(evidenceStatusMap, status)
}

async function viewEvidence(evidenceId: string) {
  if (!props.matchId) return
  accessLoading.value = evidenceId
  try {
    const result = await evidenceStore.getAccessUrl(props.matchId, evidenceId)
    window.open(result.url, '_blank')
  } finally {
    accessLoading.value = null
  }
}
</script>
