# Demo Catalog System Implementation (Phase 3 of 3)

## Priority: LOWER (Enhancement Feature) - But Completes Match Evidence Flow

## CRITICAL: Read Architecture Document First

**Before doing ANYTHING, read `00-match-evidence-architecture.md` in this directory.**

This prompt is **Phase 3 of 3** in the Match Result & Evidence flow:
- Phase 1 (prompt 01): Result submission with evidence UI shell ← **MUST BE COMPLETE**
- Phase 2 (prompt 03): Full evidence upload/management ← **MUST BE COMPLETE**
- **Phase 3 (this prompt)**: Demo catalog integration

## Prerequisites Check

**Before starting Phase 3, verify Phases 1 and 2 are complete:**
- [ ] `matchResults.ts` store exists and works
- [ ] `evidence.ts` store exists and works
- [ ] Evidence upload, link, and delete all work
- [ ] "Browse Demos" tab shows placeholder in `EvidenceAttachmentPanel`
- [ ] E2E tests for Phases 1 and 2 pass

If Phases 1 and 2 are not complete, **STOP** and complete them first.

## Overview

Complete the **Demo Catalog System** that provides a browsable repository of demos AND enables the "Browse Demos" tab in the evidence panel. After this phase, users can:
1. Browse all demos in a public catalog
2. Select demos from the catalog as evidence when submitting results
3. View demo statistics and player information

## IMPORTANT: Think Carefully

You are completing a 3-phase feature. Consider:
- The `DemoSelector.vue` component must integrate into the existing `EvidenceAttachmentPanel`
- The `evidence.ts` store already has `linkDemo()` method - use it
- Demo catalog pages are standalone but linked from evidence
- Maintain consistency with existing UI patterns

## Backend Endpoints to Integrate

### Public Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/demos` | List/search demos |
| `GET` | `/v1/demos/{demo_id}` | Get demo details |
| `GET` | `/v1/demos/{demo_id}/players` | Get players in demo |
| `GET` | `/v1/demos/{demo_id}/links` | Get match links for demo |
| `GET` | `/v1/matches/{match_id}/demos` | Get demos for a match |

### Admin Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/admin/demos` | Add demo to catalog |
| `GET` | `/v1/admin/demos/stats` | Get catalog statistics |
| `GET` | `/v1/admin/demos/pending` | Get uncategorized demos |
| `POST` | `/v1/admin/demos/{demo_id}/categorize` | Set demo category |
| `POST` | `/v1/admin/demos/{demo_id}/visibility` | Set visibility |
| `POST` | `/v1/admin/demos/{demo_id}/associate` | Associate with player |
| `POST` | `/v1/admin/demos/{demo_id}/link` | Link to match |
| `DELETE` | `/v1/admin/demos/{demo_id}/link/{match_id}` | Unlink from match |

## Implementation Tasks

### 1. Create Pinia Store: `src/stores/demos.ts`

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, ApiError } from '@/api'
import type { components } from '@/api/types'

type DemoResponse = components['schemas']['DemoResponse']
type DemoPlayerResponse = components['schemas']['DemoPlayerResponse']
type DemoStatsResponse = components['schemas']['DemoStatsResponse']
type ApiErrorResponse = components['schemas']['ApiError']

export interface DemoFilters {
  query?: string
  mapName?: string
  playerId?: string
  dateFrom?: string
  dateTo?: string
  category?: string
}

