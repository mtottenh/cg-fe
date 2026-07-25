<template>
  <div class="demo-browser">
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-3">
      <span class="text-subtitle-2">Discover Demos for This Match</span>
      <v-btn
        variant="text"
        size="small"
        :loading="evidenceStore.discoverState.loading"
        @click="refresh"
      >
        <v-icon start size="small">mdi-refresh</v-icon>
        Refresh
      </v-btn>
    </div>

    <!-- Loading -->
    <v-progress-linear
      v-if="evidenceStore.discoverState.loading || evidenceStore.fetchLinkedState.loading"
      indeterminate
      class="mb-3"
    />

    <!-- Error -->
    <v-alert
      v-if="evidenceStore.discoverState.error || evidenceStore.linkDemoState.error"
      type="error"
      variant="tonal"
      closable
      class="mb-3"
    >
      {{ evidenceStore.discoverState.error || evidenceStore.linkDemoState.error }}
    </v-alert>

    <!-- Suggested Demos -->
    <div v-if="evidenceStore.discoveredDemos.length > 0" class="mb-4">
      <div class="text-caption text-medium-emphasis mb-2">Suggested Demos</div>
      <v-card
        v-for="demo in evidenceStore.discoveredDemos"
        :key="demo.external_id"
        variant="outlined"
        class="mb-2 pa-3"
      >
        <div class="d-flex align-center justify-space-between">
          <div class="flex-grow-1 mr-2">
            <div class="d-flex align-center ga-2 mb-1">
              <span class="text-body-2 font-weight-medium">{{ demoDisplayName(demo) }}</span>
              <v-chip
                size="x-small"
                :color="relevanceColor(demo.relevance_score)"
                variant="tonal"
              >
                {{ Math.round(demo.relevance_score * 100) }}%
              </v-chip>
            </div>
            <div v-if="demoMeta(demo)" class="text-caption text-medium-emphasis">
              {{ demoMeta(demo)!.map_name }} &mdash;
              {{ demoMeta(demo)!.team1_name }} {{ demoMeta(demo)!.team1_score }}
              : {{ demoMeta(demo)!.team2_score }} {{ demoMeta(demo)!.team2_name }}
            </div>
            <div class="text-caption text-medium-emphasis">{{ demo.name }}</div>
          </div>
          <div class="d-flex align-center ga-1">
            <!-- Game number selector for series -->
            <v-select
          aria-label="Game"
              v-if="isSeries"
              v-model="gameNumberSelections[demo.external_id]"
              :items="gameNumberOptions"
              label="Game"
              variant="outlined"
              density="compact"
              hide-details
              style="width: 100px"
            />
            <v-btn aria-label="Link demo"
              icon
              size="small"
              color="success"
              variant="tonal"
              :loading="evidenceStore.linkDemoState.loading"
              @click="linkDemo(demo)"
            >
              <v-icon>mdi-plus</v-icon>
            </v-btn>
          </div>
        </div>
      </v-card>
    </div>

    <!-- No suggestions -->
    <v-alert
      v-else-if="!evidenceStore.discoverState.loading && evidenceStore.discoveredDemos.length === 0"
      type="info"
      variant="tonal"
      class="mb-4"
    >
      No demo suggestions found for this match. Try searching the demo catalog below.
    </v-alert>

    <!-- Browse Demo Catalog -->
    <v-divider class="my-4" />
    <div class="text-subtitle-2 mb-3">Browse Demo Catalog</div>

    <div class="d-flex align-center ga-2 mb-3">
      <v-text-field
        v-model="browseMapSearch"
        label="Map name"
        variant="outlined"
        density="compact"
        hide-details
        clearable
        style="max-width: 200px"
        @keyup.enter="searchDemos"
      />
      <v-text-field
        v-model="browseTeamSearch"
        label="Team name"
        variant="outlined"
        density="compact"
        hide-details
        clearable
        style="max-width: 200px"
        @keyup.enter="searchDemos"
      />
      <v-btn
        variant="tonal"
        :loading="evidenceStore.browseDemosState.loading"
        @click="searchDemos"
      >
        <v-icon start size="small">mdi-magnify</v-icon>
        Search
      </v-btn>
    </div>

    <v-progress-linear
      v-if="evidenceStore.browseDemosState.loading"
      indeterminate
      class="mb-3"
    />

    <v-alert
      v-if="evidenceStore.browseDemosState.error"
      type="error"
      variant="tonal"
      closable
      class="mb-3"
    >
      {{ evidenceStore.browseDemosState.error }}
    </v-alert>

    <v-alert
      v-if="evidenceStore.linkManualDemoState.error"
      type="error"
      variant="tonal"
      closable
      class="mb-3"
    >
      {{ evidenceStore.linkManualDemoState.error }}
    </v-alert>

    <div v-if="evidenceStore.browseDemos.length > 0" class="mb-4">
      <v-card
        v-for="demo in evidenceStore.browseDemos"
        :key="demo.id"
        variant="outlined"
        class="mb-2 pa-3"
      >
        <div class="d-flex align-center justify-space-between">
          <div class="flex-grow-1 mr-2">
            <div class="d-flex align-center ga-2 mb-1">
              <span class="text-body-2 font-weight-medium">
                {{ demo.metadata?.map_name || demo.file_name }}
              </span>
              <v-chip v-if="demo.category" size="x-small" variant="tonal">
                {{ getStatusLabel(demoCategoryMap, demo.category) }}
              </v-chip>
            </div>
            <div v-if="demo.metadata" class="text-caption text-medium-emphasis">
              {{ demo.metadata.team1_name }} {{ demo.metadata.team1_score }}
              : {{ demo.metadata.team2_score }} {{ demo.metadata.team2_name }}
            </div>
            <div class="text-caption text-medium-emphasis">{{ demo.file_name }}</div>
            <div v-if="demo.file_size_bytes" class="text-caption text-medium-emphasis">
              {{ formatFileSize(demo.file_size_bytes) }}
            </div>
          </div>
          <div class="d-flex align-center ga-1">
            <v-select
          aria-label="Game"
              v-if="isSeries"
              v-model="browseGameNumberSelections[demo.id]"
              :items="gameNumberOptions"
              label="Game"
              variant="outlined"
              density="compact"
              hide-details
              style="width: 100px"
            />
            <v-btn aria-label="Link demo"
              icon
              size="small"
              color="success"
              variant="tonal"
              :loading="evidenceStore.linkManualDemoState.loading"
              @click="linkManualDemo(demo)"
            >
              <v-icon>mdi-link-plus</v-icon>
            </v-btn>
          </div>
        </div>
      </v-card>

      <div v-if="browseTotalPages > 1" class="d-flex flex-column align-center mt-3">
        <v-pagination
          v-model="browsePage"
          :length="browseTotalPages"
          :total-visible="5"
          density="comfortable"
          @update:model-value="goToBrowsePage"
        />
        <span class="text-caption text-medium-emphasis mt-1">
          {{ evidenceStore.browseTotal }} demos found
        </span>
      </div>
    </div>

    <v-alert
      v-else-if="hasSearched && !evidenceStore.browseDemosState.loading && evidenceStore.browseDemos.length === 0"
      type="info"
      variant="tonal"
      class="mb-4"
    >
      No demos found matching your search.
    </v-alert>

    <!-- Linked Demos -->
    <div v-if="evidenceStore.linkedDemos.length > 0">
      <div class="text-caption text-medium-emphasis mb-2">Linked Demos</div>
      <v-card
        v-for="item in evidenceStore.linkedDemos"
        :key="item.link.id"
        variant="outlined"
        class="mb-2 pa-3"
      >
        <div class="d-flex align-center justify-space-between">
          <div class="flex-grow-1 mr-2">
            <div class="d-flex align-center ga-2 mb-1">
              <span class="text-body-2 font-weight-medium">
                {{ item.demo.metadata?.map_name || item.demo.file_name }}
              </span>
              <v-chip v-if="item.link.game_number" size="x-small" variant="tonal">
                Game {{ item.link.game_number }}
              </v-chip>
              <v-chip
                v-if="item.link.validated"
                size="x-small"
                color="success"
                variant="tonal"
              >
                <v-icon start size="x-small">mdi-check</v-icon>
                Validated
              </v-chip>
            </div>
            <div v-if="item.demo.metadata" class="text-caption text-medium-emphasis">
              {{ item.demo.metadata.team1_name }} {{ item.demo.metadata.team1_score }}
              : {{ item.demo.metadata.team2_score }} {{ item.demo.metadata.team2_name }}
              &mdash; {{ item.demo.metadata.total_rounds }} rounds
            </div>
          </div>
          <v-btn aria-label="Unlink demo"
            icon
            size="small"
            color="error"
            variant="text"
            :loading="evidenceStore.unlinkDemoState.loading"
            @click="unlinkDemo(item.link.id)"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </div>
      </v-card>
    </div>
  </div>
