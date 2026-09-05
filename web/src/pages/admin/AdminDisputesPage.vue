<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-6">
      <h1 class="text-h4">Disputes</h1>
    </div>

    <!-- Filters -->
    <v-card class="mb-4">
      <v-card-text>
        <v-row align="center">
          <v-col cols="12" md="3">
            <v-select
          aria-label="Status"
              v-model="filters.status"
              :items="statusOptions"
              label="Status"
              variant="outlined"
              density="compact"
              clearable
              @update:model-value="loadDisputes"
            />
          </v-col>

          <v-col cols="12" md="3">
            <v-select
          aria-label="Priority"
              v-model="filters.priority"
              :items="priorityOptions"
              label="Priority"
              variant="outlined"
              density="compact"
              clearable
              @update:model-value="loadDisputes"
            />
          </v-col>

          <v-col cols="12" md="3">
            <v-text-field
              v-model="filters.match_id"
              label="Match ID"
              variant="outlined"
              density="compact"
              clearable
              @keyup.enter="loadDisputes"
              @click:clear="loadDisputes"
            />
          </v-col>

          <v-col cols="12" md="3">
            <v-btn
              color="primary"
              variant="tonal"
              prepend-icon="mdi-refresh"
              :loading="store.fetchDisputesState.loading"
              block
              @click="loadDisputes"
            >
              Refresh
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Data Table -->
    <v-card>
      <div class="table-scroll">
        <v-data-table
          :headers="headers"
          :items="store.disputes"
          :loading="store.fetchDisputesState.loading"
          :items-per-page="store.pagination.page_size"
          density="comfortable"
          @click:row="(_: Event, { item }: any) => openDetail(item)"
          hover
        >
          <template v-slot:item.match_id="{ item }">
            <div v-if="item.participant1_name || item.participant2_name">
              <router-link
                v-if="item.tournament_slug"
                :to="`/tournaments/${item.tournament_slug}/matches/${item.match_id}`"
                class="text-decoration-none"
                @click.stop
              >
                {{ item.participant1_name ?? 'TBD' }} vs {{ item.participant2_name ?? 'TBD' }}
              </router-link>
              <span v-else>{{ item.participant1_name ?? 'TBD' }} vs {{ item.participant2_name ?? 'TBD' }}</span>
              <div v-if="item.tournament_name" class="text-caption text-medium-emphasis">{{ item.tournament_name }}</div>
            </div>
            <code v-else class="text-caption">{{ item.match_id.slice(0, 8) }}...</code>
          </template>

          <template v-slot:item.status="{ item }">
            <v-chip :color="getDisputeStatusColor(item.status)" size="small">
              {{ getDisputeStatusLabel(item.status) }}
            </v-chip>
          </template>

          <template v-slot:item.priority="{ item }">
            <v-chip :color="getDisputePriorityColor(item.priority)" size="small" variant="outlined">
              {{ getDisputePriorityLabel(item.priority) }}
            </v-chip>
          </template>

          <!--
            P-131: the queue truncated `reason` at 250px as though it were the
            free-text field, but it is the `DisputeReason` enum — so the column
            read `technical_issue`. The free text is `description`, which this
            table does not show.
          -->
          <template v-slot:item.reason="{ item }">
            <v-chip :color="getDisputeReasonColor(item.reason)" size="small" variant="tonal">
              {{ getDisputeReasonLabel(item.reason) }}
            </v-chip>
          </template>

          <template v-slot:item.disputed_by_user_id="{ item }">
            <span v-if="item.disputed_by_name">{{ item.disputed_by_name }}</span>
            <code v-else class="text-caption">{{ item.disputed_by_user_id.slice(0, 8) }}...</code>
          </template>

          <template v-slot:item.created_at="{ item }">
            {{ formatDateTime(item.created_at) }}
          </template>

          <template v-slot:item.actions="{ item }">
            <v-btn aria-label="View dispute"
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
              <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-alert-decagram-outline</v-icon>
              <h3 class="text-h6 mb-2">No Disputes</h3>
              <p class="text-medium-emphasis">No disputes match your current filters.</p>
            </div>
          </template>
        </v-data-table>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="d-flex justify-center pa-4">
        <v-pagination
          v-model="currentPage"
          :length="totalPages"
          @update:model-value="onPageChange"
        />
      </div>
    </v-card>

    <!-- Detail Modal -->
    <DisputeDetailModal
      v-model="detailModalOpen"
      :dispute-id="selectedDisputeId"
      @resolved="onResolved"
    />

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useDisputesStore, getDisputeStatusColor, getDisputeStatusLabel, getDisputePriorityColor, getDisputePriorityLabel, getDisputeReasonColor, getDisputeReasonLabel } from '@/stores/disputes'
import type { DisputeResponse } from '@/stores/disputes'
import DisputeDetailModal from '@/components/admin/DisputeDetailModal.vue'
import { formatDateTime } from '@/utils/formatters'

const store = useDisputesStore()

const detailModalOpen = ref(false)
const selectedDisputeId = ref<string | null>(null)
const currentPage = ref(1)

const filters = ref<{
  status?: string
  priority?: string
  match_id?: string
}>({})

// Values must match the backend DisputeStatus enum exactly — the server
// now rejects unknown status filters with 400 instead of ignoring them.
const statusOptions = [
  { title: 'Pending', value: 'pending' },
  { title: 'Under Review', value: 'under_review' },
  { title: 'Resolved', value: 'resolved' },
  { title: 'Cancelled', value: 'cancelled' },
]

const priorityOptions = [
  { title: 'Low', value: 'low' },
  { title: 'Normal', value: 'normal' },
  { title: 'High', value: 'high' },
  // P-79: the backend enum's top priority is `urgent`; this offered
  // `critical`, which could never match a row.
  { title: 'Urgent', value: 'urgent' },
]

const headers = [
  { title: 'Match', key: 'match_id', width: '260px' },
  { title: 'Status', key: 'status', width: '130px' },
  { title: 'Priority', key: 'priority', width: '110px' },
  { title: 'Reason', key: 'reason' },
  { title: 'Raised By', key: 'disputed_by_user_id', width: '120px' },
  { title: 'Created', key: 'created_at', width: '150px' },
  { title: '', key: 'actions', width: '60px', sortable: false },
]

const totalPages = computed(() => {
  if (store.pagination.total <= 0) return 1
  return Math.ceil(store.pagination.total / store.pagination.page_size)
})

async function loadDisputes() {
  currentPage.value = 1
  await store.fetchDisputes({
    ...filters.value,
    page: 1,
  })
}

function onPageChange(page: number) {
  store.fetchDisputes({
    ...filters.value,
    page,
  })
}

function openDetail(dispute: DisputeResponse) {
  selectedDisputeId.value = dispute.id
  detailModalOpen.value = true
}

function onResolved() {
  loadDisputes()
}

onMounted(() => {
  loadDisputes()
})
</script>

<style scoped>
/* Wide tables scroll within themselves; the page never scrolls sideways. */
.table-scroll {
  overflow-x: auto;
}
</style>
