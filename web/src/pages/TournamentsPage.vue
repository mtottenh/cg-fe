<template>
  <v-container>
    <!-- Header -->
    <div class="d-flex justify-space-between align-center mb-6">
      <div>
        <h1 class="text-h3 font-weight-bold">Tournaments</h1>
        <p class="text-subtitle-1 text-grey">Find and join competitive tournaments</p>
      </div>
    </div>

    <!-- Filters -->
    <v-card class="mb-6" variant="outlined">
      <v-card-text>
        <v-row>
          <v-col cols="12" md="4">
            <v-text-field
              v-model="search"
              prepend-inner-icon="mdi-magnify"
              label="Search tournaments..."
              single-line
              hide-details
              density="compact"
              variant="outlined"
              clearable
            />
          </v-col>
          <v-col cols="12" md="3">
            <v-select
              v-model="filters.game_id"
              :items="games"
              item-title="display_name"
              item-value="id"
              label="Game"
              density="compact"
              variant="outlined"
              hide-details
              clearable
            >
              <template v-slot:item="{ item, props: itemProps }">
                <v-list-item v-bind="itemProps">
                  <template v-slot:prepend>
                    <v-avatar size="24" rounded="sm">
                      <v-img v-if="item.raw.icon_url" :src="item.raw.icon_url" />
                      <v-icon v-else size="16">mdi-gamepad-variant</v-icon>
                    </v-avatar>
                  </template>
                </v-list-item>
              </template>
            </v-select>
          </v-col>
          <v-col cols="12" md="3">
            <v-select
              v-model="filters.status"
              :items="statusOptions"
              item-title="label"
              item-value="value"
              label="Status"
              density="compact"
              variant="outlined"
              hide-details
              clearable
            />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Status Tabs -->
    <v-tabs v-model="activeTab" class="mb-4" color="primary">
      <v-tab value="all">All</v-tab>
      <v-tab value="registration_open">
        <v-icon start size="small">mdi-account-plus</v-icon>
        Open Registration
      </v-tab>
      <v-tab value="in_progress">
        <v-icon start size="small">mdi-play-circle</v-icon>
        Live
      </v-tab>
      <v-tab value="upcoming">
        <v-icon start size="small">mdi-calendar</v-icon>
        Upcoming
      </v-tab>
      <v-tab value="completed">
        <v-icon start size="small">mdi-trophy</v-icon>
        Completed
      </v-tab>
    </v-tabs>

    <!-- Loading State -->
    <div v-if="loading" class="text-center pa-8">
      <v-progress-circular indeterminate color="primary" size="48" />
      <p class="text-grey mt-4">Loading tournaments...</p>
    </div>

    <!-- Empty State -->
    <v-card v-else-if="filteredTournaments.length === 0" class="pa-8 text-center" variant="outlined">
      <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-tournament</v-icon>
      <h3 class="text-h6 mb-2">No Tournaments Found</h3>
      <p class="text-grey">
        {{ tournaments.length === 0 ? 'Check back later for upcoming tournaments.' : 'No tournaments match your filters.' }}
      </p>
      <v-btn v-if="tournaments.length > 0" color="primary" variant="tonal" class="mt-4" @click="clearFilters">
        Clear Filters
      </v-btn>
    </v-card>

    <!-- Tournament Grid -->
    <v-row v-else>
      <v-col
        v-for="tournament in filteredTournaments"
        :key="tournament.id"
        cols="12"
        sm="6"
        md="4"
        lg="3"
      >
        <TournamentCard :tournament="tournament" @click="openTournament(tournament)" />
      </v-col>
    </v-row>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="d-flex justify-center mt-6">
      <v-pagination
        v-model="page"
        :length="totalPages"
        :total-visible="5"
        rounded
        @update:model-value="fetchData"
      />
    </div>

    <v-alert v-if="error" type="error" class="mt-4" closable @click:close="clearError">
      {{ error }}
    </v-alert>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGamesStore } from '@/stores/games'
import { useTournamentsStore, type TournamentSummaryResponse } from '@/stores/tournaments'
import TournamentCard from '@/components/tournament/TournamentCard.vue'

const router = useRouter()
const gamesStore = useGamesStore()
const tournamentsStore = useTournamentsStore()

// State
const search = ref('')
const activeTab = ref('all')
const page = ref(1)
const filters = ref<{ game_id?: string; status?: string }>({})

// Computed
const loading = computed(() => tournamentsStore.loading || gamesStore.loading)
const error = computed(() => tournamentsStore.error)
const tournaments = computed(() => tournamentsStore.tournaments)
const games = computed(() => gamesStore.games.filter((g) => g.status === 'active'))
const totalPages = computed(() => tournamentsStore.pagination.total_pages || 1)

const statusOptions = [
  { value: 'registration_open', label: 'Open Registration' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
]

// Apply tab-based filtering
const tabFilteredTournaments = computed(() => {
  let result = tournaments.value

  switch (activeTab.value) {
    case 'registration_open':
      result = result.filter((t) => t.status === 'registration_open' || t.is_registration_open)
      break
    case 'in_progress':
      result = result.filter((t) => t.status === 'in_progress')
      break
    case 'upcoming':
      result = result.filter((t) =>
        ['draft', 'published', 'registration_open', 'registration_closed', 'ready'].includes(t.status)
      )
      break
    case 'completed':
      result = result.filter((t) => t.status === 'completed')
      break
  }

  return result
})

// Apply search and other filters
const filteredTournaments = computed(() => {
  let result = tabFilteredTournaments.value

  if (search.value) {
    const q = search.value.toLowerCase()
    result = result.filter((t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q))
  }

  if (filters.value.game_id) {
    result = result.filter((t) => t.game_id === filters.value.game_id)
  }

  if (filters.value.status) {
    result = result.filter((t) => t.status === filters.value.status)
  }

  return result
})

function clearFilters() {
  search.value = ''
  filters.value = {}
  activeTab.value = 'all'
}

function clearError() {
  tournamentsStore.error = null
}

function openTournament(tournament: TournamentSummaryResponse) {
  router.push({ name: 'tournament-detail', params: { slug: tournament.slug } })
}

async function fetchData() {
  try {
    await Promise.all([
      tournamentsStore.fetchTournaments({
        page: page.value,
        per_page: 20,
      }),
      gamesStore.fetchGames(),
    ])
  } catch {
    // Errors are captured in stores
  }
}

// Refetch when tab changes (for server-side filtering in the future)
watch(activeTab, () => {
  page.value = 1
})

onMounted(() => {
  fetchData()
})
</script>
