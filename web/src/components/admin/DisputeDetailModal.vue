<template>
  <v-dialog
    v-model="open"
    max-width="900"
    persistent
    scrollable
  >
    <v-card v-if="dispute">
      <v-card-title class="d-flex align-center justify-space-between">
        <span>Dispute Details</span>
        <v-btn icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4">
        <!-- Status & Priority Banner -->
        <v-alert type="info" variant="tonal" class="mb-4" density="compact">
          <div class="d-flex align-center gap-2">
            <v-chip :color="getDisputeStatusColor(dispute.status)" size="small">
              {{ getDisputeStatusLabel(dispute.status) }}
            </v-chip>
            <v-chip :color="getDisputePriorityColor(dispute.priority)" size="small" variant="outlined">
              {{ getDisputePriorityLabel(dispute.priority) }} priority
            </v-chip>
            <v-spacer />
            <v-btn
              v-if="dispute.status === 'pending'"
              size="small"
              color="primary"
              variant="tonal"
              prepend-icon="mdi-account-check"
              :loading="store.assignDisputeState.loading"
              @click="handleAssign"
            >
              Assign to Me
            </v-btn>
          </div>
        </v-alert>

        <!-- Dispute Info -->
        <v-card variant="outlined" class="mb-4">
          <v-card-text>
            <v-table density="compact">
              <tbody>
                <tr>
                  <td class="text-grey" width="180">Match ID</td>
                  <td><code>{{ dispute.match_id }}</code></td>
                </tr>
                <tr v-if="dispute.original_participant1_score != null">
                  <td class="text-grey">Original Score</td>
                  <td>{{ dispute.original_participant1_score }} - {{ dispute.original_participant2_score }}</td>
                </tr>
                <tr v-if="dispute.original_winner_registration_id">
                  <td class="text-grey">Original Winner</td>
                  <td><code>{{ dispute.original_winner_registration_id }}</code></td>
                </tr>
                <tr>
                  <td class="text-grey">Raised By</td>
                  <td><code>{{ dispute.disputed_by_user_id }}</code></td>
                </tr>
                <tr>
                  <td class="text-grey">Created</td>
                  <td>{{ formatDateTime(dispute.created_at) }}</td>
                </tr>
                <tr v-if="dispute.result_claim_id">
                  <td class="text-grey">Result Claim</td>
                  <td><code>{{ dispute.result_claim_id }}</code></td>
                </tr>
              </tbody>
            </v-table>

            <div class="mt-3">
              <div class="text-subtitle-2 mb-1">Reason</div>
              <div class="text-body-2" style="white-space: pre-wrap">{{ dispute.reason }}</div>
            </div>

            <div v-if="dispute.description" class="mt-3">
              <div class="text-subtitle-2 mb-1">Description</div>
              <div class="text-body-2" style="white-space: pre-wrap">{{ dispute.description }}</div>
            </div>

            <div v-if="dispute.evidence_ids.length > 0" class="mt-3">
              <div class="text-subtitle-2 mb-1">Evidence</div>
              <v-chip v-for="eid in dispute.evidence_ids" :key="eid" size="small" class="mr-1 mb-1">
                {{ eid.slice(0, 8) }}...
              </v-chip>
            </div>
          </v-card-text>
        </v-card>

        <!-- Resolution Details (if resolved) -->
        <v-card v-if="dispute.resolution" variant="outlined" class="mb-4" color="success">
          <v-card-title class="text-subtitle-1">Resolution</v-card-title>
          <v-card-text>
            <v-table density="compact">
              <tbody>
                <tr>
                  <td class="text-grey" width="180">Type</td>
                  <td>
                    <v-chip size="small" color="success">{{ formatResolutionType(dispute.resolution.resolution_type) }}</v-chip>
                  </td>
                </tr>
                <tr v-if="dispute.resolution.new_participant1_score != null">
                  <td class="text-grey">New Score</td>
                  <td>{{ dispute.resolution.new_participant1_score }} - {{ dispute.resolution.new_participant2_score }}</td>
                </tr>
                <tr v-if="dispute.resolution.new_winner_registration_id">
                  <td class="text-grey">New Winner</td>
                  <td><code>{{ dispute.resolution.new_winner_registration_id }}</code></td>
                </tr>
                <tr>
                  <td class="text-grey">Notes</td>
                  <td>{{ dispute.resolution.notes }}</td>
                </tr>
                <tr v-if="dispute.resolved_by_user_id">
                  <td class="text-grey">Resolved By</td>
                  <td><code>{{ dispute.resolved_by_user_id }}</code></td>
                </tr>
                <tr v-if="dispute.resolved_at">
                  <td class="text-grey">Resolved At</td>
                  <td>{{ formatDateTime(dispute.resolved_at) }}</td>
                </tr>
              </tbody>
            </v-table>
          </v-card-text>
        </v-card>

        <!-- Message Thread -->
        <div class="mb-4">
          <div class="text-subtitle-1 mb-2">Message Thread ({{ messages.length }})</div>

          <div v-if="messages.length === 0" class="text-center pa-4 text-grey">
            No messages yet
          </div>

          <div v-else class="d-flex flex-column gap-2">
            <v-card
              v-for="msg in messages"
              :key="msg.id"
              variant="tonal"
              :color="msg.is_internal ? 'amber-lighten-5' : undefined"
              density="compact"
            >
              <v-card-text class="pa-3">
                <div class="d-flex align-center gap-2 mb-1">
                  <v-chip size="x-small" :color="msg.author_type === 'admin' ? 'primary' : 'grey'">
                    {{ msg.author_type }}
                  </v-chip>
                  <v-chip v-if="msg.is_internal" size="x-small" color="warning" variant="outlined">
                    Internal
                  </v-chip>
                  <v-spacer />
                  <span class="text-caption text-grey">{{ formatDateTime(msg.created_at) }}</span>
                </div>
                <div class="text-body-2" style="white-space: pre-wrap">{{ msg.message }}</div>
              </v-card-text>
            </v-card>
          </div>
        </div>

        <!-- Add Message Form -->
        <v-card variant="outlined" class="mb-4">
          <v-card-text>
            <div class="text-subtitle-2 mb-2">Add Message</div>
            <v-textarea
              v-model="newMessage"
              variant="outlined"
              density="compact"
              rows="3"
              placeholder="Type a message..."
              hide-details="auto"
            />
            <div class="d-flex align-center mt-2">
              <v-switch
                v-model="isInternalNote"
                label="Internal note"
                density="compact"
                hide-details
                color="warning"
              />
              <v-spacer />
              <v-btn
                color="primary"
                size="small"
                :loading="store.addMessageState.loading"
                :disabled="!newMessage.trim()"
                @click="handleAddMessage"
              >
                Send
              </v-btn>
            </div>
          </v-card-text>
        </v-card>

        <!-- Resolution Panel (if unresolved) -->
        <div v-if="!dispute.resolution && dispute.status !== 'closed'">
          <div class="text-subtitle-1 mb-2">Resolve Dispute</div>

          <v-expansion-panels v-model="resolutionPanel">
            <!-- Uphold -->
            <v-expansion-panel value="uphold">
              <v-expansion-panel-title>
                <v-icon class="mr-2" color="success">mdi-check-circle</v-icon>
                Uphold Original Result
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <p class="text-body-2 mb-3">Confirms the original result is correct. The dispute will be closed.</p>
                <v-textarea v-model="resolutionNotes" variant="outlined" density="compact" rows="2" label="Notes *" />
                <v-btn
                  color="success"
                  :loading="store.resolveUpholdState.loading"
                  :disabled="!resolutionNotes.trim()"
                  @click="handleResolveUphold"
                >
                  Uphold Result
                </v-btn>
              </v-expansion-panel-text>
            </v-expansion-panel>

            <!-- Overturn -->
            <v-expansion-panel value="overturn">
              <v-expansion-panel-title>
                <v-icon class="mr-2" color="error">mdi-swap-horizontal</v-icon>
                Overturn Result
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <p class="text-body-2 mb-3">Reverses the result entirely. Requires new scores and winner.</p>
                <v-row>
                  <v-col cols="4">
                    <v-text-field
                      v-model.number="newP1Score"
                      type="number"
                      label="P1 Score *"
                      variant="outlined"
                      density="compact"
                      min="0"
                    />
                  </v-col>
                  <v-col cols="4">
                    <v-text-field
                      v-model.number="newP2Score"
                      type="number"
                      label="P2 Score *"
                      variant="outlined"
                      density="compact"
                      min="0"
                    />
                  </v-col>
                  <v-col cols="4">
                    <v-text-field
                      v-model="newWinnerRegistrationId"
                      label="Winner Reg ID *"
                      variant="outlined"
                      density="compact"
                    />
                  </v-col>
                </v-row>
                <v-textarea v-model="resolutionNotes" variant="outlined" density="compact" rows="2" label="Notes *" />
                <v-btn
                  color="error"
                  :loading="store.resolveOverturnState.loading"
                  :disabled="!canOverturn"
                  @click="handleResolveOverturn"
                >
                  Overturn Result
                </v-btn>
              </v-expansion-panel-text>
            </v-expansion-panel>

            <!-- Adjust Scores -->
            <v-expansion-panel value="adjusted">
              <v-expansion-panel-title>
                <v-icon class="mr-2" color="warning">mdi-pencil</v-icon>
                Adjust Scores
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <p class="text-body-2 mb-3">Modify the scores without changing the winner (unless specified).</p>
                <v-row>
                  <v-col cols="4">
                    <v-text-field
                      v-model.number="newP1Score"
                      type="number"
                      label="P1 Score *"
                      variant="outlined"
                      density="compact"
                      min="0"
                    />
                  </v-col>
                  <v-col cols="4">
                    <v-text-field
                      v-model.number="newP2Score"
                      type="number"
                      label="P2 Score *"
                      variant="outlined"
                      density="compact"
                      min="0"
                    />
                  </v-col>
                  <v-col cols="4">
                    <v-text-field
                      v-model="newWinnerRegistrationId"
                      label="Winner Reg ID (optional)"
                      variant="outlined"
                      density="compact"
                    />
                  </v-col>
                </v-row>
                <v-textarea v-model="resolutionNotes" variant="outlined" density="compact" rows="2" label="Notes *" />
                <v-btn
                  color="warning"
                  :loading="store.resolveAdjustedState.loading"
                  :disabled="!canAdjust"
                  @click="handleResolveAdjusted"
                >
                  Adjust Scores
                </v-btn>
              </v-expansion-panel-text>
            </v-expansion-panel>

            <!-- Rematch -->
            <v-expansion-panel value="rematch">
              <v-expansion-panel-title>
                <v-icon class="mr-2" color="info">mdi-reload</v-icon>
                Order Rematch
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <p class="text-body-2 mb-3">Invalidates the result and orders teams to replay the match.</p>
                <v-textarea v-model="resolutionNotes" variant="outlined" density="compact" rows="2" label="Notes *" />
                <v-btn
                  color="info"
                  :loading="store.resolveRematchState.loading"
                  :disabled="!resolutionNotes.trim()"
                  @click="handleResolveRematch"
                >
                  Order Rematch
                </v-btn>
              </v-expansion-panel-text>
            </v-expansion-panel>

            <!-- Double DQ -->
            <v-expansion-panel value="double-dq">
              <v-expansion-panel-title>
                <v-icon class="mr-2" color="error">mdi-account-cancel</v-icon>
                Double Disqualification
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <p class="text-body-2 mb-3 text-error">Disqualifies both teams. This is a severe action.</p>
                <v-textarea v-model="resolutionNotes" variant="outlined" density="compact" rows="2" label="Notes *" />
                <v-btn
                  color="error"
                  :loading="store.resolveDoubleDqState.loading"
                  :disabled="!resolutionNotes.trim()"
                  @click="handleResolveDoubleDq"
                >
                  Double DQ
                </v-btn>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </div>
      </v-card-text>
    </v-card>

    <!-- Loading -->
    <v-card v-else-if="store.fetchDisputeState.loading">
      <v-card-text class="text-center pa-8">
        <v-progress-circular indeterminate color="primary" />
        <p class="mt-4 text-grey">Loading dispute...</p>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useDisputesStore, getDisputeStatusColor, getDisputeStatusLabel, getDisputePriorityColor, getDisputePriorityLabel } from '@/stores/disputes'
