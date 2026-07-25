<template>
  <div>
    <!-- Header -->
    <div class="d-flex align-center mb-6">
      <v-btn aria-label="Back to demos" icon variant="text" @click="router.push({ name: 'admin-demos' })" class="mr-2">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <div class="flex-grow-1">
        <h1 class="text-h4">{{ currentDemo?.file_name ?? 'Demo Detail' }}</h1>
        <div v-if="currentDemo" class="d-flex align-center ga-2 mt-1">
          <v-chip
            :color="getStatusColor(demoStatusMap, currentDemo.status)"
            size="small"
            variant="flat"
          >
            <v-icon start size="14">{{ getStatusIcon(demoStatusMap, currentDemo.status) }}</v-icon>
            {{ getStatusLabel(demoStatusMap, currentDemo.status) }}
          </v-chip>
          <v-chip
            :color="getStatusColor(demoCategoryMap, currentDemo.category)"
            size="small"
            variant="tonal"
          >
            {{ getStatusLabel(demoCategoryMap, currentDemo.category) }}
          </v-chip>
          <v-chip v-if="currentDemo.is_hidden" size="small" color="grey" variant="outlined">
            <v-icon start size="14">mdi-eye-off</v-icon>
            Hidden
          </v-chip>
        </div>
      </div>
      <div class="d-flex ga-2">
        <v-btn
          variant="tonal"
          prepend-icon="mdi-download"
          :loading="demosStore.downloadDemoState.loading"
          @click="handleDownload"
        >
          Download
        </v-btn>
        <v-btn
          color="error"
          variant="tonal"
          prepend-icon="mdi-delete"
          @click="confirmDelete"
        >
          Delete
        </v-btn>
      </div>
    </div>

    <ErrorAlert
      :error="fetchDemoState.error"
      retryable
      @clear="fetchDemoState.error = null"
      @retry="fetchData"
    />

    <!-- Loading -->
    <v-card v-if="fetchDemoState.loading && !currentDemo" class="pa-8 text-center">
      <v-progress-circular indeterminate color="primary" size="48" />
      <p class="text-medium-emphasis mt-4">Loading demo...</p>
    </v-card>

    <template v-else-if="currentDemo">
      <v-row>
        <!-- Main Content -->
        <v-col cols="12" md="8">
          <!-- Demo Info -->
          <v-card class="mb-4">
            <v-card-title class="text-subtitle-1">Demo Information</v-card-title>
            <v-card-text>
              <v-table density="comfortable">
                <tbody>
                  <tr>
                    <td class="text-medium-emphasis" style="width: 180px;">File Name</td>
                    <td>{{ currentDemo.file_name }}</td>
                  </tr>
                  <tr>
                    <td class="text-medium-emphasis">File Size</td>
                    <td>{{ formatFileSize(currentDemo.file_size_bytes) }}</td>
                  </tr>
                  <tr>
                    <td class="text-medium-emphasis">S3 Location</td>
                    <td class="text-caption">{{ currentDemo.s3_bucket }}/{{ currentDemo.s3_key }}</td>
                  </tr>
                  <tr>
                    <td class="text-medium-emphasis">Discovered</td>
                    <td>{{ formatDateTime(currentDemo.discovered_at) }}</td>
                  </tr>
                  <tr>
                    <td class="text-medium-emphasis">Created</td>
                    <td>{{ formatDateTime(currentDemo.created_at) }}</td>
                  </tr>
                  <tr>
                    <td class="text-medium-emphasis">Updated</td>
                    <td>{{ formatDateTime(currentDemo.updated_at) }}</td>
                  </tr>
                  <tr v-if="currentDemo.stats_fetched_at">
                    <td class="text-medium-emphasis">Stats Fetched</td>
                    <td>{{ formatDateTime(currentDemo.stats_fetched_at) }}</td>
                  </tr>
                  <tr v-if="currentDemo.stats_fetch_error">
                    <td class="text-medium-emphasis">Stats Error</td>
                    <td class="text-error">{{ currentDemo.stats_fetch_error }}</td>
                  </tr>
                </tbody>
              </v-table>
            </v-card-text>
          </v-card>

          <!-- Match Metadata -->
          <v-card v-if="currentDemo.metadata" class="mb-4">
            <v-card-title class="text-subtitle-1">Match Metadata</v-card-title>
            <v-card-text>
              <v-row>
                <v-col cols="12" md="4">
                  <div class="text-caption text-medium-emphasis">Map</div>
                  <div class="text-body-1 font-weight-medium">{{ currentDemo.metadata.map_name }}</div>
                </v-col>
                <v-col cols="12" md="4">
                  <div class="text-caption text-medium-emphasis">Score</div>
                  <div class="text-body-1 font-weight-medium">
                    {{ currentDemo.metadata.team1_name }} {{ currentDemo.metadata.team1_score }} - {{ currentDemo.metadata.team2_score }} {{ currentDemo.metadata.team2_name }}
                  </div>
                </v-col>
                <v-col cols="12" md="2">
                  <div class="text-caption text-medium-emphasis">Rounds</div>
                  <div class="text-body-1">{{ currentDemo.metadata.total_rounds }}</div>
                </v-col>
                <v-col v-if="currentDemo.metadata.duration_seconds" cols="12" md="2">
                  <div class="text-caption text-medium-emphasis">Duration</div>
                  <div class="text-body-1">{{ formatDuration(currentDemo.metadata.duration_seconds) }}</div>
                </v-col>
              </v-row>
              <div v-if="currentDemo.metadata.match_date" class="mt-2">
                <span class="text-caption text-medium-emphasis">Match Date:</span>
                <span class="text-body-2 ml-1">{{ formatDateTime(currentDemo.metadata.match_date) }}</span>
              </div>
            </v-card-text>
          </v-card>

          <!-- Players -->
          <v-card class="mb-4">
            <v-card-title class="text-subtitle-1">
              Players
              <v-chip size="x-small" class="ml-2">{{ players.length }}</v-chip>
            </v-card-title>
            <v-card-text v-if="fetchPlayersState.loading" class="text-center pa-4">
              <v-progress-circular indeterminate color="primary" size="24" />
            </v-card-text>
            <v-card-text v-else-if="players.length === 0" class="text-center pa-4">
              <v-icon size="48" color="grey-lighten-1" class="mb-2">mdi-account-off</v-icon>
              <p class="text-medium-emphasis">
                {{ currentDemo.status === 'pending' || currentDemo.status === 'processing' ? 'Stats not yet processed' : 'No player data available' }}
              </p>
            </v-card-text>
            <div v-else class="table-scroll">
              <v-data-table
                :headers="playerHeaders"
                :items="players"
                :items-per-page="-1"
                density="compact"
                class="elevation-0"
              >
                <template v-slot:item.player_name="{ item }">
                  <div>
                    <span class="font-weight-medium">{{ item.player_name }}</span>
                    <span v-if="item.team_name" class="text-caption text-medium-emphasis ml-1">({{ item.team_name }})</span>
                  </div>
                </template>
                <template v-slot:item.stats.kills="{ item }">
                  {{ item.stats.kills }}/{{ item.stats.deaths }}/{{ item.stats.assists }}
                </template>
                <template v-slot:item.stats.adr="{ item }">
                  {{ item.stats.adr.toFixed(1) }}
                </template>
                <template v-slot:item.stats.kd_ratio="{ item }">
                  {{ item.stats.kd_ratio.toFixed(2) }}
                </template>
                <template v-slot:item.stats.hs_percentage="{ item }">
                  {{ (item.stats.hs_percentage * 100).toFixed(0) }}%
                </template>
                <template v-slot:bottom />
              </v-data-table>
            </div>
          </v-card>

          <!-- Match Links -->
          <v-card class="mb-4">
            <v-card-title class="d-flex align-center">
              <span class="text-subtitle-1">Match Links</span>
              <v-chip size="x-small" class="ml-2">{{ links.length }}</v-chip>
              <v-spacer />
              <v-btn
                size="small"
                variant="tonal"
                prepend-icon="mdi-link-plus"
                @click="linkModalOpen = true"
              >
                Link to Match
              </v-btn>
            </v-card-title>
            <v-card-text v-if="fetchLinksState.loading" class="text-center pa-4">
              <v-progress-circular indeterminate color="primary" size="24" />
            </v-card-text>
            <v-card-text v-else-if="links.length === 0" class="text-center pa-4">
              <v-icon size="48" color="grey-lighten-1" class="mb-2">mdi-link-off</v-icon>
              <p class="text-medium-emphasis">No match links</p>
            </v-card-text>
            <v-list v-else density="compact">
              <v-list-item v-for="link in links" :key="link.id">
                <template v-slot:prepend>
                  <v-icon size="20" color="grey">mdi-link</v-icon>
                </template>
                <v-list-item-title>
                  Match {{ link.match_id.slice(0, 8) }}...
                  <v-chip size="x-small" class="ml-1" data-testid="link-type-chip">{{ link.link_type }}</v-chip>
                  <v-chip
                    v-if="link.confidence_score != null"
                    size="x-small"
                    color="info"
                    variant="tonal"
                    class="ml-1"
                    data-testid="link-confidence-chip"
                  >
                    {{ Math.round(link.confidence_score * 100) }}% confidence
                  </v-chip>
                  <v-chip v-if="link.game_number" size="x-small" class="ml-1">Game {{ link.game_number }}</v-chip>
                  <v-chip v-if="link.validated" size="x-small" color="success" class="ml-1">Validated</v-chip>
                </v-list-item-title>
                <v-list-item-subtitle>
                  Linked {{ formatRelativeTime(link.linked_at) }}
                </v-list-item-subtitle>
                <template v-slot:append>
                  <v-btn aria-label="Unlink match"
                    icon
                    variant="text"
                    size="small"
                    color="error"
                    data-testid="unlink-match"
                    @click="confirmUnlink(link)"
                  >
                    <v-icon size="18">mdi-link-off</v-icon>
                    <v-tooltip activator="parent" location="top">Unlink</v-tooltip>
                  </v-btn>
                </template>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>

        <!-- Sidebar -->
        <v-col cols="12" md="4">
          <!-- Quick Actions -->
          <v-card variant="outlined" class="mb-4">
            <v-card-title class="text-subtitle-1">Quick Actions</v-card-title>
            <v-card-text>
              <div class="d-flex flex-column ga-2">
                <!-- Categorize -->
                <v-select
          aria-label="Category"
                  v-model="selectedCategory"
                  :items="categoryOptions"
                  label="Category"
                  variant="outlined"
                  density="compact"
                  :loading="demosStore.categorizeState.loading"
                  @update:model-value="handleCategorize"
                />

                <!-- Visibility Toggle -->
                <v-btn
                  :prepend-icon="currentDemo.is_hidden ? 'mdi-eye' : 'mdi-eye-off'"
                  variant="tonal"
                  block
                  :loading="demosStore.setVisibilityState.loading"
                  @click="handleToggleVisibility"
                >
                  {{ currentDemo.is_hidden ? 'Unhide Demo' : 'Hide Demo' }}
                </v-btn>

                <!-- Reprocess (failed demos) -->
                <v-btn
                  v-if="currentDemo.status === 'failed'"
                  prepend-icon="mdi-refresh"
                  variant="tonal"
                  color="warning"
                  block
                  @click="handleReprocess"
                >
                  Retry Processing
                </v-btn>
              </div>
            </v-card-text>
          </v-card>

          <!-- Association -->
          <v-card variant="outlined" class="mb-4">
            <v-card-title class="text-subtitle-1">Association</v-card-title>
            <v-card-text>
              <div class="mb-2">
                <div class="text-caption text-medium-emphasis">League</div>
                <div class="text-body-2">{{ currentDemo.league_id ?? 'None' }}</div>
              </div>
              <div class="mb-3">
                <div class="text-caption text-medium-emphasis">Tournament</div>
                <div class="text-body-2">{{ currentDemo.tournament_id ?? 'None' }}</div>
              </div>
            </v-card-text>
          </v-card>

          <!-- Admin Notes -->
          <v-card variant="outlined" class="mb-4">
            <v-card-title class="text-subtitle-1">Admin Notes</v-card-title>
            <v-card-text>
              <v-textarea
                v-model="notesText"
                aria-label="Admin notes"
                variant="outlined"
                density="compact"
                rows="3"
                placeholder="Add notes..."
                hide-details
              />
              <v-btn
                class="mt-2"
                size="small"
                variant="tonal"
                block
                :loading="demosStore.setNotesState.loading"
                :disabled="notesText === (currentDemo.admin_notes ?? '')"
                @click="handleSaveNotes"
              >
                Save Notes
              </v-btn>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <!-- Confirm Dialog -->
    <ConfirmDialogHost :dialog="confirmDialogState" />

    <!-- Link to Match Modal -->
    <DemoLinkMatchModal
      v-if="currentDemo"
      v-model="linkModalOpen"
      :demo-id="currentDemo.id"
      @linked="onMatchLinked"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useDemosStore, type DemoMatchLinkResponse } from '@/stores/demos'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { formatDateTime, formatRelativeTime, formatFileSize } from '@/utils/formatters'