</template>

<script setup lang="ts">
// P-112 sweep: render the mapped label, not the raw wire value.
import { demoCategoryMap, getStatusLabel } from '@/utils/statusMaps'
import { ref, computed, watch, onMounted, reactive } from 'vue'
import { useEvidenceStore, type DiscoveredEvidenceResponse, type DemoResponse } from '@/stores/evidence'

interface DemoMetadata {
  map_name: string
  team1_name: string
  team1_score: number
  team2_name: string
  team2_score: number
  total_rounds?: number
}

const props = defineProps<{
  matchId: string
  matchFormat: 'bo1' | 'bo3' | 'bo5' | 'bo7'
}>()

const emit = defineEmits<{
  'update:demoLinkIds': [ids: string[]]
}>()

const evidenceStore = useEvidenceStore()
const gameNumberSelections = reactive<Record<string, number | undefined>>({})

// Browse state
const browseMapSearch = ref('')
const browseTeamSearch = ref('')
const browseGameNumberSelections = reactive<Record<string, number | undefined>>({})
const browsePageSize = 10
const browsePage = ref(1)
const hasSearched = ref(false)

const browseTotalPages = computed(() =>
  Math.ceil(evidenceStore.browseTotal / browsePageSize)
)

const isSeries = ref(props.matchFormat !== 'bo1')

