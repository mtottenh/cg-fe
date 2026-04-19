<template>
  <v-dialog
    v-model="open"
    max-width="1000"
    persistent
    scrollable
  >
    <v-card v-if="match">
      <v-card-title class="d-flex align-center justify-space-between">
        <div class="d-flex align-center gap-2">
          <v-chip size="small" variant="tonal">#{{ match.match_number }}</v-chip>
          <span>Match Detail</span>
        </div>
        <v-btn icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-tabs v-model="activeTab" bg-color="transparent">
        <v-tab value="overview">Overview</v-tab>
        <v-tab value="results">Results</v-tab>
        <v-tab value="evidence">Evidence</v-tab>
        <v-tab value="actions">Admin Actions</v-tab>
      </v-tabs>

      <v-divider />

      <v-card-text class="pa-4" style="max-height: 70vh; overflow-y: auto">
        <v-tabs-window v-model="activeTab">
          <!-- Overview Tab -->
          <v-tabs-window-item value="overview">
            <!-- Match Header -->
            <v-card variant="outlined" class="mb-4">
              <v-card-text>
                <div class="d-flex align-center justify-center gap-6 pa-4">
                  <div class="text-center">
                    <div class="text-h6" :class="{ 'font-weight-bold text-success': match.winner_registration_id === match.participant1_registration_id }">
                      {{ match.participant1_name || 'TBD' }}
                    </div>
                    <div class="text-h4 font-weight-bold">{{ match.participant1_score ?? '-' }}</div>
                  </div>
                  <div class="text-grey text-h6">vs</div>
                  <div class="text-center">
                    <div class="text-h6" :class="{ 'font-weight-bold text-success': match.winner_registration_id === match.participant2_registration_id }">
                      {{ match.participant2_name || 'TBD' }}
                    </div>
                    <div class="text-h4 font-weight-bold">{{ match.participant2_score ?? '-' }}</div>
                  </div>
                </div>
                <div class="text-center">
                  <v-chip :color="getMatchStatusColor(match.status)" size="small" class="mr-2">
                    {{ formatMatchStatus(match.status) }}
                  </v-chip>
                </div>
              </v-card-text>
            </v-card>

            <!-- Match Metadata -->
            <v-table density="compact">
              <tbody>
                <tr>
                  <td class="text-grey" width="180">Match ID</td>
                  <td><code>{{ match.id }}</code></td>
                </tr>
                <tr v-if="match.round">
                  <td class="text-grey">Round</td>
                  <td>{{ match.round }}</td>
                </tr>
                <tr>
                  <td class="text-grey">Format</td>
                  <td>{{ formatMatchFormat(match.match_format) }}</td>
                </tr>
                <tr>
                  <td class="text-grey">Scheduled At</td>
                  <td>{{ match.scheduled_at ? formatDateTime(match.scheduled_at) : 'Not scheduled' }}</td>
                </tr>
                <tr v-if="match.started_at">
                  <td class="text-grey">Started At</td>
                  <td>{{ formatDateTime(match.started_at) }}</td>
                </tr>
                <tr v-if="match.completed_at">
                  <td class="text-grey">Completed At</td>
                  <td>{{ formatDateTime(match.completed_at) }}</td>
                </tr>
                <tr v-if="match.winner_registration_id">
                  <td class="text-grey">Winner</td>
                  <td>
                    <strong>{{ match.winner_registration_id === match.participant1_registration_id ? match.participant1_name : match.participant2_name }}</strong>
                  </td>
                </tr>
              </tbody>
            </v-table>

            <!-- Status Transition -->
            <div v-if="nextStatus" class="mt-4">
              <v-btn
                :color="getMatchActionColor(match.status)"
                :loading="tournamentsStore.adminMatchTransitionState.loading"
                @click="handleTransition"
              >
                {{ getMatchActionLabel(match.status) }}
              </v-btn>
            </div>
          </v-tabs-window-item>

          <!-- Results Tab -->
          <v-tabs-window-item value="results">
            <!-- Current Result Claim -->
            <div v-if="currentResult" class="mb-4">
              <div class="text-subtitle-1 mb-2">Current Result Claim</div>
              <v-card variant="outlined">
                <v-card-text>
                  <v-table density="compact">
                    <tbody>
                      <tr>
                        <td class="text-grey" width="180">Status</td>
                        <td>
                          <v-chip :color="getResultStatusColor(currentResult.status)" size="small">
                            {{ getResultStatusLabel(currentResult.status) }}
                          </v-chip>
                        </td>
                      </tr>
                      <tr>
                        <td class="text-grey">Score</td>
                        <td>{{ currentResult.claimed_participant1_score }} - {{ currentResult.claimed_participant2_score }}</td>
                      </tr>
                      <tr>
                        <td class="text-grey">Submitted By</td>
                        <td><code>{{ currentResult.submitted_by_user_id }}</code></td>
                      </tr>
                      <tr v-if="currentResult.submitter_notes">
                        <td class="text-grey">Notes</td>
                        <td>{{ currentResult.submitter_notes }}</td>
                      </tr>
                      <tr v-if="currentResult.auto_confirm_at">
                        <td class="text-grey">Auto-confirm</td>
                        <td>{{ formatDateTime(currentResult.auto_confirm_at) }}</td>
                      </tr>
                      <tr>
                        <td class="text-grey">Created</td>
                        <td>{{ formatDateTime(currentResult.created_at) }}</td>
                      </tr>
                    </tbody>
                  </v-table>

                  <!-- Game Results -->
                  <div v-if="currentResult.game_results.length > 0" class="mt-3">
                    <div class="text-subtitle-2 mb-1">Game Results</div>
                    <v-table density="compact">
                      <thead>
                        <tr>
                          <th>Game</th>
                          <th>Map</th>
                          <th>P1 Score</th>
                          <th>P2 Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="gr in currentResult.game_results" :key="gr.game_number">
                          <td>{{ gr.game_number }}</td>
                          <td>{{ gr.map_id }}</td>
                          <td>{{ gr.participant1_score }}</td>
                          <td>{{ gr.participant2_score }}</td>
                        </tr>
                      </tbody>
                    </v-table>
                  </div>

                  <!-- Evidence & Demo IDs -->
                  <div v-if="currentResult.evidence_ids.length > 0 || currentResult.demo_link_ids.length > 0" class="mt-3">
                    <div class="text-subtitle-2 mb-1">Attached Evidence</div>
                    <div class="d-flex flex-wrap gap-1">
                      <v-chip v-for="eid in currentResult.evidence_ids" :key="eid" size="small" prepend-icon="mdi-file">
                        {{ eid.slice(0, 8) }}...
                      </v-chip>
                      <v-chip v-for="did in currentResult.demo_link_ids" :key="did" size="small" prepend-icon="mdi-file-video" color="info">
                        {{ did.slice(0, 8) }}...
                      </v-chip>
                    </div>
                  </div>
                </v-card-text>
              </v-card>
            </div>

            <div v-else-if="!matchResultsStore.fetchCurrentResultState.loading" class="text-center pa-4 text-grey">
              No result claim for this match
            </div>

            <!-- Result History -->
            <div v-if="resultHistory.length > 0" class="mt-4">
              <div class="text-subtitle-1 mb-2">Result History ({{ resultHistory.length }})</div>
              <v-timeline density="compact" side="end">
                <v-timeline-item
                  v-for="claim in resultHistory"
                  :key="claim.id"
                  :dot-color="getResultStatusColor(claim.status)"
                  size="small"
                >
                  <v-card variant="tonal" density="compact">
                    <v-card-text class="pa-3">
                      <div class="d-flex align-center gap-2 mb-1">
                        <v-chip :color="getResultStatusColor(claim.status)" size="x-small">{{ getResultStatusLabel(claim.status) }}</v-chip>
                        <span class="text-caption text-grey">{{ formatDateTime(claim.created_at) }}</span>
                      </div>
                      <div class="text-body-2">
                        Score: {{ claim.claimed_participant1_score }} - {{ claim.claimed_participant2_score }}
                        <span v-if="claim.was_auto_confirmed" class="text-caption text-grey ml-2">(auto-confirmed)</span>
                      </div>
                    </v-card-text>
                  </v-card>
                </v-timeline-item>
              </v-timeline>
            </div>
          </v-tabs-window-item>

          <!-- Evidence Tab -->
          <v-tabs-window-item value="evidence">
            <EvidenceDisplay
              :linked-demos="linkedDemos"
              :evidence="evidenceRecords"
              :loading="evidenceLoading"
              :detailed="true"
              :show-empty-state="true"
              :editable="true"
              @unlink="handleUnlinkDemo"
            />

            <!-- Link Demo Form -->
            <v-card variant="outlined" class="mt-4">
              <v-card-title class="text-subtitle-1">
                <v-icon class="mr-2">mdi-link-plus</v-icon>
                Link Demo to Match
              </v-card-title>
              <v-card-text>
                <v-row>
                  <v-col cols="12" md="5">
                    <v-text-field
                      v-model="linkDemoId"
                      label="Demo ID *"
                      variant="outlined"
                      density="compact"
                      placeholder="UUID of the demo"
                      hide-details
                    />
                  </v-col>
                  <v-col cols="6" md="3">
                    <v-select
                      v-model="linkLinkType"
                      :items="linkTypeOptions"
                      label="Link Type"
                      variant="outlined"
                      density="compact"
                      hide-details
                    />
                  </v-col>
                  <v-col cols="6" md="2">
                    <v-text-field
                      v-model.number="linkGameNumber"
                      label="Game #"
                      variant="outlined"
                      density="compact"
                      type="number"
                      hide-details
                    />
                  </v-col>
                  <v-col cols="12" md="2" class="d-flex align-center">
                    <v-btn
                      color="primary"
                      :loading="demosStore.linkToMatchState.loading"
                      :disabled="!linkDemoId"
                      @click="handleLinkDemo"
                    >
                      Link
                    </v-btn>
                  </v-col>
                </v-row>
                <v-alert v-if="linkError" type="error" density="compact" class="mt-3" closable @click:close="linkError = null">
                  {{ linkError }}
                </v-alert>
              </v-card-text>
            </v-card>
          </v-tabs-window-item>

          <!-- Admin Actions Tab -->
          <v-tabs-window-item value="actions">
            <v-row>
              <!-- Schedule -->
              <v-col cols="12">
                <v-card variant="outlined" class="mb-4">
                  <v-card-title class="text-subtitle-1">
                    <v-icon class="mr-2">mdi-calendar</v-icon>
                    Schedule Match
                  </v-card-title>
                  <v-card-text>
                    <v-row>
                      <v-col cols="6">
                        <v-text-field
                          v-model="scheduleDate"
                          type="datetime-local"
                          label="Date & Time"
                          variant="outlined"
                          density="compact"
                        />
                      </v-col>
                      <v-col cols="6">
                        <v-text-field
                          v-model="scheduleNotes"
                          label="Notes (optional)"
                          variant="outlined"
                          density="compact"
                        />
                      </v-col>
                    </v-row>
                    <v-btn
                      color="primary"
                      :loading="tournamentsStore.adminScheduleState.loading"
                      :disabled="!scheduleDate"
                      @click="handleSchedule"
                    >
                      Schedule
                    </v-btn>
                  </v-card-text>
                </v-card>
              </v-col>

              <!-- Forfeit -->
              <v-col cols="12" md="6">
                <v-card variant="outlined" class="mb-4">
                  <v-card-title class="text-subtitle-1">
                    <v-icon class="mr-2" color="warning">mdi-flag</v-icon>
                    Forfeit Match
                  </v-card-title>
                  <v-card-text>
                    <v-select
                      v-model="forfeitRegistrationId"
                      :items="participantOptions"
                      label="Forfeiting Participant"
                      variant="outlined"
                      density="compact"
                      class="mb-2"
                    />
                    <v-select
                      v-model="forfeitType"
                      :items="forfeitTypeOptions"
                      label="Forfeit Type"
                      variant="outlined"
                      density="compact"
                      class="mb-2"
                    />
                    <v-textarea
                      v-model="forfeitReason"
                      label="Reason *"
                      variant="outlined"
                      density="compact"
                      rows="2"
                    />
                    <v-btn
                      color="warning"
                      :loading="tournamentsStore.adminForfeitState.loading"
                      :disabled="!forfeitRegistrationId || !forfeitType || !forfeitReason.trim()"
                      @click="handleForfeit"
                    >
                      Forfeit
                    </v-btn>
                  </v-card-text>
                </v-card>
              </v-col>

              <!-- Double Forfeit -->
              <v-col cols="12" md="6">
                <v-card variant="outlined" class="mb-4">
                  <v-card-title class="text-subtitle-1">
                    <v-icon class="mr-2" color="error">mdi-account-cancel</v-icon>
                    Double Forfeit
                  </v-card-title>
                  <v-card-text>
                    <v-textarea
                      v-model="doubleForfeitReason"
                      label="Reason *"
                      variant="outlined"
                      density="compact"
                      rows="2"
                    />
                    <v-btn
                      color="error"
                      :loading="tournamentsStore.adminDoubleForfeitState.loading"
                      :disabled="!doubleForfeitReason.trim()"
                      @click="handleDoubleForfeit"
                    >
                      Double Forfeit
                    </v-btn>
                  </v-card-text>
                </v-card>
              </v-col>

              <!-- Progression (for completed matches) -->
              <v-col v-if="match.status === 'completed'" cols="12">
                <v-card variant="outlined" class="mb-4">
                  <v-card-title class="text-subtitle-1">
                    <v-icon class="mr-2" color="primary">mdi-arrow-right-bold</v-icon>
                    Bracket Progression
                  </v-card-title>
                  <v-card-text>
                    <v-row>
                      <v-col cols="12" md="4">
                        <div class="text-subtitle-2 mb-2">Process Progression</div>
                        <v-select
                          v-model="progressionWinnerId"
                          :items="participantOptions"
                          label="Winner"
                          variant="outlined"
                          density="compact"
                          class="mb-2"
                        />
                        <v-btn
                          color="primary"
                          :loading="tournamentsStore.processProgressionState.loading"
                          :disabled="!progressionWinnerId"
                          @click="handleProcessProgression"
                        >
                          Process
                        </v-btn>
                      </v-col>
                      <v-col cols="12" md="4">
                        <div class="text-subtitle-2 mb-2">Reapply Progression</div>
                        <v-select
                          v-model="reapplyWinnerId"
                          :items="participantOptions"
                          label="New Winner"
                          variant="outlined"
                          density="compact"
                          class="mb-2"
                        />
                        <v-btn
                          color="warning"
                          :loading="tournamentsStore.reapplyProgressionState.loading"
                          :disabled="!reapplyWinnerId"
                          @click="handleReapplyProgression"
                        >
                          Reapply
                        </v-btn>
                      </v-col>
                      <v-col cols="12" md="4">
                        <div class="text-subtitle-2 mb-2">Revert Progression</div>
                        <p class="text-body-2 text-grey mb-2">Undo bracket advancement for this match.</p>
                        <v-btn
                          color="error"
                          :loading="tournamentsStore.revertProgressionState.loading"
                          @click="handleRevertProgression"
                        >
                          Revert
                        </v-btn>
                      </v-col>
                    </v-row>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>
          </v-tabs-window-item>
        </v-tabs-window>
      </v-card-text>
    </v-card>

    <!-- Loading -->
    <v-card v-else>
      <v-card-text class="text-center pa-8">
        <v-progress-circular indeterminate color="primary" />
        <p class="mt-4 text-grey">Loading match...</p>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useTournamentsStore } from '@/stores/tournaments'
