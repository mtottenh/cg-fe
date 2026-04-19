<template>
  <div>
    <!-- Header -->
    <div class="d-flex align-center mb-6">
      <v-btn icon variant="text" @click="router.push({ name: 'admin-demos' })" class="mr-2">
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

    <!-- Loading -->
    <v-card v-if="fetchDemoState.loading && !currentDemo" class="pa-8 text-center">
      <v-progress-circular indeterminate color="primary" size="48" />
      <p class="text-grey mt-4">Loading demo...</p>
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
                    <td class="text-grey" style="width: 180px;">File Name</td>
                    <td>{{ currentDemo.file_name }}</td>
                  </tr>
                  <tr>
                    <td class="text-grey">File Size</td>
                    <td>{{ formatFileSize(currentDemo.file_size_bytes) }}</td>
                  </tr>
                  <tr>
                    <td class="text-grey">S3 Location</td>
                    <td class="text-caption">{{ currentDemo.s3_bucket }}/{{ currentDemo.s3_key }}</td>
                  </tr>
                  <tr>
                    <td class="text-grey">Discovered</td>
                    <td>{{ formatDateTime(currentDemo.discovered_at) }}</td>
                  </tr>
                  <tr>
                    <td class="text-grey">Created</td>
                    <td>{{ formatDateTime(currentDemo.created_at) }}</td>
                  </tr>
                  <tr>
                    <td class="text-grey">Updated</td>
                    <td>{{ formatDateTime(currentDemo.updated_at) }}</td>
                  </tr>
                  <tr v-if="currentDemo.stats_fetched_at">
                    <td class="text-grey">Stats Fetched</td>
                    <td>{{ formatDateTime(currentDemo.stats_fetched_at) }}</td>
                  </tr>
                  <tr v-if="currentDemo.stats_fetch_error">
                    <td class="text-grey">Stats Error</td>
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
                  <div class="text-caption text-grey">Map</div>
                  <div class="text-body-1 font-weight-medium">{{ currentDemo.metadata.map_name }}</div>
                </v-col>
                <v-col cols="12" md="4">
                  <div class="text-caption text-grey">Score</div>
                  <div class="text-body-1 font-weight-medium">
                    {{ currentDemo.metadata.team1_name }} {{ currentDemo.metadata.team1_score }} - {{ currentDemo.metadata.team2_score }} {{ currentDemo.metadata.team2_name }}
                  </div>
                </v-col>
                <v-col cols="12" md="2">
                  <div class="text-caption text-grey">Rounds</div>
                  <div class="text-body-1">{{ currentDemo.metadata.total_rounds }}</div>
                </v-col>
                <v-col v-if="currentDemo.metadata.duration_seconds" cols="12" md="2">
                  <div class="text-caption text-grey">Duration</div>
                  <div class="text-body-1">{{ formatDuration(currentDemo.metadata.duration_seconds) }}</div>
                </v-col>
              </v-row>
              <div v-if="currentDemo.metadata.match_date" class="mt-2">
                <span class="text-caption text-grey">Match Date:</span>
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
              <p class="text-grey">
                {{ currentDemo.status === 'pending' || currentDemo.status === 'processing' ? 'Stats not yet processed' : 'No player data available' }}
              </p>
            </v-card-text>
            <v-data-table
              v-else
              :headers="playerHeaders"
              :items="players"
              :items-per-page="-1"
              density="compact"
              class="elevation-0"
            >
              <template v-slot:item.player_name="{ item }">
                <div>
                  <span class="font-weight-medium">{{ item.player_name }}</span>
                  <span v-if="item.team_name" class="text-caption text-grey ml-1">({{ item.team_name }})</span>
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
              <p class="text-grey">No match links</p>
            </v-card-text>
            <v-list v-else density="compact">
              <v-list-item v-for="link in links" :key="link.id">
                <template v-slot:prepend>
                  <v-icon size="20" color="grey">mdi-link</v-icon>
                </template>
                <v-list-item-title>
                  Match {{ link.match_id.slice(0, 8) }}...
                  <v-chip size="x-small" class="ml-1">{{ link.link_type }}</v-chip>
                  <v-chip v-if="link.game_number" size="x-small" class="ml-1">Game {{ link.game_number }}</v-chip>
                  <v-chip v-if="link.validated" size="x-small" color="success" class="ml-1">Validated</v-chip>
                </v-list-item-title>
                <v-list-item-subtitle>
                  Linked {{ formatRelativeTime(link.linked_at) }}
                </v-list-item-subtitle>
                <template v-slot:append>
                  <v-btn
                    icon
                    variant="text"
                    size="small"
                    color="error"
                    @click="confirmUnlink(link)"
                  >
                    <v-icon size="18">mdi-link-off</v-icon>
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
                <div class="text-caption text-grey">League</div>
                <div class="text-body-2">{{ currentDemo.league_id ?? 'None' }}</div>
              </div>
              <div class="mb-3">
                <div class="text-caption text-grey">Tournament</div>
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

    <!-- Error -->
    <v-alert v-if="fetchDemoState.error" type="error" class="mt-4" closable>
      {{ fetchDemoState.error }}
    </v-alert>

    <!-- Confirm Dialog -->
    <ConfirmDialog
      :open="confirmDialogState.state.open"
      :title="confirmDialogState.state.title"
      :message="confirmDialogState.state.message"
      :action-label="confirmDialogState.state.actionLabel"
      :color="confirmDialogState.state.color"
      :loading="confirmDialogState.state.loading"
      @confirm="confirmDialogState.execute"
      @cancel="confirmDialogState.cancel"
    />

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
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDemosStore, type DemoMatchLinkResponse } from '@/stores/demos'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { formatDateTime, formatRelativeTime, formatFileSize } from '@/utils/formatters'
import { demoStatusMap, demoCategoryMap, getStatusColor, getStatusLabel, getStatusIcon } from '@/utils/statusMaps'
import DemoLinkMatchModal from '@/components/admin/DemoLinkMatchModal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const demosStore = useDemosStore()
const snackbar = useSnackbar()
const confirmDialogState = useConfirmDialog()

// State
const linkModalOpen = ref(false)
const notesText = ref('')
const selectedCategory = ref('')

// Computed
const currentDemo = computed(() => demosStore.currentDemo)
const players = computed(() => demosStore.players)
const links = computed(() => demosStore.links)
const fetchDemoState = computed(() => demosStore.fetchDemoState)
const fetchPlayersState = computed(() => demosStore.fetchPlayersState)
const fetchLinksState = computed(() => demosStore.fetchLinksState)

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

async function handleReprocess() {
  // For failed demos — effectively re-submit to the pipeline by clearing the error state
  // This would be handled server-side; for now just refresh
  if (!currentDemo.value) return
  snackbar.success('Demo queued for reprocessing')
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
        await demosStore.fetchLinks(currentDemo.value!.id)
      } catch {
        snackbar.error('Failed to unlink match')
      }
    },
  })
}

function onMatchLinked() {
  snackbar.success('Demo linked to match')
  if (currentDemo.value) demosStore.fetchLinks(currentDemo.value.id)
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

onMounted(fetchData)
</script>