import { demoStatusMap, demoCategoryMap, getStatusColor, getStatusLabel, getStatusIcon } from '@/utils/statusMaps'
import DemoLinkMatchModal from '@/components/admin/DemoLinkMatchModal.vue'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'

const route = useRoute()
const router = useRouter()
const demosStore = useDemosStore()
const {
  currentDemo, players, links,
  fetchDemoState, fetchPlayersState, fetchLinksState,
} = storeToRefs(demosStore)
const snackbar = useSnackbar()
const confirmDialogState = useConfirmDialog()

// State
const linkModalOpen = ref(false)
const notesText = ref('')
const selectedCategory = ref('')

const categoryOptions = [
  { title: 'Uncategorized', value: 'uncategorized' },
  { title: 'PUG', value: 'pug' },
  { title: 'League', value: 'league' },
  { title: 'Scrim', value: 'scrim' },
  { title: 'Ignored', value: 'ignored' },
]

const playerHeaders = [
  { title: 'Player', key: 'player_name', sortable: false },
  { title: 'Steam ID', key: 'steam_id', sortable: false },
  { title: 'K/D/A', key: 'stats.kills', sortable: false, width: '100px' },
  { title: 'ADR', key: 'stats.adr', sortable: false, width: '80px' },
  { title: 'K/D', key: 'stats.kd_ratio', sortable: false, width: '80px' },
  { title: 'HS%', key: 'stats.hs_percentage', sortable: false, width: '80px' },
]

