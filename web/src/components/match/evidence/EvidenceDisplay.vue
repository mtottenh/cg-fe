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
              <!--
                P-138: three states, not two. `validated` is a boolean, so a
                demo whose validation FAILED used to read "Not validated" —
                identical to one nobody had checked. Those are opposite facts
                to an admin resolving a dispute, and the failing one is the
                whole point of the feature.
              -->
              <td v-if="detailed" :data-testid="`demo-link-validated-${dl.link.id}`">
                <v-icon :color="linkValidation(dl).color" size="small">
                  {{ linkValidation(dl).icon }}
                </v-icon>
                <span class="text-caption ml-1">{{ linkValidation(dl).label }}</span>
                <div
                  v-for="err in linkValidationErrors(dl)"
                  :key="err"
                  class="text-caption text-error"
                >
                  {{ err }}
                </div>
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
                <!--
                  P-158: emits the LINK id, not the demo id.

                  The demo id was what let a consumer reach for
                  `DELETE /v1/admin/demos/{demo_id}/link/{match_id}`, which
                  removes only the link and leaves the `match_evidence` row —
                  so on this very component the demo vanished from the table
                  above and stayed listed in Evidence Records below, and the
                  operator could not tell which of the two things they had done.
                  The link id is what `unlinkDemoEvidence` takes, and that is
                  now the single meaning of Unlink on an evidence surface:
                  detach this demo from this match, both rows.
                -->
                <v-btn aria-label="Unlink demo" icon variant="text" size="small" color="error" @click="emit('unlink', dl.link.id)">
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
              <!--
                P-136: this column used to be gated on `v-if="matchId"`, an
                OPTIONAL prop the admin match-detail Evidence tab never passed —
                so on the one surface an admin resolves disputes from, the whole
                Actions column silently did not render and no piece of evidence
                could be opened at all. `matchId` is required now, so a caller
                that forgets it is a type error rather than a dead feature.
              -->
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ev in evidence" :key="ev.id" :data-testid="`evidence-row-${ev.id}`">
              <td>{{ ev.name }}</td>
              <td>
                <!-- P-175: rendered the wire value ("server_log") raw. -->
                <v-chip
                  size="x-small"
                  :color="getStatusColor(evidenceTypeMap, ev.evidence_type)"
                  variant="tonal"
                >
                  {{ getStatusLabel(evidenceTypeMap, ev.evidence_type) }}
                </v-chip>
              </td>
              <td v-if="detailed">
                <v-chip size="x-small" :color="evidenceStatusColor(ev.status)" variant="tonal">
                  {{ evidenceStatusLabel(ev.status) }}
                </v-chip>
              </td>
              <td :data-testid="`evidence-validated-${ev.id}`">
                <v-icon :color="evidenceValidation(ev).color" size="small">
                  {{ evidenceValidation(ev).icon }}
                </v-icon>
                <span class="text-caption ml-1">{{ evidenceValidation(ev).label }}</span>
                <div
                  v-for="err in ev.validation_errors"
                  :key="err"
                  class="text-caption text-error"
                >
                  {{ err }}
                </div>
              </td>
              <td v-if="detailed">{{ formatDateTime(ev.created_at) }}</td>
              <td>
                <v-btn aria-label="View evidence"
                  icon
                  variant="text"
                  size="small"
                  :loading="accessLoading === ev.id"
                  :data-testid="`view-evidence-${ev.id}`"
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
import { evidenceStatusMap, evidenceTypeMap, getStatusColor, getStatusLabel } from '@/utils/statusMaps'
import { validationDisplay, validationErrorsOf } from './validationState'

const props = withDefaults(
  defineProps<{
    linkedDemos: DemoMatchLinkWithDemoResponse[]
    evidence: EvidenceSummaryResponse[]
    /**
     * P-136: REQUIRED, and deliberately so.
     *
     * It was optional, and every piece of behaviour that reaches the server —
     * the Actions column, `getAccessUrl` — was gated on it. `MatchEvidenceTab`
     * (the admin match-detail Evidence tab) simply did not pass it, despite
     * holding a `matchId` prop, so the entire evidence-access feature was dead
     * on the surface where a dispute is resolved and nothing said so. A prop
     * whose absence silently disables a feature is the mechanism; making it
     * required moves the next occurrence to compile time.
     */
    matchId: string
    detailed?: boolean
    loading?: boolean
    showEmptyState?: boolean
    editable?: boolean
  }>(),
  {
    detailed: false,
    loading: false,
    showEmptyState: false,
    editable: false,
  }
)

const emit = defineEmits<{
  /** `demo_match_link.id` — see the button (P-158). Not the demo id. */
  unlink: [demoLinkId: string]
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

// P-138: the three-state read, shared with `DemoBrowser` so the two surfaces
// cannot disagree about what a failed validation looks like.
function linkValidation(dl: DemoMatchLinkWithDemoResponse) {
  return validationDisplay(dl.link.validated, dl.link.validated_at)
}

/**
 * The stored reasons a link's validation failed.
 *
 * Suppressed while the *live* verdict alert for this link is on screen — the
 * operator just pressed Validate and the alert says the same thing in more
 * detail, so repeating it in the table is noise. On a fresh page load, where
 * there is no alert, the table is the only place the reason can appear.
 */
function linkValidationErrors(dl: DemoMatchLinkWithDemoResponse): string[] {
  if (dl.link.validated || validationResults[dl.link.id]) return []
  return validationErrorsOf(dl.link.validation_result)
}

function evidenceValidation(ev: EvidenceSummaryResponse) {
  return validationDisplay(ev.validated, ev.validated_at)
}

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
  accessLoading.value = evidenceId
  try {
    const result = await evidenceStore.getAccessUrl(props.matchId, evidenceId)
    window.open(result.url, '_blank')
  } finally {
    accessLoading.value = null
  }
}
</script>
