<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-6">
      <h1 class="text-h4">Demo Management</h1>
      <div class="d-flex align-center ga-4">
        <v-switch
          v-if="autoLinkEnabled !== null"
          :model-value="autoLinkEnabled"
          color="primary"
          density="compact"
          hide-details
          :disabled="autoLinkToggleLoading"
          data-testid="auto-link-toggle"
          @update:model-value="onToggleAutoLink"
        >
          <template #label>
            <span class="text-body-2">
              Auto-link demos
              <v-tooltip activator="parent" location="bottom" max-width="320">
                When enabled, demos are automatically linked to tournament
                matches by Steam-ID overlap when their stats arrive. Turn off
                if auto-linking is misbehaving — demos then only link via
                evidence uploads or manual linking.
              </v-tooltip>
            </span>
          </template>
        </v-switch>
        <v-btn
          color="primary"
          prepend-icon="mdi-plus"
          @click="catalogModalOpen = true"
        >
          Catalog Demo
        </v-btn>
      </div>
    </div>

    <!-- Pipeline Status Cards -->
    <v-row v-if="statusCounts" class="mb-4">
      <v-col v-for="s in pipelineStats" :key="s.label" cols="6" md>
        <v-card variant="outlined">
          <v-card-text class="text-center pa-3">
            <v-icon :color="s.color" size="24" class="mb-1">{{ s.icon }}</v-icon>
            <div class="text-h5 font-weight-bold">{{ s.count }}</div>
            <div class="text-caption text-grey">{{ s.label }}</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Filters -->
    <v-card class="mb-4">
      <v-card-text>
        <v-row align="center">
          <v-col cols="12" md="2">
            <v-select
              v-model="filters.status"
              :items="statusOptions"
              label="Status"
              variant="outlined"
              density="compact"
              clearable
              @update:model-value="() => loadDemos()"
            />
          </v-col>
          <v-col cols="12" md="2">
            <v-select
              v-model="filters.category"
              :items="categoryOptions"
              label="Category"
              variant="outlined"
              density="compact"
              clearable
              @update:model-value="() => loadDemos()"
            />
          </v-col>
          <v-col cols="12" md="2">
            <v-select
              v-model="filters.game_id"
              :items="gameOptions"
              label="Game"
              variant="outlined"
              density="compact"
              clearable
              @update:model-value="() => loadDemos()"
            />
          </v-col>
          <v-col cols="12" md="2">
            <v-text-field
              v-model="mapSearch"
              label="Map"
              variant="outlined"
              density="compact"
              placeholder="e.g. de_dust2"
              clearable
              @click:clear="mapSearch = ''; loadDemos()"
            />
          </v-col>
          <v-col cols="12" md="2">
            <v-text-field
              v-model="teamSearch"
              label="Team"
              variant="outlined"
              density="compact"
              placeholder="Team name"
              clearable
              @click:clear="teamSearch = ''; loadDemos()"
            />
          </v-col>
          <v-col cols="12" md="2">
            <v-btn
              color="primary"
              variant="tonal"
              prepend-icon="mdi-refresh"
              :loading="loading"
              block
              @click="loadDemos"
            >
              Refresh
            </v-btn>
          </v-col>
        </v-row>

        <!-- Active Filters -->
        <div v-if="hasActiveFilters" class="mt-3 d-flex align-center flex-wrap ga-2">
          <span class="text-caption text-grey mr-2">Active filters:</span>
          <v-chip v-if="filters.status" size="small" closable @click:close="filters.status = undefined; loadDemos()">
            Status: {{ getStatusLabel(demoStatusMap, filters.status) }}
          </v-chip>
          <v-chip v-if="filters.category" size="small" closable @click:close="filters.category = undefined; loadDemos()">
            Category: {{ getStatusLabel(demoCategoryMap, filters.category) }}
          </v-chip>
          <v-chip v-if="filters.game_id" size="small" closable @click:close="filters.game_id = undefined; loadDemos()">
            Game: {{ gameOptions.find(g => g.value === filters.game_id)?.title ?? filters.game_id }}
          </v-chip>
          <v-chip v-if="filters.map_name" size="small" closable @click:close="filters.map_name = undefined; mapSearch = ''; loadDemos()">
            Map: {{ filters.map_name }}
          </v-chip>
          <v-chip v-if="filters.team_name" size="small" closable @click:close="filters.team_name = undefined; teamSearch = ''; loadDemos()">
            Team: {{ filters.team_name }}
          </v-chip>
          <v-btn variant="text" size="x-small" color="error" @click="clearAllFilters">Clear all</v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- Bulk Actions -->
    <v-card v-if="selectedRows.length > 0" class="mb-4">
      <v-card-text class="d-flex align-center ga-3">
        <span class="text-body-2 font-weight-medium">{{ selectedRows.length }} selected</span>
        <v-btn
          color="error"
          variant="flat"
          size="small"
          prepend-icon="mdi-delete"
          :loading="bulkDeleteLoading"
          @click="confirmBulkDelete"
        >
          Delete Selected
        </v-btn>
        <v-btn variant="text" size="small" @click="selectedRows = []">Clear Selection</v-btn>
      </v-card-text>
    </v-card>

    <!-- Loading State -->
    <v-card v-if="loading && demos.length === 0" class="pa-8 text-center">
      <v-progress-circular indeterminate color="primary" size="48" />
      <p class="text-grey mt-4">Loading demos...</p>
    </v-card>

    <!-- Demos Table -->
    <v-card v-else>
      <v-overlay
        :model-value="loading && demos.length > 0"
        contained
        class="align-center justify-center"
        scrim="rgba(0,0,0,0.3)"
      >
        <v-progress-circular indeterminate color="primary" />
      </v-overlay>

      <v-data-table
        v-model="selectedRows"
        :headers="headers"
        :items="demos"
        :items-per-page="pageSize"
        item-value="id"
        show-select
        class="elevation-0"
      >
        <template v-slot:item.file_name="{ item }">
          <div class="d-flex align-center">
            <v-icon size="small" class="mr-2" color="grey">mdi-file-video</v-icon>
            <router-link
              :to="{ name: 'admin-demo-detail', params: { id: item.id } }"
              class="text-primary text-decoration-none font-weight-medium"
            >
              {{ truncateFilename(item.file_name) }}
            </router-link>
            <v-icon v-if="item.is_hidden" size="x-small" color="grey" class="ml-1" title="Hidden">mdi-eye-off</v-icon>
          </div>
        </template>

        <template v-slot:item.status="{ item }">
          <v-chip
            :color="getStatusColor(demoStatusMap, item.status)"
            size="small"
            variant="flat"
          >
            <v-icon start size="14">{{ getStatusIcon(demoStatusMap, item.status) }}</v-icon>
            {{ getStatusLabel(demoStatusMap, item.status) }}
          </v-chip>
        </template>

        <template v-slot:item.category="{ item }">
          <v-chip
            :color="getStatusColor(demoCategoryMap, item.category)"
            size="small"
            variant="tonal"
          >
            {{ getStatusLabel(demoCategoryMap, item.category) }}
          </v-chip>
        </template>

        <template v-slot:item.metadata="{ item }">
          <template v-if="item.metadata">
            <div class="text-body-2">{{ item.metadata.map_name }}</div>
            <div class="text-caption text-grey">
              {{ item.metadata.team1_name }} {{ item.metadata.team1_score }}-{{ item.metadata.team2_score }} {{ item.metadata.team2_name }}
            </div>
          </template>
          <span v-else class="text-grey text-caption">—</span>
        </template>

        <template v-slot:item.file_size_bytes="{ item }">
          <span class="text-caption">{{ formatFileSize(item.file_size_bytes) }}</span>
        </template>

        <template v-slot:item.discovered_at="{ item }">
          <span class="text-caption">{{ formatRelativeTime(item.discovered_at) }}</span>
        </template>

        <template v-slot:item.actions="{ item }">
          <v-btn
            icon
            variant="text"
            size="small"
            :to="{ name: 'admin-demo-detail', params: { id: item.id } }"
          >
            <v-icon size="18">mdi-eye</v-icon>
          </v-btn>
          <v-btn
            icon
            variant="text"
            size="small"
            color="error"
            @click="confirmDelete(item)"
          >
            <v-icon size="18">mdi-delete</v-icon>
          </v-btn>
        </template>

        <template v-slot:no-data>
          <div class="text-center pa-8">
            <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-file-video-outline</v-icon>
            <p class="text-grey">
              {{ hasActiveFilters ? 'No demos found matching your filters' : 'No demos cataloged yet' }}
            </p>
            <v-btn v-if="hasActiveFilters" variant="text" color="primary" class="mt-2" @click="clearAllFilters">
              Clear filters
            </v-btn>
          </div>
        </template>

        <template v-slot:bottom>
          <div class="d-flex justify-center pa-4">
            <v-pagination
              v-model="currentPage"
              :length="totalPages"
              :total-visible="7"
              @update:model-value="goToPage"
            />
          </div>
          <div class="text-center text-caption text-grey pb-2">
            Showing {{ demos.length }} of {{ total }} demos
          </div>
        </template>
      </v-data-table>
    </v-card>

    <v-alert v-if="error" type="error" class="mt-4" closable @click:close="demosStore.error = null">
      {{ error }}
    </v-alert>

    <!-- Confirm Delete Dialog -->
    <ConfirmDialog
      :open="confirmDialog.state.open"
      :title="confirmDialog.state.title"
      :message="confirmDialog.state.message"
      :action-label="confirmDialog.state.actionLabel"
      :color="confirmDialog.state.color"
      :loading="confirmDialog.state.loading"
      @confirm="confirmDialog.execute"
      @cancel="confirmDialog.cancel"
    />

    <!-- Catalog Modal -->
    <DemoCatalogModal v-model="catalogModalOpen" @cataloged="onDemoCataloged" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { watchDebounced } from '@vueuse/core'