import { useSnackbar } from '@/composables/useSnackbar'
import { formatDateTime } from '@/utils/formatters'

const props = defineProps<{  disputeId: string | null
}>()

const emit = defineEmits<{  resolved: []
}>()

const open = defineModel<boolean>({ required: true })

const store = useDisputesStore()
const snackbar = useSnackbar()

// Form state
const newMessage = ref('')
const isInternalNote = ref(false)
const resolutionPanel = ref<string | undefined>(undefined)
const resolutionNotes = ref('')
const newP1Score = ref<number>(0)
const newP2Score = ref<number>(0)
const newWinnerRegistrationId = ref('')

const dispute = computed(() => store.currentDispute)
const messages = computed(() => store.currentThread)

const canOverturn = computed(() =>
  resolutionNotes.value.trim() &&
  newP1Score.value >= 0 &&
  newP2Score.value >= 0 &&
  newWinnerRegistrationId.value.trim()
)

const canAdjust = computed(() =>
  resolutionNotes.value.trim() &&
  newP1Score.value >= 0 &&
  newP2Score.value >= 0
)

watch(() => props.disputeId, async (id) => {
  if (id && open.value) {
    resetForm()
    try {
      await store.fetchDispute(id)
      // Pre-fill scores from original if available
      if (store.currentDispute) {
        newP1Score.value = store.currentDispute.original_participant1_score ?? 0
        newP2Score.value = store.currentDispute.original_participant2_score ?? 0
      }
    } catch {
      snackbar.show('Failed to load dispute', 'error')
    }
  }
})

