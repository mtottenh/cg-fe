<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-6">
      <h1 class="text-h4">Bans Management</h1>
      <v-btn
        color="error"
        prepend-icon="mdi-plus"
        @click="createModalOpen = true"
      >
        Create Ban
      </v-btn>
    </div>

    <ErrorAlert :error="error" retryable @clear="clearError" @retry="fetchBans()" />

    <!-- Filters -->
    <v-card class="mb-4">
      <v-card-text>
        <v-row align="center">
          <!-- User Search Filter -->
          <v-col cols="12" md="3">
            <UserSearchAutocomplete
              v-model="selectedUserFilter"
              label="Filter by Player"
              placeholder="Search player..."
              @select="onUserFilterChange"
            />
          </v-col>

          <!-- Ban Type Filter -->
          <v-col cols="12" md="2">
            <v-select
          aria-label="Ban Type"
              v-model="filters.ban_type"
              :items="banTypeOptions"
              label="Ban Type"
              variant="outlined"
              density="compact"
              clearable
              @update:model-value="() => fetchBans()"
            />
          </v-col>

          <!-- Status Filter -->
          <v-col cols="12" md="2">
            <v-select
          aria-label="Status"
              v-model="statusFilter"
              :items="statusOptions"
              label="Status"
              variant="outlined"
              density="compact"
              @update:model-value="onStatusFilterChange"
            />
          </v-col>

          <!-- Refresh Button -->
          <v-col cols="12" md="2">
            <v-btn
              color="primary"
              variant="tonal"
              prepend-icon="mdi-refresh"
              :loading="loading"
              block
              @click="fetchBans"
            >
              Refresh
            </v-btn>
          </v-col>
        </v-row>

        <!-- Active Filters Display -->
        <div v-if="hasActiveFilters" class="mt-3 d-flex align-center flex-wrap ga-2">
          <span class="text-caption text-medium-emphasis mr-2">Active filters:</span>
          <v-chip
            v-if="selectedUserFilter"
            size="small"
            closable
            @click:close="clearUserFilter"
          >
            User: {{ selectedUserFilter.display_name }}
          </v-chip>
          <v-chip
            v-if="filters.ban_type"
            size="small"
            closable
            @click:close="filters.ban_type = undefined; fetchBans()"
          >
            Type: {{ formatBanType(filters.ban_type) }}
          </v-chip>
          <v-chip
            v-if="statusFilter !== 'all'"
            size="small"
            closable
            @click:close="statusFilter = 'all'; onStatusFilterChange()"
          >
            Status: {{ statusFilter }}
          </v-chip>
          <v-btn
            variant="text"
            size="x-small"
            color="error"
            @click="clearAllFilters"
          >
            Clear all
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- Loading State -->
    <v-card v-if="loading && bans.length === 0" class="pa-8 text-center">
      <v-progress-circular indeterminate color="primary" size="48" />
      <p class="text-medium-emphasis mt-4">Loading bans...</p>
    </v-card>

    <!-- Bans Table -->
    <v-card v-else>
      <v-overlay
        :model-value="loading && bans.length > 0"
        contained
        class="align-center justify-center"
        scrim="rgba(0,0,0,0.3)"
      >
        <v-progress-circular indeterminate color="primary" />
      </v-overlay>

      <div class="table-scroll">
        <v-data-table
          :headers="headers"
          :items="bans"
          :items-per-page="pagination.per_page"
          class="elevation-0"
        >
          <!--
            P-123: this column used to render `item.user_id.substring(0, 8)`.
            No surface in the product shows a user's UUID, and UUID v7 prefixes
            are timestamps — two bans created minutes apart share theirs — so
            the column identified nobody and did it ambiguously. It now leads
            with the display name (the name `UserSearchAutocomplete` showed the
            admin who issued the ban) and carries the username beneath.
          -->
          <template v-slot:item.username="{ item }">
            <div data-testid="ban-user">
              <div class="font-weight-medium">{{ item.display_name || item.username }}</div>
              <div v-if="item.display_name" class="text-caption text-medium-emphasis">
                {{ item.username }}
              </div>
            </div>
          </template>

          <template v-slot:item.ban_type="{ item }">
            <v-chip
              :color="getBanTypeColor(item.ban_type)"
              size="small"
              variant="flat"
            >
              <v-icon start size="small">{{ getBanTypeIcon(item.ban_type) }}</v-icon>
              {{ formatBanType(item.ban_type) }}
            </v-chip>
          </template>

          <template v-slot:item.reason="{ item }">
            <div class="text-truncate" style="max-width: 200px" :title="item.reason">
              {{ item.reason }}
            </div>
          </template>

          <template v-slot:item.status="{ item }">
            <v-chip
              :color="getStatusColor(item)"
              size="small"
              variant="tonal"
            >
              {{ getStatusText(item) }}
            </v-chip>
          </template>

          <template v-slot:item.duration="{ item }">
            <span v-if="item.is_permanent" class="font-weight-medium text-error">Permanent</span>
            <span v-else-if="item.ends_at">{{ formatRelativeTime(item.ends_at) }}</span>
            <span v-else class="text-medium-emphasis">-</span>
          </template>

          <template v-slot:item.starts_at="{ item }">
            <div class="text-caption">{{ formatDate(item.starts_at) }}</div>
          </template>

          <template v-slot:item.actions="{ item }">
            <v-btn aria-label="View ban details"
              icon
              size="small"
              variant="text"
              @click="viewBanDetail(item)"
              title="View Details"
            >
              <v-icon>mdi-eye</v-icon>
            </v-btn>
            <v-btn aria-label="Lift ban"
              v-if="item.is_active"
              icon
              size="small"
              variant="text"
              color="success"
              @click="confirmLiftBan(item)"
              title="Lift Ban"
            >
              <v-icon>mdi-hand-back-right</v-icon>
            </v-btn>
          </template>

          <template v-slot:no-data>
            <div class="text-center pa-8">
              <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-gavel</v-icon>
              <p class="text-medium-emphasis">
                {{ hasActiveFilters ? 'No bans found matching your filters' : 'No bans recorded yet' }}
              </p>
              <v-btn
                v-if="hasActiveFilters"
                variant="text"
                color="primary"
                class="mt-2"
                @click="clearAllFilters"
              >
                Clear filters
              </v-btn>
            </div>
          </template>

          <template v-slot:bottom>
            <div class="d-flex justify-center pa-4">
              <v-pagination
                v-model="currentPage"
                :length="pagination.total_pages"
                :total-visible="7"
                @update:model-value="goToPage"
              />
            </div>
            <div class="text-center text-caption text-medium-emphasis pb-2">
              Showing {{ bans.length }} of {{ pagination.total_items }} bans
            </div>
          </template>
        </v-data-table>
      </div>
    </v-card>

    <!-- Quick Lift Dialog -->
    <ConfirmDialogHost :dialog="confirmDialog" />

    <!-- Modals -->
    <BanCreateModal
      v-model="createModalOpen"
      @created="onBanCreated"
    />

    <BanDetailModal
      v-model="detailModalOpen"
      :ban-id="selectedBanId"
      @updated="onBanUpdated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useBansStore, type BanResponse, type BanFilters } from '@/stores/bans'