import { useDemosStore, type DemoResponse, type DemoFilters } from '@/stores/demos'
import { useGamesStore } from '@/stores/games'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { formatRelativeTime, formatFileSize } from '@/utils/formatters'
import { demoStatusMap, demoCategoryMap, getStatusColor, getStatusLabel, getStatusIcon } from '@/utils/statusMaps'
import DemoCatalogModal from '@/components/admin/DemoCatalogModal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const demosStore = useDemosStore()
const { demos, total, loading, error, statusCounts, autoLinkEnabled } = storeToRefs(demosStore)
const gamesStore = useGamesStore()
const snackbar = useSnackbar()
const confirmDialog = useConfirmDialog()

// State
const currentPage = ref(1)
const pageSize = 20
const mapSearch = ref('')
const teamSearch = ref('')
const catalogModalOpen = ref(false)
const selectedRows = ref<string[]>([])
const bulkDeleteLoading = ref(false)
const filters = ref<DemoFilters>({
  include_hidden: true,
})

const totalPages = computed(() => Math.ceil(total.value / pageSize))

const pipelineStats = computed(() => {
  if (!statusCounts.value) return []
  const sc = statusCounts.value
  return [
    { label: 'Pending', count: sc.pending, color: 'warning', icon: 'mdi-clock-outline' },
    { label: 'Processing', count: sc.processing, color: 'info', icon: 'mdi-cog-sync' },
    { label: 'Ready', count: sc.ready, color: 'success', icon: 'mdi-check-circle' },
    { label: 'Failed', count: sc.failed, color: 'error', icon: 'mdi-alert-circle' },
    { label: 'Archived', count: sc.archived, color: 'grey', icon: 'mdi-archive' },
  ]
})

