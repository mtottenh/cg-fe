<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-6">
      <div>
        <h1 class="text-h4">Result Reviews</h1>
        <p class="text-subtitle-1 text-medium-emphasis">
          Reviews flagged by demo validation requiring admin attention
        </p>
        <p class="text-caption text-medium-emphasis" data-testid="review-queue-count">
          {{ store.total }} pending · {{ store.sort === 'oldest' ? 'oldest first' : 'newest first' }}
          · page {{ store.page }} of {{ store.totalPages }}
        </p>
      </div>
      <div class="d-flex align-center ga-2">
        <!-- P-129: SERVER-side sort — the queue is paginated, so only the
             server can put its far end on page 1. This is why the table's
             own column sorting stays disabled. -->
        <v-btn-toggle
          :model-value="store.sort"
          density="comfortable"
          variant="outlined"
          mandatory
          @update:model-value="setSort"
        >
          <v-btn value="newest" size="small" aria-label="Sort newest first">Newest</v-btn>
          <v-btn value="oldest" size="small" aria-label="Sort oldest first">Oldest</v-btn>
        </v-btn-toggle>
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
    </div>

    <!-- Data Table -->
    <v-card>
      <div class="table-scroll">
        <v-data-table
          :headers="headers"
          :items="store.reviews"
          :loading="store.fetchReviewsState.loading"
          :items-per-page="-1"
          hide-default-footer
          :row-props="rowProps"
          density="comfortable"
          @click:row="(_: Event, { item }: any) => openDetail(item)"
          hover
        >
          <template v-slot:item.match_id="{ item }">
            <code class="text-caption">{{ item.match_id.slice(0, 8) }}...</code>
          </template>

          <template v-slot:item.mismatches="{ item }">
            <div class="d-flex ga-1">
              <v-chip v-if="item.score_mismatch" size="x-small" color="error" prepend-icon="mdi-counter">
                Score
              </v-chip>
              <v-chip v-if="item.roster_mismatch" size="x-small" color="warning" prepend-icon="mdi-account-group">
                Roster
              </v-chip>
              <v-chip v-if="item.winner_mismatch" size="x-small" color="error" prepend-icon="mdi-trophy">
                Winner
              </v-chip>
              <span v-if="!item.score_mismatch && !item.roster_mismatch && !item.winner_mismatch" class="text-medium-emphasis text-caption">
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
            <v-btn aria-label="View review"
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
              <p class="text-medium-emphasis">All result reviews have been processed.</p>
            </div>
          </template>
        </v-data-table>
      </div>
    </v-card>

    <!--
      Server-side pager. Before it existed the page showed exactly one page of
      an ordered queue and no way off it (P-43) — which, while the order was
      `created_at ASC`, meant the twenty OLDEST reviews were the only ones an
      admin could ever see. P-55 flipped the order to newest-first; the pager
      is what makes the other end reachable rather than merely re-burying it.
    -->
    <div v-if="store.totalPages > 1" class="d-flex justify-center mt-6">
      <v-pagination
        v-model="page"
        :length="store.totalPages"
        :total-visible="7"
        rounded
      />
    </div>

    <!-- Detail Modal -->
    <ResultReviewDetailModal
      v-model="detailModalOpen"
      :review-id="selectedReviewId"
      @decided="onDecided"
    />

  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useResultReviewsStore, getReviewStatusColor, getReviewStatusLabel } from '@/stores/resultReviews'
import type { ResultReviewSummaryResponse } from '@/stores/resultReviews'
import ResultReviewDetailModal from '@/components/admin/ResultReviewDetailModal.vue'
import { useSnackbar } from '@/composables/useSnackbar'
import { formatDateTime } from '@/utils/formatters'

const store = useResultReviewsStore()
const snackbar = useSnackbar()

const detailModalOpen = ref(false)
const selectedReviewId = ref<string | null>(null)

/**
 * `sortable: false` on EVERY column, deliberately.
 *
 * The queue is ordered and paginated SERVER-side — newest first since P-55
 * (`portal-db/src/adapters/result_review.rs`). `v-data-table`'s built-in sort
 * only reorders the rows it currently holds, i.e. one page out of
 * `store.totalPages`, so a click on "Created" would silently present a
 * 20-row local sort as if it were the queue's order. Until a server-side sort
 * parameter exists, the only honest presentation is the server's order.
 */
const headers = [
  { title: 'Match', key: 'match_id', width: '120px', sortable: false },
  { title: 'Mismatches', key: 'mismatches', sortable: false },
  { title: 'Status', key: 'status', width: '130px', sortable: false },
  { title: 'Created (newest first)', key: 'created_at', width: '190px', sortable: false },
  { title: '', key: 'actions', width: '60px', sortable: false },
]

const page = ref(1)

/**
 * The Match column prints `match_id.slice(0, 8)`, and those ids are UUID v7 —
 * the first eight characters are a TIMESTAMP, so two matches created seconds
 * apart share them. Anything identifying a row by that prefix (tests included)
 * can match the wrong row. Carry the full ids as attributes instead.
 */
function rowProps({ item }: { item: ResultReviewSummaryResponse }) {
  return { 'data-match-id': item.match_id, 'data-review-id': item.id }
}

async function loadReviews() {
  try {
    await store.fetchReviews({ page: page.value })
    // Approving/rejecting the last row of the last page shrinks the queue; step
    // back rather than leaving the admin on an empty page they cannot leave.
    if (page.value > store.totalPages) {
      page.value = store.totalPages
    }
  } catch {
    snackbar.show('Failed to load reviews', 'error')
  }
}

/**
 * P-129: flipping the sort restarts at page 1 — page N of one order is a
 * different slice of the queue in the other, so keeping the page number
 * would show an arbitrary window and call it a sort.
 */
async function setSort(value: 'newest' | 'oldest') {
  if (value === store.sort) return
  page.value = 1
  try {
    await store.fetchReviews({ page: 1, sort: value })
  } catch {
    snackbar.show('Failed to load reviews', 'error')
  }
}

watch(page, () => {
  loadReviews()
})

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

<style scoped>
/* Wide tables scroll within themselves; the page never scrolls sideways. */
.table-scroll {
  overflow-x: auto;
}
</style>
