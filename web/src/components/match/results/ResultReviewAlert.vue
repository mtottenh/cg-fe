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
          <span v-if="review.review_type"> Reason: <strong>{{ review.review_type }}</strong></span>
        </p>
      </div>
      <v-btn
        v-if="canAcknowledge"
        color="warning"
        variant="flat"
        size="small"
        :loading="reviewsStore.acknowledgeResultReviewState.loading.value"
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
import { useResultReviewsStore } from '@/stores/resultReviews'

const props = defineProps<{
  matchId: string
  userRegistrationId?: string | null
}>()

const reviewsStore = useResultReviewsStore()

const review = computed(() => reviewsStore.matchResultReview)

const hasAcknowledged = computed(() => {
  if (!review.value || !props.userRegistrationId) return false
  // Check if the current user's registration has acknowledged
  const r = review.value as Record<string, unknown>
  return r.captain1_acknowledged === true || r.captain2_acknowledged === true
})

const canAcknowledge = computed(() => {
  return !!review.value && !!props.userRegistrationId && !hasAcknowledged.value
})

async function handleAcknowledge() {
  try {
    await reviewsStore.acknowledgeResultReview(props.matchId)
  } catch {
    // Error in store
  }
}
</script>