const hasActiveFilters = computed(() => {
  return !!(filters.value.status || filters.value.category || filters.value.game_id
    || filters.value.map_name || filters.value.team_name)
})

const gameOptions = computed(() =>
  gamesStore.games.map(g => ({ title: g.display_name, value: g.id }))
)

const statusOptions = [
  { title: 'Pending', value: 'pending' },
  { title: 'Processing', value: 'processing' },
  { title: 'Ready', value: 'ready' },
  { title: 'Failed', value: 'failed' },
  { title: 'Archived', value: 'archived' },
]

const categoryOptions = [
  { title: 'Uncategorized', value: 'uncategorized' },
  { title: 'PUG', value: 'pug' },
  { title: 'League', value: 'league' },
  { title: 'Scrim', value: 'scrim' },
  { title: 'Ignored', value: 'ignored' },
]

const headers = [
  { title: 'File Name', key: 'file_name', sortable: false },
  { title: 'Status', key: 'status', sortable: false, width: '120px' },
  { title: 'Category', key: 'category', sortable: false, width: '120px' },
  { title: 'Match Info', key: 'metadata', sortable: false },
  { title: 'Size', key: 'file_size_bytes', sortable: false, width: '100px' },
  { title: 'Discovered', key: 'discovered_at', sortable: false, width: '120px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '100px', align: 'end' as const },
]

// Debounced search inputs
watchDebounced(mapSearch, (val) => {
  filters.value.map_name = val || undefined
  loadDemos()
}, { debounce: 400 })

watchDebounced(teamSearch, (val) => {
  filters.value.team_name = val || undefined
  loadDemos()
}, { debounce: 400 })

// Methods
async function loadDemos() {
  currentPage.value = 1
  await demosStore.fetchDemos({
    ...filters.value,
    limit: pageSize,
    offset: 0,
  })
}

async function goToPage(page: number) {
  currentPage.value = page
  selectedRows.value = []
  await demosStore.fetchDemos({
    ...filters.value,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })
}

function clearAllFilters() {
  filters.value = { include_hidden: true }
  mapSearch.value = ''
  teamSearch.value = ''
  loadDemos()
}

function confirmDelete(demo: DemoResponse) {
  confirmDialog.confirm({
    title: 'Delete Demo',
    message: `Delete ${demo.file_name}? This cannot be undone.`,
    action: 'Delete',
    color: 'error',
    handler: async () => {
      try {
        await demosStore.deleteDemo(demo.id)
        snackbar.success('Demo deleted')
      } catch {
        snackbar.error('Failed to delete demo')
      }
    },
  })
}

function confirmBulkDelete() {
  const count = selectedRows.value.length
  confirmDialog.confirm({
    title: 'Delete Selected Demos',
    message: `Delete ${count} demo${count === 1 ? '' : 's'}? This cannot be undone.`,
    action: 'Delete',
    color: 'error',
    handler: async () => {
      bulkDeleteLoading.value = true
      try {
        await Promise.all(selectedRows.value.map(id => demosStore.deleteDemo(id)))
        snackbar.success(`${count} demo${count === 1 ? '' : 's'} deleted`)
        selectedRows.value = []
        demosStore.fetchStatusCounts()
      } catch {
        snackbar.error('Failed to delete some demos')
      } finally {
        bulkDeleteLoading.value = false
      }
    },
  })
}

function onDemoCataloged() {
  snackbar.success('Demo cataloged successfully')
  loadDemos()
  demosStore.fetchStatusCounts()
}

function truncateFilename(name: string): string {
  return name.length > 40 ? name.slice(0, 37) + '...' : name
}

// Polling for pipeline status counts
let pollInterval: ReturnType<typeof setInterval> | null = null

const autoLinkToggleLoading = computed(() => demosStore.updateAutoLinkSettingState.loading)

async function onToggleAutoLink(value: boolean | null) {
  const enabled = value === true
  try {
    await demosStore.updateAutoLinkSetting(enabled)
    snackbar.success(enabled ? 'Auto-linking enabled' : 'Auto-linking disabled')
  } catch {
    snackbar.error(demosStore.updateAutoLinkSettingState.error ?? 'Failed to update auto-link setting')
  }
}

onMounted(async () => {
  await Promise.all([
    loadDemos(),
    demosStore.fetchStatusCounts(),
    demosStore.fetchAutoLinkSetting().catch(() => {
      // Non-admins (or transient errors) simply don't see the toggle.
    }),
    gamesStore.games.length === 0 ? gamesStore.fetchGames() : Promise.resolve(),
  ])
  pollInterval = setInterval(() => demosStore.fetchStatusCounts(), 30_000)
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
})
</script>