const gameNumberOptions = (() => {
  const count = { bo1: 1, bo3: 3, bo5: 5, bo7: 7 }[props.matchFormat] ?? 1
  return Array.from({ length: count }, (_, i) => ({
    title: `Game ${i + 1}`,
    value: i + 1,
  }))
})()

function demoMeta(demo: DiscoveredEvidenceResponse): DemoMetadata | null {
  const meta = demo.metadata as DemoMetadata | null
  if (meta && typeof meta === 'object' && 'map_name' in meta) return meta
  return null
}

function demoDisplayName(demo: DiscoveredEvidenceResponse): string {
  const meta = demoMeta(demo)
  if (meta) return `${meta.map_name} - ${meta.team1_name} vs ${meta.team2_name}`
  return demo.name
}

function relevanceColor(score: number): string {
  if (score >= 0.8) return 'success'
  if (score >= 0.5) return 'warning'
  return 'error'
}

async function linkDemo(demo: DiscoveredEvidenceResponse) {
  const gameNumber = isSeries.value ? gameNumberSelections[demo.external_id] : 1
  await evidenceStore.linkDiscoveredDemo(props.matchId, demo.external_id, gameNumber)
}

async function unlinkDemo(demoLinkId: string) {
  await evidenceStore.unlinkDemoEvidence(props.matchId, demoLinkId)
}

function refresh() {
  evidenceStore.discoverDemos(props.matchId)
}

function searchDemos() {
  browsePage.value = 1
  hasSearched.value = true
  evidenceStore.fetchBrowseDemos({
    status: 'ready',
    map_name: browseMapSearch.value || undefined,
    team_name: browseTeamSearch.value || undefined,
    limit: browsePageSize,
    offset: 0,
  })
}

function goToBrowsePage(page: number) {
  browsePage.value = page
  evidenceStore.fetchBrowseDemos({
    status: 'ready',
    map_name: browseMapSearch.value || undefined,
    team_name: browseTeamSearch.value || undefined,
    limit: browsePageSize,
    offset: (page - 1) * browsePageSize,
  })
}

async function linkManualDemo(demo: DemoResponse) {
  const gameNumber = isSeries.value ? browseGameNumberSelections[demo.id] : 1
  await evidenceStore.linkManualDemo(props.matchId, demo.file_name, gameNumber, demo.id)
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Auto-search on input change after first manual search
let debounceTimer: ReturnType<typeof setTimeout> | null = null
watch([browseMapSearch, browseTeamSearch], () => {
  if (!hasSearched.value) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => searchDemos(), 400)
})

// Emit demoLinkIds whenever linked demos change
watch(
  () => evidenceStore.linkedDemos,
  (demos) => {
    emit('update:demoLinkIds', demos.map(d => d.link.id))
  },
  { deep: true }
)

onMounted(async () => {
  await Promise.all([
    evidenceStore.discoverDemos(props.matchId),
    evidenceStore.fetchLinkedDemos(props.matchId),
  ])
})
</script>