import UserSearchAutocomplete from '@/components/admin/UserSearchAutocomplete.vue'
import BanCreateModal from '@/components/admin/BanCreateModal.vue'
import BanDetailModal from '@/components/admin/BanDetailModal.vue'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import { formatDate } from '@/utils/formatters'
import { banTypeMap, banStatusMap, getStatusColor as mapStatusColor, getStatusLabel, getStatusIcon } from '@/utils/statusMaps'
import type { components } from '@/api/types'

type PlayerSummary = components['schemas']['PlayerSearchResponse']

const bansStore = useBansStore()
const { bans, pagination, loading, error } = storeToRefs(bansStore)

// State
const currentPage = ref(1)
const selectedUserFilter = ref<PlayerSummary | null>(null)
const statusFilter = ref<'all' | 'active' | 'lifted' | 'expired'>('all')
const filters = ref<BanFilters>({
  page: 1,
  per_page: 20,
})

// Modal state
const createModalOpen = ref(false)
const detailModalOpen = ref(false)
const selectedBanId = ref<string | null>(null)

// Snackbar
const snackbar = useSnackbar()
const confirmDialog = useConfirmDialog()

const hasActiveFilters = computed(() => {
  return !!selectedUserFilter.value || !!filters.value.ban_type || statusFilter.value !== 'all'
})

// Options
const banTypeOptions = [
  { title: 'Platform', value: 'platform' },
  { title: 'Matchmaking', value: 'matchmaking' },
  { title: 'Chat', value: 'chat' },
  { title: 'League', value: 'league' },
  { title: 'Tournament', value: 'tournament' },
]

const statusOptions = [
  { title: 'All', value: 'all' },
  { title: 'Active', value: 'active' },
  { title: 'Lifted', value: 'lifted' },
  { title: 'Expired', value: 'expired' },
]