import { useMatchResultsStore, getResultStatusColor, getResultStatusLabel } from '@/stores/matchResults'
import { useEvidenceStore } from '@/stores/evidence'
import { useDemosStore } from '@/stores/demos'
import { useSnackbar } from '@/composables/useSnackbar'
import { formatDateTime } from '@/utils/formatters'
import {
  getMatchStatusColor, formatMatchStatus, formatMatchFormat,
  getNextMatchStatus, getMatchActionLabel, getMatchActionColor,
} from '@/utils/matchStatus'
import EvidenceDisplay from '@/components/match/evidence/EvidenceDisplay.vue'

const props = defineProps<{  matchId: string | null
  tournamentId: string
}>()

const emit = defineEmits<{  updated: []
}>()

const open = defineModel<boolean>({ required: true })

const tournamentsStore = useTournamentsStore()
const matchResultsStore = useMatchResultsStore()
const evidenceStore = useEvidenceStore()
const demosStore = useDemosStore()
const snackbar = useSnackbar()

const activeTab = ref('overview')

// Form state
const scheduleDate = ref('')
const scheduleNotes = ref('')
const forfeitRegistrationId = ref('')
const forfeitType = ref('no_show')
const forfeitReason = ref('')
const doubleForfeitReason = ref('')
const progressionWinnerId = ref('')
const reapplyWinnerId = ref('')