export const useDemosStore = defineStore('demos', () => {
  // State
  const demos = ref<DemoResponse[]>([])
  const currentDemo = ref<DemoResponse | null>(null)
  const demoPlayers = ref<DemoPlayerResponse[]>([])
  const demoStats = ref<DemoStatsResponse | null>(null)
  const matchDemos = ref<DemoResponse[]>([])

  const filters = ref<DemoFilters>({})
  const page = ref(1)
  const totalPages = ref(1)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Admin state
  const catalogStats = ref<any>(null)
  const pendingDemos = ref<DemoResponse[]>([])

  // Actions
  async function searchDemos(
    searchFilters?: DemoFilters,
    pageNum: number = 1
  ): Promise<DemoResponse[]> {
    loading.value = true
    error.value = null
    filters.value = searchFilters || {}
    page.value = pageNum

    try {
      const { data, error: apiError } = await api.GET('/v1/demos', {
        params: {
          query: {
            query: filters.value.query,
            map_name: filters.value.mapName,
            player_id: filters.value.playerId,
            date_from: filters.value.dateFrom,
            date_to: filters.value.dateTo,
            category: filters.value.category,
            page: pageNum,
            page_size: 20,
          },
        },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      demos.value = data!.data
      totalPages.value = data!.pagination?.total_pages || 1
      return demos.value
    } catch (e: unknown) {
      if (e instanceof ApiError) error.value = e.detail
      else error.value = 'Failed to search demos'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchDemo(demoId: string): Promise<DemoResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/demos/{demo_id}', {
        params: { path: { demo_id: demoId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentDemo.value = data!.data
      return currentDemo.value
    } catch (e: unknown) {
      if (e instanceof ApiError) error.value = e.detail
      else error.value = 'Failed to fetch demo'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchDemoPlayers(demoId: string): Promise<DemoPlayerResponse[]> {
    try {
      const { data, error: apiError } = await api.GET('/v1/demos/{demo_id}/players', {
        params: { path: { demo_id: demoId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      demoPlayers.value = data!.data
      return demoPlayers.value
    } catch (e: unknown) {
      if (e instanceof ApiError) error.value = e.detail
      throw e
    }
  }

  async function fetchMatchDemos(matchId: string): Promise<DemoResponse[]> {
    try {
      const { data, error: apiError } = await api.GET('/v1/matches/{match_id}/demos', {
        params: { path: { match_id: matchId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      matchDemos.value = data!.data
      return matchDemos.value
    } catch (e: unknown) {
      if (e instanceof ApiError) error.value = e.detail
      throw e
    }
  }

  // For use in DemoSelector - get demos relevant to a match
  async function getSuggestedDemos(matchId: string): Promise<DemoResponse[]> {
    // First try to get demos already linked to this match
    const linked = await fetchMatchDemos(matchId)
    if (linked.length > 0) return linked

    // Otherwise return recent demos
    await searchDemos({}, 1)
    return demos.value.slice(0, 10)
  }

  // Admin actions
  async function fetchCatalogStats(): Promise<any> {
    const { data, error: apiError } = await api.GET('/v1/admin/demos/stats')
    if (apiError) {
      const err = apiError as ApiErrorResponse
      throw new ApiError(err.status, err.detail, err.errors ?? undefined)
    }
    catalogStats.value = data!.data
    return catalogStats.value
  }

  async function fetchPendingDemos(): Promise<DemoResponse[]> {
    const { data, error: apiError } = await api.GET('/v1/admin/demos/pending')
    if (apiError) {
      const err = apiError as ApiErrorResponse
      throw new ApiError(err.status, err.detail, err.errors ?? undefined)
    }
    pendingDemos.value = data!.data
    return pendingDemos.value
  }

  function clear() {
    demos.value = []
    currentDemo.value = null
    demoPlayers.value = []
    demoStats.value = null
    matchDemos.value = []
    filters.value = {}
    page.value = 1
    loading.value = false
    error.value = null
  }

  function $reset() { clear() }

  return {
    // State
    demos,
    currentDemo,
    demoPlayers,
    demoStats,
    matchDemos,
    filters,
    page,
    totalPages,
    loading,
    error,
    catalogStats,
    pendingDemos,
    // Actions
    searchDemos,
    fetchDemo,
    fetchDemoPlayers,
    fetchMatchDemos,
    getSuggestedDemos,
    fetchCatalogStats,
    fetchPendingDemos,
    clear,
    $reset,
  }
})
```

### 2. Create Demo Selector Component (Completes Phase 2 Placeholder)

#### `src/components/match/demos/DemoSelector.vue`

This is the key integration point - it replaces the placeholder in `EvidenceAttachmentPanel`.

```vue
<template>
  <div class="demo-selector">
    <!-- Search bar -->
    <v-text-field
      v-model="searchQuery"
      placeholder="Search demos by map, player..."
      prepend-inner-icon="mdi-magnify"
      variant="outlined"
      density="compact"
      clearable
      @update:model-value="debouncedSearch"
    />

    <!-- Filters -->
    <div class="d-flex gap-2 mt-2">
      <v-select
        v-model="mapFilter"
        :items="mapOptions"
        label="Map"
        variant="outlined"
        density="compact"
        clearable
        style="max-width: 150px;"
      />
      <v-select
        v-model="dateFilter"
        :items="dateOptions"
        label="Date"
        variant="outlined"
        density="compact"
        style="max-width: 150px;"
      />
    </div>

    <!-- Suggested demos for this match -->
    <div v-if="suggestedDemos.length > 0" class="mt-4">
      <p class="text-subtitle-2 mb-2">Suggested for this match</p>
      <v-row dense>
        <v-col v-for="demo in suggestedDemos" :key="demo.id" cols="6">
          <DemoSelectorCard
            :demo="demo"
            :selected="selectedDemoId === demo.id"
            @select="handleSelect(demo)"
          />
        </v-col>
      </v-row>
    </div>

    <!-- All demos -->
    <div class="mt-4">
      <p class="text-subtitle-2 mb-2">All demos</p>

      <v-row v-if="loading" dense>
        <v-col cols="12" class="text-center">
          <v-progress-circular indeterminate size="24" />
        </v-col>
      </v-row>

      <v-row v-else-if="demos.length === 0" dense>
        <v-col cols="12">
          <p class="text-caption text-grey">No demos found</p>
        </v-col>
      </v-row>

      <v-row v-else dense>
        <v-col v-for="demo in demos" :key="demo.id" cols="6">
          <DemoSelectorCard
            :demo="demo"
            :selected="selectedDemoId === demo.id"
            @select="handleSelect(demo)"
          />
        </v-col>
      </v-row>

      <!-- Load more -->
      <v-btn
        v-if="hasMore"
        variant="text"
        block
        class="mt-2"
        @click="loadMore"
      >
        Load more
      </v-btn>
    </div>

    <!-- Selected demo action -->
    <v-btn
      v-if="selectedDemoId"
      color="primary"
      block
      class="mt-4"
      :loading="linking"
      @click="handleConfirmSelection"
    >
      Attach Selected Demo
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useDemosStore } from '@/stores/demos'
import { useEvidenceStore } from '@/stores/evidence'
import DemoSelectorCard from './DemoSelectorCard.vue'
import { useDebounceFn } from '@vueuse/core'

const props = defineProps<{
  matchId: string
}>()

const emit = defineEmits<{
  selected: [evidenceId: string]
}>()

const demosStore = useDemosStore()
const evidenceStore = useEvidenceStore()

// Local state
const searchQuery = ref('')
const mapFilter = ref<string | null>(null)
const dateFilter = ref<string | null>(null)
const selectedDemoId = ref<string | null>(null)
const selectedDemo = ref<any>(null)
const linking = ref(false)

const suggestedDemos = ref<any[]>([])

// Computed
const demos = computed(() => demosStore.demos)
const loading = computed(() => demosStore.loading)
const hasMore = computed(() => demosStore.page < demosStore.totalPages)

const mapOptions = [
  { title: 'de_inferno', value: 'de_inferno' },
  { title: 'de_mirage', value: 'de_mirage' },
  { title: 'de_nuke', value: 'de_nuke' },
  { title: 'de_ancient', value: 'de_ancient' },
  { title: 'de_anubis', value: 'de_anubis' },
  { title: 'de_vertigo', value: 'de_vertigo' },
  { title: 'de_dust2', value: 'de_dust2' },
]

const dateOptions = [
  { title: 'Last 24 hours', value: '24h' },
  { title: 'Last 7 days', value: '7d' },
  { title: 'Last 30 days', value: '30d' },
  { title: 'All time', value: 'all' },
]

// Actions
async function search() {
  const dateFrom = getDateFrom(dateFilter.value)
  await demosStore.searchDemos({
    query: searchQuery.value || undefined,
    mapName: mapFilter.value || undefined,
    dateFrom,
  })
}

const debouncedSearch = useDebounceFn(search, 300)

function getDateFrom(filter: string | null): string | undefined {
  if (!filter || filter === 'all') return undefined
  const now = new Date()
  switch (filter) {
    case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    default: return undefined
  }
}

async function loadMore() {
  const dateFrom = getDateFrom(dateFilter.value)
  await demosStore.searchDemos({
    query: searchQuery.value || undefined,
    mapName: mapFilter.value || undefined,
    dateFrom,
  }, demosStore.page + 1)
}

function handleSelect(demo: any) {
  if (selectedDemoId.value === demo.id) {
    selectedDemoId.value = null
    selectedDemo.value = null
  } else {
    selectedDemoId.value = demo.id
    selectedDemo.value = demo
  }
}

async function handleConfirmSelection() {
  if (!selectedDemoId.value) return

  linking.value = true
  try {
    // Use the evidence store's linkDemo method (from Phase 2)
    const evidenceId = await evidenceStore.linkDemo(props.matchId, selectedDemoId.value)
    emit('selected', evidenceId)

    // Reset selection
    selectedDemoId.value = null
    selectedDemo.value = null
  } catch (e) {
    console.error('Failed to link demo:', e)
  } finally {
    linking.value = false
  }
}

// Initialize
onMounted(async () => {
  // Load suggested demos for this match
  suggestedDemos.value = await demosStore.getSuggestedDemos(props.matchId)

  // Load initial demos
  await search()
})
</script>

<style scoped>
.demo-selector {
  max-height: 400px;
  overflow-y: auto;
}
</style>
```

#### `src/components/match/demos/DemoSelectorCard.vue`

```vue
<template>
  <v-card
    :variant="selected ? 'flat' : 'outlined'"
    :color="selected ? 'primary' : undefined"
    class="demo-selector-card"
    @click="$emit('select')"
  >
    <div class="d-flex pa-2">
      <div class="map-thumbnail mr-2">
        <v-img
          :src="mapThumbnail"
          width="60"
          height="40"
          cover
        />
      </div>
      <div class="flex-grow-1 overflow-hidden">
        <p class="text-body-2 font-weight-medium text-truncate">
          {{ demo.map_name }}
        </p>
        <p class="text-caption text-grey text-truncate">
          {{ formatDate(demo.recorded_at) }}
        </p>
        <p v-if="demo.teams" class="text-caption text-truncate">
          {{ demo.teams.team_a }} vs {{ demo.teams.team_b }}
        </p>
      </div>
      <v-icon v-if="selected" color="white" class="align-self-center">
        mdi-check-circle
      </v-icon>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  demo: {
    id: string
    map_name: string
    recorded_at: string
    teams?: {
      team_a: string
      team_b: string
    }
    score?: {
      team_a: number
      team_b: number
    }
  }
  selected: boolean
}>()

defineEmits<{
  select: []
}>()

const mapThumbnail = computed(() => {
  // Return map thumbnail URL based on map name
  return `/maps/${props.demo.map_name}.jpg`
})

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<style scoped>
.demo-selector-card {
  cursor: pointer;
  transition: all 0.2s;
}
.demo-selector-card:hover {
  transform: translateY(-2px);
}
.map-thumbnail {
  border-radius: 4px;
  overflow: hidden;
}
</style>
```

### 3. Update EvidenceAttachmentPanel (Enable Browse Tab)

Update `src/components/match/evidence/EvidenceAttachmentPanel.vue` to use `DemoSelector`:

```vue
<!-- In the template, replace the "Browse Demos" placeholder -->
<!-- Browse Demos: NOW FUNCTIONAL -->
<div v-else-if="activeTab === 'browse'">
  <DemoSelector
    :match-id="matchId"
    @selected="handleDemoSelected"
  />
</div>

<!-- In script setup, add -->
import DemoSelector from '../demos/DemoSelector.vue'

// And update the EvidenceTypeSelector props
<EvidenceTypeSelector
  v-model="activeTab"
  :link-enabled="true"
  :demo-enabled="true"
  :browse-enabled="true"  <!-- NOW ENABLED -->
/>

// Add handler
function handleDemoSelected(evidenceId: string) {
  // Evidence is already linked by DemoSelector via evidenceStore.linkDemo()
  // Just switch back to upload tab or show success
  activeTab.value = 'upload'
}
```

### 4. Create Standalone Demo Catalog Pages

#### `src/pages/demos/DemosPage.vue`

```vue
<template>
  <v-container>
    <!-- Hero section -->
    <v-row class="mb-6">
      <v-col cols="12">
        <h1 class="text-h4 mb-2">Demo Catalog</h1>
        <p class="text-body-1 text-grey">
          Browse and download match demos from tournaments
        </p>
      </v-col>
    </v-row>

    <!-- Search and filters -->
    <v-row class="mb-4">
      <v-col cols="12" md="6">
        <v-text-field
          v-model="searchQuery"
          placeholder="Search demos..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          clearable
          @update:model-value="debouncedSearch"
        />
      </v-col>
      <v-col cols="6" md="3">
        <v-select
          v-model="mapFilter"
          :items="mapOptions"
          label="Map"
          variant="outlined"
          clearable
        />
      </v-col>
      <v-col cols="6" md="3">
        <v-select
          v-model="dateFilter"
          :items="dateOptions"
          label="Date"
          variant="outlined"
        />
      </v-col>
    </v-row>

    <!-- Demo grid -->
    <v-row v-if="loading && demos.length === 0">
      <v-col cols="12" class="text-center py-8">
        <v-progress-circular indeterminate size="48" />
      </v-col>
    </v-row>

    <v-row v-else-if="demos.length === 0">
      <v-col cols="12">
        <v-alert type="info" variant="tonal">
          No demos found matching your criteria.
        </v-alert>
      </v-col>
    </v-row>

    <v-row v-else>
      <v-col
        v-for="demo in demos"
        :key="demo.id"
        cols="12"
        sm="6"
        md="4"
        lg="3"
      >
        <DemoCard :demo="demo" />
      </v-col>
    </v-row>

    <!-- Pagination -->
    <v-row v-if="totalPages > 1" class="mt-4">
      <v-col cols="12" class="d-flex justify-center">
        <v-pagination
          v-model="currentPage"
          :length="totalPages"
          @update:model-value="handlePageChange"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useDemosStore } from '@/stores/demos'
import { useDebounceFn } from '@vueuse/core'
import DemoCard from '@/components/demo/DemoCard.vue'

const store = useDemosStore()

const searchQuery = ref('')
const mapFilter = ref<string | null>(null)
const dateFilter = ref<string>('30d')
const currentPage = ref(1)

const demos = computed(() => store.demos)
const loading = computed(() => store.loading)
const totalPages = computed(() => store.totalPages)

const mapOptions = [
  { title: 'de_inferno', value: 'de_inferno' },
  { title: 'de_mirage', value: 'de_mirage' },
  { title: 'de_nuke', value: 'de_nuke' },
  { title: 'de_ancient', value: 'de_ancient' },
  { title: 'de_anubis', value: 'de_anubis' },
  { title: 'de_vertigo', value: 'de_vertigo' },
  { title: 'de_dust2', value: 'de_dust2' },
]

const dateOptions = [
  { title: 'Last 24 hours', value: '24h' },
  { title: 'Last 7 days', value: '7d' },
  { title: 'Last 30 days', value: '30d' },
  { title: 'All time', value: 'all' },
]

async function search(page: number = 1) {
  currentPage.value = page
  await store.searchDemos({
    query: searchQuery.value || undefined,
    mapName: mapFilter.value || undefined,
    dateFrom: getDateFrom(dateFilter.value),
  }, page)
}

const debouncedSearch = useDebounceFn(() => search(1), 300)

function getDateFrom(filter: string): string | undefined {
  if (filter === 'all') return undefined
  const now = new Date()
  switch (filter) {
    case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    default: return undefined
  }
}

function handlePageChange(page: number) {
  search(page)
}

watch([mapFilter, dateFilter], () => search(1))

onMounted(() => search())
</script>
```

#### `src/pages/demos/DemoDetailPage.vue`

```vue
<template>
  <v-container>
    <v-row v-if="loading">
      <v-col cols="12" class="text-center py-8">
        <v-progress-circular indeterminate size="48" />
      </v-col>
    </v-row>

    <template v-else-if="demo">
      <!-- Header -->
      <v-row class="mb-4">
        <v-col cols="12">
          <v-breadcrumbs :items="breadcrumbs" />
        </v-col>
      </v-row>

      <v-row>
        <!-- Main info -->
        <v-col cols="12" md="8">
          <v-card>
            <v-img
              :src="mapThumbnail"
              height="200"
              cover
              gradient="to bottom, rgba(0,0,0,0), rgba(0,0,0,0.8)"
            >
              <v-card-title class="position-absolute bottom-0 text-white">
                {{ demo.map_name }}
              </v-card-title>
            </v-img>

            <v-card-text>
              <div class="d-flex flex-wrap gap-2 mb-4">
                <v-chip>{{ formatDate(demo.recorded_at) }}</v-chip>
                <v-chip>{{ formatDuration(demo.duration) }}</v-chip>
                <v-chip v-if="demo.file_size">{{ formatSize(demo.file_size) }}</v-chip>
              </div>

              <div v-if="demo.teams" class="mb-4">
                <h3 class="text-h6 mb-2">Match</h3>
                <p class="text-h5">
                  {{ demo.teams.team_a }}
                  <span class="mx-2">{{ demo.score?.team_a }} - {{ demo.score?.team_b }}</span>
                  {{ demo.teams.team_b }}
                </p>
              </div>

              <!-- Players -->
              <div v-if="players.length > 0">
                <h3 class="text-h6 mb-2">Players</h3>
                <DemoPlayersList :players="players" />
              </div>
            </v-card-text>

            <v-card-actions>
              <v-btn color="primary" size="large" @click="handleDownload">
                <v-icon start>mdi-download</v-icon>
                Download Demo
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-col>

        <!-- Sidebar -->
        <v-col cols="12" md="4">
          <!-- Linked matches -->
          <v-card v-if="linkedMatches.length > 0" class="mb-4">
            <v-card-title>Linked Matches</v-card-title>
            <v-list>
              <v-list-item
                v-for="match in linkedMatches"
                :key="match.id"
                :to="`/tournaments/${match.tournament_id}/matches/${match.id}`"
              >
                <v-list-item-title>{{ match.title }}</v-list-item-title>
                <v-list-item-subtitle>{{ match.tournament_name }}</v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-card>

          <!-- Stats preview if available -->
          <DemoStatsPreview v-if="demoStats" :stats="demoStats" />
        </v-col>
      </v-row>
    </template>

    <v-row v-else>
      <v-col cols="12">
        <v-alert type="error">Demo not found</v-alert>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useDemosStore } from '@/stores/demos'
import DemoPlayersList from '@/components/demo/DemoPlayersList.vue'
import DemoStatsPreview from '@/components/demo/DemoStatsPreview.vue'

const route = useRoute()
const store = useDemosStore()

const demoId = computed(() => route.params.demoId as string)

const demo = computed(() => store.currentDemo)
const players = computed(() => store.demoPlayers)
const demoStats = computed(() => store.demoStats)
const loading = computed(() => store.loading)
const linkedMatches = ref<any[]>([])

const breadcrumbs = computed(() => [
  { title: 'Demos', to: '/demos' },
  { title: demo.value?.map_name || 'Demo', disabled: true },
])

const mapThumbnail = computed(() => `/maps/${demo.value?.map_name}.jpg`)

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function handleDownload() {
  // Get download URL and open
  // This would use a presigned URL from the backend
  window.open(`/api/v1/demos/${demoId.value}/download`, '_blank')
}

onMounted(async () => {
  await store.fetchDemo(demoId.value)
  await store.fetchDemoPlayers(demoId.value)
})
</script>
```

### 5. Create Demo Display Components

#### `src/components/demo/DemoCard.vue`

```vue
<template>
  <v-card :to="`/demos/${demo.id}`" class="demo-card">
    <v-img
      :src="mapThumbnail"
      height="120"
      cover
      gradient="to bottom, rgba(0,0,0,0), rgba(0,0,0,0.7)"
    >
      <v-card-title class="position-absolute bottom-0 text-white py-2">
        {{ demo.map_name }}
      </v-card-title>
    </v-img>

    <v-card-text>
      <div class="d-flex justify-space-between align-center">
        <span class="text-caption">{{ formatDate(demo.recorded_at) }}</span>
        <span class="text-caption">{{ formatDuration(demo.duration) }}</span>
      </div>

      <div v-if="demo.teams" class="mt-2 text-body-2">
        {{ demo.teams.team_a }} vs {{ demo.teams.team_b }}
      </div>

      <div v-if="demo.score" class="text-h6 mt-1">
        {{ demo.score.team_a }} - {{ demo.score.team_b }}
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  demo: {
    id: string
    map_name: string
    recorded_at: string
    duration: number
    teams?: { team_a: string; team_b: string }
    score?: { team_a: number; team_b: number }
  }
}>()

const mapThumbnail = computed(() => `/maps/${props.demo.map_name}.jpg`)

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  return `${mins} min`
}
</script>

<style scoped>
.demo-card {
  transition: transform 0.2s;
}
.demo-card:hover {
  transform: translateY(-4px);
}
</style>
```

#### `src/components/demo/DemoPlayersList.vue`

```vue
<template>
  <v-table density="compact">
    <thead>
      <tr>
        <th>Player</th>
        <th class="text-center">K</th>
        <th class="text-center">D</th>
        <th class="text-center">A</th>
        <th class="text-center">ADR</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="player in players" :key="player.steam_id">
        <td>
          <router-link
            v-if="player.player_id"
            :to="`/players/${player.player_id}`"
          >
            {{ player.name }}
          </router-link>
          <span v-else>{{ player.name }}</span>
        </td>
        <td class="text-center">{{ player.kills }}</td>
        <td class="text-center">{{ player.deaths }}</td>
        <td class="text-center">{{ player.assists }}</td>
        <td class="text-center">{{ player.adr?.toFixed(1) || '-' }}</td>
      </tr>
    </tbody>
  </v-table>
</template>

<script setup lang="ts">
defineProps<{
  players: Array<{
    steam_id: string
    player_id?: string
    name: string
    kills: number
    deaths: number
    assists: number
    adr?: number
  }>
}>()
</script>
```

### 6. Add Routes

```typescript
// In router/index.ts
{
  path: '/demos',
  name: 'demos',
  component: () => import('@/pages/demos/DemosPage.vue'),
},
{
  path: '/demos/:demoId',
  name: 'demo-detail',
  component: () => import('@/pages/demos/DemoDetailPage.vue'),
}
```

### 7. E2E Tests: `e2e/demos.spec.ts`

```typescript
import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './fixtures/auth.fixture'

test.describe('Demo Catalog (Phase 3)', () => {
  test.describe('Demo Catalog Page', () => {
    test('should display demo catalog', async ({ page }) => {
      await page.goto('/demos')
      await expect(page.getByRole('heading', { name: 'Demo Catalog' })).toBeVisible()
    })

    test('should search demos by query', async ({ page }) => {
      await page.goto('/demos')
      await page.getByPlaceholder('Search demos...').fill('inferno')
      // Wait for search results
      await page.waitForTimeout(500)
    })

    test('should filter by map', async ({ page }) => {
      await page.goto('/demos')
      await page.getByLabel('Map').click()
      await page.getByRole('option', { name: 'de_mirage' }).click()
    })

    test('should navigate to demo detail', async ({ page }) => {
      await page.goto('/demos')
      const demoCard = page.locator('.demo-card').first()
      if (await demoCard.isVisible()) {
        await demoCard.click()
        await expect(page).toHaveURL(/\/demos\/[^/]+$/)
      }
    })
  })

  test.describe('Demo Detail Page', () => {
    test('should display demo information', async ({ page }) => {
      // Need a known demo ID for this test
      await page.goto('/demos')
      const demoCard = page.locator('.demo-card').first()
      if (await demoCard.isVisible()) {
        await demoCard.click()
        await expect(page.getByText('Download Demo')).toBeVisible()
      }
    })

    test('should show player list', async ({ page }) => {
      // Navigate to demo with players
    })
  })

  test.describe('Demo Selector Integration', () => {
    test('Browse Demos tab should be enabled', async ({ page }) => {
      await loginAsAdmin(page)
      // Navigate to match result submission
      // Verify Browse Demos tab is now clickable
    })

    test('should search and select demo in selector', async ({ page }) => {
      await loginAsAdmin(page)
      // Navigate to match result submission
      // Click Browse Demos tab
      // Search for demo
      // Select demo
      // Verify it appears in attached evidence
    })

    test('selecting demo should create evidence link', async ({ page }) => {
      await loginAsAdmin(page)
      // Select demo, submit result
      // Verify demo is linked as evidence
    })
  })

  test.describe('Integration with Evidence', () => {
    test('linked demos show in match evidence tab', async ({ page }) => {
      await loginAsAdmin(page)
      // Navigate to match with linked demo
      // Verify demo appears in Evidence tab
    })
  })
})
```

## File Structure (Phase 3 Additions)

```
src/
├── stores/
│   └── demos.ts                           # NEW
├── components/
│   ├── match/
│   │   ├── evidence/
│   │   │   └── EvidenceAttachmentPanel.vue  # UPDATED (enable browse tab)
│   │   └── demos/
│   │       ├── DemoSelector.vue             # NEW (key integration)
│   │       └── DemoSelectorCard.vue         # NEW
│   └── demo/
│       ├── DemoCard.vue                     # NEW
│       ├── DemoPlayersList.vue              # NEW
│       └── DemoStatsPreview.vue             # NEW
├── pages/
│   └── demos/
│       ├── DemosPage.vue                    # NEW
│       └── DemoDetailPage.vue               # NEW
└── router/
    └── index.ts                             # UPDATE (add routes)
e2e/
└── demos.spec.ts                            # NEW
```

## Phase 3 Completion Checklist

- [ ] Phases 1 and 2 are complete and tests pass
- [ ] `demos.ts` store created with all methods
- [ ] `DemoSelector.vue` component created and integrated
- [ ] "Browse Demos" tab enabled in `EvidenceAttachmentPanel`
- [ ] Selecting demo creates evidence link via `evidence.linkDemo()`
- [ ] Demo catalog page (`/demos`) works
- [ ] Demo detail page works
- [ ] E2E tests pass
- [ ] No TypeScript errors
- [ ] Build succeeds

## Final Integration Verification

After completing all 3 phases, verify the complete flow:

1. **Result Submission with Demo Evidence**
   - Navigate to match result submission
   - Enter scores
   - Click "Browse Demos" tab
   - Search and select a demo
   - Verify demo appears in attached evidence
   - Submit result
   - Verify evidence linked to result

2. **Demo Catalog Standalone**
   - Navigate to `/demos`
   - Search and filter demos
   - Click on demo card
   - View demo detail with players
   - Download demo

3. **Evidence Gallery**
   - Navigate to match Evidence tab
   - Verify linked demos appear
   - Click demo to preview/view details

## Notes

- The `DemoSelector` uses the existing `evidence.linkDemo()` method from Phase 2
- Demo catalog is both a standalone feature AND an evidence source
- Consider adding demo thumbnails/images for better UX
- Performance: lazy load demo stats, paginate player lists
