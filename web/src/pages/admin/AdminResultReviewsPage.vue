<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-6">
      <div>
        <h1 class="text-h4">Result Reviews</h1>
        <p class="text-subtitle-1 text-grey">
          Reviews flagged by demo validation requiring admin attention
        </p>
      </div>
      <v-btn
        color="primary"
        variant="tonal"
        prepend-icon="mdi-refresh"
        :loading="store.fetchReviewsState.loading"
        @click="loadReviews"
      >
        Refresh
      </v-btn>
    </div>

    <!-- Data Table -->
    <v-card>
      <v-data-table
        :headers="headers"
        :items="store.reviews"
        :loading="store.fetchReviewsState.loading"
        density="comfortable"
        @click:row="(_: Event, { item }: any) => openDetail(item)"
        hover
      >
        <template v-slot:item.match_id="{ item }">
          <code class="text-caption">{{ item.match_id.slice(0, 8) }}...</code>
        </template>

        <template v-slot:item.mismatches="{ item }">
          <div class="d-flex gap-1">
            <v-chip v-if="item.score_mismatch" size="x-small" color="error" prepend-icon="mdi-counter">
              Score
            </v-chip>
            <v-chip v-if="item.roster_mismatch" size="x-small" color="warning" prepend-icon="mdi-account-group">
              Roster
            </v-chip>
            <v-chip v-if="item.winner_mismatch" size="x-small" color="error" prepend-icon="mdi-trophy">
              Winner
            </v-chip>
            <span v-if="!item.score_mismatch && !item.roster_mismatch && !item.winner_mismatch" class="text-grey text-caption">
              None
            </span>
          </div>
        </template>

        <template v-slot:item.status="{ item }">
          <v-chip :color="getReviewStatusColor(item.status)" size="small">
            {{ getReviewStatusLabel(item.status) }}
          </v-chip>
        </template>

        <template v-slot:item.created_at="{ item }">
          {{ formatDateTime(item.created_at) }}
        </template>

        <template v-slot:item.actions="{ item }">
          <v-btn
            icon
            size="small"
            variant="text"
            @click.stop="openDetail(item)"
          >
            <v-icon>mdi-eye</v-icon>
          </v-btn>
        </template>

        <template v-slot:no-data>
          <div class="text-center pa-8">
            <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-clipboard-check-outline</v-icon>
            <h3 class="text-h6 mb-2">No Pending Reviews</h3>
            <p class="text-grey">All result reviews have been processed.</p>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Detail Modal -->
    <ResultReviewDetailModal
      v-model="detailModalOpen"
      :review-id="selectedReviewId"
      @decided="onDecided"
    />

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useResultReviewsStore, getReviewStatusColor, getReviewStatusLabel } from '@/stores/resultReviews'
import type { ResultReviewSummaryResponse } from '@/stores/resultReviews'
import ResultReviewDetailModal from '@/components/admin/ResultReviewDetailModal.vue'
import { useSnackbar } from '@/composables/useSnackbar'
import { formatDateTime } from '@/utils/formatters'

const store = useResultReviewsStore()
const snackbar = useSnackbar()

const detailModalOpen = ref(false)
const selectedReviewId = ref<string | null>(null)

const headers = [
  { title: 'Match', key: 'match_id', width: '120px' },
  { title: 'Mismatches', key: 'mismatches', sortable: false },
  { title: 'Status', key: 'status', width: '130px' },
  { title: 'Created', key: 'created_at', width: '150px' },
  { title: '', key: 'actions', width: '60px', sortable: false },
]

async function loadReviews() {
  try {
    await store.fetchReviews()
  } catch {
    snackbar.show('Failed to load reviews', 'error')
  }
}

function openDetail(review: ResultReviewSummaryResponse) {
  selectedReviewId.value = review.id
  detailModalOpen.value = true
}

function onDecided() {
  loadReviews()
}

onMounted(() => {
  loadReviews()
})
</script>