// Table headers
const headers = [
  { title: 'User', key: 'username', width: '180px' },
  { title: 'Type', key: 'ban_type', width: '130px' },
  { title: 'Reason', key: 'reason' },
  { title: 'Status', key: 'status', width: '100px' },
  { title: 'Duration', key: 'duration', width: '120px' },
  { title: 'Created', key: 'starts_at', width: '120px' },
  { title: 'Actions', key: 'actions', width: '100px', sortable: false, align: 'center' as const },
]

// Methods
async function fetchBans(page = 1) {
  const queryFilters: BanFilters = {
    ...filters.value,
    page,
    per_page: pagination.value.per_page || 20,
  }

  // Apply status filter
  if (statusFilter.value === 'active') {
    queryFilters.active_only = true
  }

  try {
    await bansStore.fetchBans(queryFilters)
    currentPage.value = page
  } catch {
    // Error handled in store
  }
}

function goToPage(page: number) {
  fetchBans(page)
}

function onUserFilterChange(player: PlayerSummary | null) {
  filters.value.user_id = player?.id
  fetchBans()
}

function onStatusFilterChange() {
  filters.value.active_only = statusFilter.value === 'active' ? true : undefined
  fetchBans()
}

function clearUserFilter() {
  selectedUserFilter.value = null
  filters.value.user_id = undefined
  fetchBans()
}

function clearAllFilters() {
  selectedUserFilter.value = null
  statusFilter.value = 'all'
  filters.value = {
    page: 1,
    per_page: 20,
  }
  fetchBans()
}

function clearError() {
  bansStore.clearError()
}

function viewBanDetail(ban: BanResponse) {
  selectedBanId.value = ban.id
  detailModalOpen.value = true
}

/**
 * How a ban's subject is named to a human.
 *
 * P-123: the confirm dialog below asked an operator to approve a destructive
 * moderation action against `019f993f...` — eight characters of a UUID v7,
 * whose leading digits are a timestamp, so two bans created minutes apart are
 * genuinely indistinguishable rather than merely cryptic. Both names are shown
 * because either alone is defeatable: display names are not unique, and the
 * username is the identifier an operator can act on elsewhere.
 */
function banSubject(ban: BanResponse): string {
  return ban.display_name ? `${ban.display_name} (@${ban.username})` : `@${ban.username}`
}

function confirmLiftBan(ban: BanResponse) {
  confirmDialog.confirm({
    title: 'Lift Ban',
    message: `Are you sure you want to lift this ${formatBanType(ban.ban_type)} ban for ${banSubject(ban)}?`,
    action: 'Lift Ban',
    color: 'success',
    handler: async () => {
      await bansStore.liftBan(ban.id)
      snackbar.show('Ban lifted successfully', 'success')
      fetchBans(currentPage.value)
    },
  })
}

function onBanCreated() {
  snackbar.show('Ban created successfully', 'success')
  fetchBans()
}

function onBanUpdated() {
  snackbar.show('Ban updated successfully', 'success')
  fetchBans(currentPage.value)
}


// Formatters
const formatBanType = (type: string) => getStatusLabel(banTypeMap, type)
const getBanTypeColor = (type: string) => mapStatusColor(banTypeMap, type)
const getBanTypeIcon = (type: string) => getStatusIcon(banTypeMap, type)

function getBanStatusKey(ban: BanResponse): string {
  if (ban.lifted_at) return 'lifted'
  if (!ban.is_active && ban.ends_at) return 'expired'
  if (ban.is_active) return 'active'
  return 'unknown'
}

function getStatusText(ban: BanResponse): string {
  const key = getBanStatusKey(ban)
  return key === 'unknown' ? 'Unknown' : getStatusLabel(banStatusMap, key)
}

const getStatusColor = (ban: BanResponse) => mapStatusColor(banStatusMap, getBanStatusKey(ban))

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    const diffHours = Math.round(diffMs / (1000 * 60 * 60))
    if (Math.abs(diffHours) < 1) {
      return 'Soon'
    }
    return diffHours > 0 ? `${diffHours}h left` : `${Math.abs(diffHours)}h ago`
  }

  return diffDays > 0 ? `${diffDays}d left` : `${Math.abs(diffDays)}d ago`
}

onMounted(() => {
  fetchBans()
})
</script>

<style scoped>
/* Wide tables scroll within themselves; the page never scrolls sideways. */
.table-scroll {
  overflow-x: auto;
}
</style>