const forfeitTypeOptions = [
  { title: 'No Show', value: 'no_show' },
  { title: 'Forfeit', value: 'forfeit' },
  { title: 'Disqualification', value: 'disqualification' },
]

// Link demo form state
const linkDemoId = ref('')
const linkGameNumber = ref<number | null>(null)
const linkLinkType = ref('manual')
const linkError = ref<string | null>(null)

const linkTypeOptions = [
  { title: 'Manual', value: 'manual' },
  { title: 'Auto Matched', value: 'auto_matched' },
  { title: 'Evidence', value: 'evidence' },
]

const match = computed(() => {
  if (!props.matchId) return null
  return tournamentsStore.matches.find(m => m.id === props.matchId) ?? null
})

const currentResult = computed(() => matchResultsStore.currentResult)
const resultHistory = computed(() => matchResultsStore.resultHistory)
const linkedDemos = computed(() => evidenceStore.linkedDemos)
const evidenceRecords = computed(() => evidenceStore.evidence)
const evidenceLoading = computed(() => evidenceStore.fetchLinkedState.loading || evidenceStore.fetchEvidenceState.loading)

const participantOptions = computed(() => {
  if (!match.value) return []
  const opts = []
  if (match.value.participant1_registration_id) {
    opts.push({ title: match.value.participant1_name || 'P1', value: match.value.participant1_registration_id })
  }
  if (match.value.participant2_registration_id) {
    opts.push({ title: match.value.participant2_name || 'P2', value: match.value.participant2_registration_id })
  }
  return opts
})