// Watchers
watch(currentDemo, (demo) => {
  if (demo) {
    notesText.value = demo.admin_notes ?? ''
    selectedCategory.value = demo.category
  }
})

// Methods
async function fetchData() {
  const id = route.params.id as string
  demosStore.clearCurrent()
  await demosStore.fetchDemo(id)
  // Fetch sub-resources in parallel
  await Promise.all([
    demosStore.fetchPlayers(id),
    demosStore.fetchLinks(id),
  ])
}

async function handleDownload() {
  if (!currentDemo.value) return
  try {
    const result = await demosStore.downloadDemo(currentDemo.value.id)
    window.open(result.download_url, '_blank')
  } catch {
    snackbar.error('Failed to get download URL')
  }
}

async function handleCategorize(category: string) {
  if (!currentDemo.value) return
  try {
    await demosStore.categorize(currentDemo.value.id, { category })
    snackbar.success(`Categorized as ${category}`)
  } catch {
    snackbar.error('Failed to categorize')
  }
}

async function handleToggleVisibility() {
  if (!currentDemo.value) return
  const newHidden = !currentDemo.value.is_hidden
  try {
    await demosStore.setVisibility(currentDemo.value.id, { is_hidden: newHidden })
    snackbar.success(newHidden ? 'Demo hidden' : 'Demo unhidden')
  } catch {
    snackbar.error('Failed to update visibility')
  }
}

