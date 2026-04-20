<template>
  <v-alert
    v-if="review"
    type="warning"
    variant="tonal"
    prominent
    class="mb-6"
  >
    <template v-slot:prepend>
      <v-icon>mdi-eye-check</v-icon>
    </template>
    <div class="d-flex align-center justify-space-between">
      <div>
        <div class="text-subtitle-2 font-weight-bold">Result Under Review</div>
        <p class="text-body-2 mb-0">
          An admin has flagged this match result for review.
          <span v-if="reviewReason"> Reason: <strong>{{ reviewReason }}</strong></span>
        </p>
      </div>
      <v-btn
        v-if="canAcknowledge"
        color="warning"
        variant="flat"
        size="small"
        :loading="reviewsStore.acknowledgeResultReviewState.loading"
        @click="handleAcknowledge"
      >
        Acknowledge
      </v-btn>
      <v-chip v-else-if="hasAcknowledged" color="success" size="small" variant="tonal">
        Acknowledged
      </v-chip>
    </div>
  </v-alert>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useResultReviewsStore } from '@/stores/resultReviews'

const props = defineProps<{
  matchId: string
  userRegistrationId?: string | null
}>()

const reviewsStore = useResultReviewsStore()

const { matchResultReview: review } = storeToRefs(reviewsStore)

/** Human-readable reason derived from the review's mismatch flags. */
const reviewReason = computed(() => {
  if (!review.value) return ''
  const reasons: string[] = []
  if (review.value.roster_mismatch) reasons.push('roster mismatch')
  if (review.value.score_mismatch) reasons.push('score mismatch')
  if (review.value.winner_mismatch) reasons.push('winner mismatch')
  return reasons.join(', ')
})

const hasAcknowledged = computed(() => {
  if (!review.value || !props.userRegistrationId) return false
  // A user has acknowledged if their specific captain slot is marked as such.
  if (review.value.captain1_registration_id === props.userRegistrationId) {
    return review.value.captain1_acknowledged
  }
  if (review.value.captain2_registration_id === props.userRegistrationId) {
    return review.value.captain2_acknowledged
  }
  return false
})

const canAcknowledge = computed(() => {
  return !!review.value && !!props.userRegistrationId && !hasAcknowledged.value
})

async function handleAcknowledge() {
  if (!props.userRegistrationId) return
  try {
    await reviewsStore.acknowledgeResultReview(props.matchId, props.userRegistrationId)
  } catch {
    // Error in store
  }
}
</script>