const nextStatus = computed(() => {
  if (!match.value) return null
  return getNextMatchStatus(match.value.status)
})

watch(() => props.matchId, async (id) => {
  if (id && open.value) {
    activeTab.value = 'overview'
    resetForms()
    // Pre-fill progression winner from match scores
    if (match.value?.winner_registration_id) {
      progressionWinnerId.value = match.value.winner_registration_id
    }
    // Fetch result data in parallel
    await Promise.allSettled([
      matchResultsStore.fetchCurrentResult(id),
      matchResultsStore.fetchResultHistory(id),
      evidenceStore.fetchLinkedDemos(id),
      evidenceStore.fetchEvidence(id),
    ])
  }
})

function close() {
  open.value = false
}

function resetForms() {
  scheduleDate.value = ''
  scheduleNotes.value = ''
  forfeitRegistrationId.value = ''
  forfeitType.value = 'no_show'
  forfeitReason.value = ''
  doubleForfeitReason.value = ''
  progressionWinnerId.value = ''
  reapplyWinnerId.value = ''
  linkDemoId.value = ''
  linkGameNumber.value = null
  linkLinkType.value = 'manual'
  linkError.value = null
}

// Match status helpers imported from shared utility
// (getMatchStatusColor, formatMatchStatus, formatMatchFormat,
//  getNextMatchStatus, getMatchActionLabel, getMatchActionColor)