function close() {
  open.value = false
}

function resetForm() {
  newMessage.value = ''
  isInternalNote.value = false
  resolutionPanel.value = undefined
  resolutionNotes.value = ''
  newP1Score.value = 0
  newP2Score.value = 0
  newWinnerRegistrationId.value = ''
}

function formatResolutionType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

async function handleAssign() {
  if (!props.disputeId) return
  try {
    await store.assignDispute(props.disputeId)
    snackbar.show('Dispute assigned to you', 'success')
  } catch {
    snackbar.show('Failed to assign dispute', 'error')
  }
}

async function handleAddMessage() {
  if (!props.disputeId || !newMessage.value.trim()) return
  try {
    await store.addMessage(props.disputeId, newMessage.value.trim(), isInternalNote.value)
    newMessage.value = ''
    isInternalNote.value = false
    snackbar.show('Message added', 'success')
  } catch {
    snackbar.show('Failed to add message', 'error')
  }
}

async function handleResolveUphold() {
  if (!props.disputeId) return
  try {
    await store.resolveUphold(props.disputeId, resolutionNotes.value.trim())
    snackbar.show('Dispute upheld', 'success')
    emit('resolved')
  } catch {
    snackbar.show('Failed to uphold dispute', 'error')
  }
}

async function handleResolveOverturn() {
  if (!props.disputeId) return
  try {
    await store.resolveOverturn(props.disputeId, {
      new_participant1_score: newP1Score.value,
      new_participant2_score: newP2Score.value,
      new_winner_registration_id: newWinnerRegistrationId.value.trim(),
      notes: resolutionNotes.value.trim(),
    })
    snackbar.show('Result overturned', 'success')
    emit('resolved')
  } catch {
    snackbar.show('Failed to overturn result', 'error')
  }
}

async function handleResolveAdjusted() {
  if (!props.disputeId) return
  try {
    await store.resolveAdjusted(props.disputeId, {
      new_participant1_score: newP1Score.value,
      new_participant2_score: newP2Score.value,
      new_winner_registration_id: newWinnerRegistrationId.value.trim() || undefined,
      notes: resolutionNotes.value.trim(),
    })
    snackbar.show('Scores adjusted', 'success')
    emit('resolved')
  } catch {
    snackbar.show('Failed to adjust scores', 'error')
  }
}

async function handleResolveRematch() {
  if (!props.disputeId) return
  try {
    await store.resolveRematch(props.disputeId, resolutionNotes.value.trim())
    snackbar.show('Rematch ordered', 'success')
    emit('resolved')
  } catch {
    snackbar.show('Failed to order rematch', 'error')
  }
}

async function handleResolveDoubleDq() {
  if (!props.disputeId) return
  try {
    await store.resolveDoubleDq(props.disputeId, resolutionNotes.value.trim())
    snackbar.show('Both teams disqualified', 'success')
    emit('resolved')
  } catch {
    snackbar.show('Failed to double DQ', 'error')
  }
}
</script>