async function handleSaveNotes() {
  if (!currentDemo.value) return
  try {
    await demosStore.setNotes(currentDemo.value.id, { notes: notesText.value || null })
    snackbar.success('Notes saved')
  } catch {
    snackbar.error('Failed to save notes')
  }
}

// P-74: this used to be a null check followed by `snackbar.success(...)` — it
// called NO API. The operator was told a failed demo had been requeued when
// nothing had happened, which is worse than a missing button: it converts a
// known-broken demo into one believed to be recovering. It now calls the
// requeue endpoint added for it, and reports failure when it fails.
async function handleReprocess() {
  if (!currentDemo.value) return
  try {
    await demosStore.requeue(currentDemo.value.id)
    snackbar.success('Demo queued for reprocessing')
  } catch {
    snackbar.show(demosStore.requeueState.error || 'Failed to requeue demo', 'error')
  }
}

function confirmDelete() {
  if (!currentDemo.value) return
  confirmDialogState.confirm({
    title: 'Delete Demo',
    message: `Delete ${currentDemo.value.file_name}? This cannot be undone.`,
    action: 'Delete',
    color: 'error',
    handler: async () => {
      try {
        await demosStore.deleteDemo(currentDemo.value!.id)
        snackbar.success('Demo deleted')
        router.push({ name: 'admin-demos' })
      } catch {
        snackbar.error('Failed to delete demo')
      }
    },
  })
}

function confirmUnlink(link: DemoMatchLinkResponse) {
  confirmDialogState.confirm({
    title: 'Unlink Match',
    message: `Remove link to match ${link.match_id.slice(0, 8)}...?`,
    action: 'Unlink',
    color: 'error',
    handler: async () => {
      try {
        await demosStore.unlinkFromMatch(link.demo_id, link.match_id)
        snackbar.success('Match unlinked')
        await Promise.all([
          demosStore.fetchLinks(currentDemo.value!.id),
          demosStore.fetchDemo(currentDemo.value!.id),
        ])
      } catch {
        // Surface the RFC 7807 problem detail captured by the store action.
        snackbar.error(demosStore.unlinkFromMatchState.error || 'Failed to unlink match')
      }
    },
  })
}

function onMatchLinked() {
  snackbar.success('Demo linked to match')
  if (currentDemo.value) {
    demosStore.fetchLinks(currentDemo.value.id)
    demosStore.fetchDemo(currentDemo.value.id)
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

onMounted(fetchData)
</script>

<style scoped>
/* Wide tables scroll within themselves; the page never scrolls sideways. */
.table-scroll {
  overflow-x: auto;
}
</style>