async function handleTransition() {
  if (!match.value || !nextStatus.value) return
  try {
    await tournamentsStore.adminMatchTransition(props.tournamentId, match.value.id, nextStatus.value, 'Admin action')
    snackbar.show(`Match transitioned to ${nextStatus.value.replace(/_/g, ' ')}`, 'success')
    emit('updated')
  } catch {
    snackbar.show('Failed to transition match', 'error')
  }
}

async function handleSchedule() {
  if (!match.value || !scheduleDate.value) return
  try {
    await tournamentsStore.adminScheduleMatch(props.tournamentId, match.value.id, new Date(scheduleDate.value).toISOString(), scheduleNotes.value || undefined)
    snackbar.show('Match scheduled', 'success')
    emit('updated')
  } catch {
    snackbar.show('Failed to schedule match', 'error')
  }
}

async function handleForfeit() {
  if (!match.value || !forfeitRegistrationId.value) return
  try {
    await tournamentsStore.adminForfeitMatch(props.tournamentId, match.value.id, forfeitRegistrationId.value, forfeitType.value, forfeitReason.value.trim())
    snackbar.show('Match forfeited', 'success')
    emit('updated')
  } catch {
    snackbar.show('Failed to forfeit match', 'error')
  }
}

async function handleDoubleForfeit() {
  if (!match.value) return
  try {
    await tournamentsStore.adminDoubleForfeit(props.tournamentId, match.value.id, doubleForfeitReason.value.trim())
    snackbar.show('Double forfeit processed', 'success')
    emit('updated')
  } catch {
    snackbar.show('Failed to process double forfeit', 'error')
  }
}

