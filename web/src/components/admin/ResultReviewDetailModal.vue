<template>
  <v-dialog
    v-model="open"
    max-width="800"
    persistent
    scrollable
  >
    <v-card v-if="review">
      <v-card-title class="d-flex align-center justify-space-between">
        <span>Result Review</span>
        <v-btn aria-label="Close" icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4">
        <!-- Status Banner -->
        <v-alert :type="isPending ? 'warning' : review.status === 'approved' ? 'success' : 'error'" variant="tonal" class="mb-4" density="compact">
          <div class="d-flex align-center ga-2">
            <v-chip :color="getReviewStatusColor(review.status)" size="small">
              {{ getReviewStatusLabel(review.status) }}
            </v-chip>
            <v-chip v-if="review.score_mismatch" size="small" color="error" variant="outlined" prepend-icon="mdi-counter">
              Score Mismatch
            </v-chip>
            <v-chip v-if="review.roster_mismatch" size="small" color="warning" variant="outlined" prepend-icon="mdi-account-group">
              Roster Mismatch
            </v-chip>
            <v-chip v-if="review.winner_mismatch" size="small" color="error" variant="outlined" prepend-icon="mdi-trophy">
              Winner Mismatch
            </v-chip>
          </div>
        </v-alert>

        <!-- Review Info -->
        <v-card variant="outlined" class="mb-4">
          <v-card-text>
            <v-table density="compact">
              <tbody>
                <tr>
                  <td class="text-medium-emphasis" width="180">Match ID</td>
                  <td><code>{{ review.match_id }}</code></td>
                </tr>
                <tr>
                  <td class="text-medium-emphasis">Result Claim ID</td>
                  <td><code>{{ review.result_claim_id }}</code></td>
                </tr>
                <tr v-if="review.demo_link_id">
                  <td class="text-medium-emphasis">Demo Link</td>
                  <td><code>{{ review.demo_link_id }}</code></td>
                </tr>
                <tr>
                  <td class="text-medium-emphasis">Created</td>
                  <td>{{ formatDateTime(review.created_at) }}</td>
                </tr>
              </tbody>
            </v-table>
          </v-card-text>
        </v-card>

        <!-- Validation Details -->
        <v-card v-if="review.validation_result" variant="outlined" class="mb-4">
          <v-card-title class="text-subtitle-1">Validation Result</v-card-title>
          <v-card-text>
            <v-row>
              <v-col cols="6">
                <div class="text-caption text-medium-emphasis">Claimed Score</div>
                <div class="text-h6">{{ review.validation_result.claimed_score.join(' - ') }}</div>
              </v-col>
              <v-col cols="6">
                <div class="text-caption text-medium-emphasis">Extracted Score</div>
                <div class="text-h6">
                  {{ review.validation_result.extracted_score ? review.validation_result.extracted_score.join(' - ') : 'N/A' }}
                </div>
              </v-col>
            </v-row>

            <v-row class="mt-2">
              <v-col cols="4">
                <div class="text-caption text-medium-emphasis">Confidence</div>
                <v-chip :color="review.validation_result.confidence >= 0.8 ? 'success' : review.validation_result.confidence >= 0.5 ? 'warning' : 'error'" size="small">
                  {{ (review.validation_result.confidence * 100).toFixed(0) }}%
                </v-chip>
              </v-col>
              <v-col cols="4">
                <div class="text-caption text-medium-emphasis">Valid</div>
                <v-icon :color="review.validation_result.is_valid ? 'success' : 'error'">
                  {{ review.validation_result.is_valid ? 'mdi-check-circle' : 'mdi-close-circle' }}
                </v-icon>
              </v-col>
              <v-col cols="4">
                <div class="text-caption text-medium-emphasis">Map Match</div>
                <v-icon :color="review.validation_result.map_match ? 'success' : 'warning'">
                  {{ review.validation_result.map_match ? 'mdi-check-circle' : 'mdi-alert' }}
                </v-icon>
              </v-col>
            </v-row>

            <div v-if="review.validation_result.warnings.length > 0" class="mt-3">
              <div class="text-subtitle-2 text-warning">Warnings</div>
              <v-list density="compact">
                <v-list-item v-for="(w, i) in review.validation_result.warnings" :key="i" prepend-icon="mdi-alert" density="compact">
                  <v-list-item-title class="text-body-2">{{ w }}</v-list-item-title>
                </v-list-item>
              </v-list>
            </div>

            <div v-if="review.validation_result.errors.length > 0" class="mt-3">
              <div class="text-subtitle-2 text-error">Errors</div>
              <v-list density="compact">
                <v-list-item v-for="(e, i) in review.validation_result.errors" :key="i" prepend-icon="mdi-alert-circle" density="compact">
                  <v-list-item-title class="text-body-2">{{ e }}</v-list-item-title>
                </v-list-item>
              </v-list>
            </div>
          </v-card-text>
        </v-card>

        <!-- Unrecognized Players -->
        <v-card v-if="review.unrecognized_players.length > 0" variant="outlined" class="mb-4">
          <v-card-title class="text-subtitle-1">Unrecognized Players ({{ review.unrecognized_players.length }})</v-card-title>
          <v-card-text>
            <v-table density="compact">
              <thead>
                <tr>
                  <th>Player Name</th>
                  <th>Steam ID</th>
                  <th>Team Side</th>
                  <th>Registration Side</th>
                </tr>
              </thead>
              <tbody>
                <!-- Key includes player_name: synthetic lineup-rule rows
                     (majority/elo/P-26/side-unassigned) carry an empty
                     steam_id, so steam_id alone would collide. -->
                <tr
                  v-for="player in review.unrecognized_players"
                  :key="`${player.steam_id}:${player.player_name}`"
                >
                  <td>{{ player.player_name }}</td>
                  <td><code>{{ player.steam_id }}</code></td>
                  <td>{{ player.team_side }}</td>
                  <td>{{ player.registration_side }}</td>
                </tr>
              </tbody>
            </v-table>
          </v-card-text>
        </v-card>

        <!-- Captain Acknowledgment -->
        <v-card variant="outlined" class="mb-4">
          <v-card-title class="text-subtitle-1">Captain Acknowledgment</v-card-title>
          <v-card-text>
            <v-row>
              <v-col cols="6">
                <div class="d-flex align-center ga-2">
                  <v-icon :color="review.captain1_acknowledged ? 'success' : 'grey'">
                    {{ review.captain1_acknowledged ? 'mdi-check-circle' : 'mdi-circle-outline' }}
                  </v-icon>
                  <div>
                    <div class="text-body-2">Captain 1</div>
                    <div v-if="review.captain1_acknowledged_at" class="text-caption text-medium-emphasis">
                      {{ formatDateTime(review.captain1_acknowledged_at) }}
                    </div>
                  </div>
                </div>
              </v-col>
              <v-col cols="6">
                <div class="d-flex align-center ga-2">
                  <v-icon :color="review.captain2_acknowledged ? 'success' : 'grey'">
                    {{ review.captain2_acknowledged ? 'mdi-check-circle' : 'mdi-circle-outline' }}
                  </v-icon>
                  <div>
                    <div class="text-body-2">Captain 2</div>
                    <div v-if="review.captain2_acknowledged_at" class="text-caption text-medium-emphasis">
                      {{ formatDateTime(review.captain2_acknowledged_at) }}
                    </div>
                  </div>
                </div>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Resolved Info -->
        <v-card v-if="review.reviewed_at" variant="outlined" class="mb-4" color="success">
          <v-card-text>
            <v-table density="compact">
              <tbody>
                <tr>
                  <td class="text-medium-emphasis" width="180">Reviewed By</td>
                  <td><code>{{ review.reviewed_by_user_id }}</code></td>
                </tr>
                <tr>
                  <td class="text-medium-emphasis">Reviewed At</td>
                  <td>{{ formatDateTime(review.reviewed_at) }}</td>
                </tr>
                <tr v-if="review.admin_notes">
                  <td class="text-medium-emphasis">Notes</td>
                  <td>{{ review.admin_notes }}</td>
                </tr>
              </tbody>
            </v-table>
          </v-card-text>
        </v-card>

        <!-- Decision Form (if pending) -->
        <div v-if="isPending">
          <div class="text-subtitle-1 mb-2">Decision</div>
          <v-textarea
            v-model="decisionNotes"
            variant="outlined"
            density="compact"
            rows="3"
            label="Notes (optional)"
            placeholder="Add notes explaining your decision..."
          />
          <div class="d-flex ga-2 mt-2">
            <v-btn
              color="success"
              prepend-icon="mdi-check"
              :loading="store.approveReviewState.loading"
              @click="handleApprove"
            >
              Approve Result
            </v-btn>
            <v-btn
              color="error"
              prepend-icon="mdi-close"
              :loading="store.rejectReviewState.loading"
              @click="handleReject"
            >
              Reject Result
            </v-btn>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <!-- Loading -->
    <v-card v-else-if="store.fetchReviewState.loading">
      <v-card-text class="text-center pa-8">
        <v-progress-circular indeterminate color="primary" />
        <p class="mt-4 text-medium-emphasis">Loading review...</p>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useResultReviewsStore, getReviewStatusColor, getReviewStatusLabel } from '@/stores/resultReviews'