async function handleProcessProgression() {
  if (!match.value || !progressionWinnerId.value) return
  const loserId = match.value.participant1_registration_id === progressionWinnerId.value
    ? match.value.participant2_registration_id
    : match.value.participant1_registration_id
  if (!loserId) return
  try {
    await tournamentsStore.processProgression(match.value.id, progressionWinnerId.value, loserId)
    snackbar.show('Progression processed', 'success')
    emit('updated')
  } catch {
    snackbar.show('Failed to process progression', 'error')
  }
}

async function handleReapplyProgression() {
  if (!match.value || !reapplyWinnerId.value) return
  try {
    await tournamentsStore.reapplyProgression(match.value.id, reapplyWinnerId.value)
    snackbar.show('Progression reapplied', 'success')
    emit('updated')
  } catch {
    snackbar.show('Failed to reapply progression', 'error')
  }
}

async function handleRevertProgression() {
  if (!match.value) return
  try {
    await tournamentsStore.revertProgression(match.value.id)
    snackbar.show('Progression reverted', 'success')
    emit('updated')
  } catch {
    snackbar.show('Failed to revert progression', 'error')
  }
}

async function handleLinkDemo() {
  if (!props.matchId || !linkDemoId.value) return
  linkError.value = null
  try {
    await demosStore.linkToMatch(linkDemoId.value, {
      match_id: props.matchId,
      link_type: linkLinkType.value,
      game_number: linkGameNumber.value,
    })
    snackbar.show('Demo linked to match', 'success')
    linkDemoId.value = ''
    linkGameNumber.value = null
    linkLinkType.value = 'manual'
    await evidenceStore.fetchLinkedDemos(props.matchId)
  } catch (e: unknown) {
    linkError.value = e instanceof Error ? e.message : 'Failed to link demo'
  }
}

async function handleUnlinkDemo(demoId: string) {
  if (!props.matchId) return
  try {
    await demosStore.unlinkFromMatch(demoId, props.matchId)
    snackbar.show('Demo unlinked', 'success')
    await evidenceStore.fetchLinkedDemos(props.matchId)
  } catch {
    snackbar.show('Failed to unlink demo', 'error')
  }
}
</script>