import { useSnackbar } from '@/composables/useSnackbar'
import { formatDateTime } from '@/utils/formatters'

const props = defineProps<{  reviewId: string | null
}>()

const emit = defineEmits<{  decided: []
}>()

const open = defineModel<boolean>({ required: true })

const store = useResultReviewsStore()
const snackbar = useSnackbar()

const decisionNotes = ref('')

const review = computed(() => store.currentReview)

// Mirrors `ResultReviewStatus::is_pending()` (portal-domain result_review.rs:47)
// = PendingAcknowledgment | PendingAdminReview.
//
// This template compared `review.status === 'pending'`, which is NOT a value the
// backend can emit -- the statuses are pending_acknowledgment, pending_admin_review,
// acknowledged, approved, rejected. So the Decision Form was gated on an
// always-false condition and NEVER RENDERED: no admin could approve or reject a
// result review through this modal at all. Found by the compiler once
// ResultReviewStatus became a real union (P-35).
const PENDING_REVIEW_STATUSES = ['pending_acknowledgment', 'pending_admin_review']
const isPending = computed(() => PENDING_REVIEW_STATUSES.includes(review.value?.status ?? ''))


watch(() => props.reviewId, async (id) => {
  if (id && open.value) {
    decisionNotes.value = ''
    try {
      await store.fetchReview(id)
    } catch {
      snackbar.show('Failed to load review', 'error')
    }
  }
})

function close() {
  open.value = false
}

async function handleApprove() {
  if (!props.reviewId) return
  try {
    await store.approveReview(props.reviewId, decisionNotes.value.trim() || undefined)
    snackbar.show('Result approved', 'success')
    emit('decided')
    close()
  } catch {
    snackbar.show('Failed to approve result', 'error')
  }
}

async function handleReject() {
  if (!props.reviewId) return
  try {
    await store.rejectReview(props.reviewId, decisionNotes.value.trim() || undefined)
    snackbar.show('Result rejected', 'success')
    emit('decided')
    close()
  } catch {
    snackbar.show('Failed to reject result', 'error')
  }
}
</script>
