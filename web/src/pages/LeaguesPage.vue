<template>
  <div>
    <v-row align="center" class="mb-6">
      <v-col>
        <h1 class="text-h3">Leagues</h1>
      </v-col>
    </v-row>

    <!-- Filters -->
    <v-row class="mb-4">
      <v-col cols="12" sm="6" md="3">
        <v-select
          v-model="selectedGameId"
          :items="gameOptions"
          item-title="display_name"
          item-value="id"
          label="Filter by Game"
          prepend-inner-icon="mdi-gamepad-variant"
          clearable
          @update:model-value="onGameFilterChange"
        />
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <v-text-field
          v-model="search"
          label="Search leagues"
          prepend-inner-icon="mdi-magnify"
          clearable
          @update:model-value="debouncedSearch"
        />
      </v-col>
    </v-row>

    <v-alert v-if="leaguesStore.error" type="error" class="mb-4" closable>
      {{ leaguesStore.error }}
    </v-alert>

    <v-progress-linear v-if="leaguesStore.loading" indeterminate class="mb-4" />

    <!-- League Cards Grid -->
    <v-row v-if="leaguesStore.leagues.length > 0">
      <v-col v-for="league in leaguesStore.leagues" :key="league.id" cols="12" sm="6" md="4" lg="3">
        <v-card :to="`/leagues/${league.id}`" class="h-100">
          <v-card-item>
            <template v-slot:prepend>
              <v-avatar color="primary" size="48" rounded="lg">
                <v-img v-if="league.logo_url" :src="league.logo_url" />
                <v-icon v-else>mdi-trophy</v-icon>
              </v-avatar>
            </template>
            <v-card-title>{{ league.name }}</v-card-title>
            <v-card-subtitle>
              <v-chip size="x-small" variant="tonal" class="mr-1">
                {{ getGameName(league.game_id) }}
              </v-chip>
            </v-card-subtitle>
          </v-card-item>
          <v-card-text v-if="league.description" class="text-truncate">
            {{ league.description }}
          </v-card-text>
          <v-card-actions>
            <v-chip size="small" :color="league.status === 'active' ? 'success' : 'grey'" variant="tonal">
              {{ league.status }}
            </v-chip>
            <v-chip size="small" :color="getAccessTypeColor(league.access_type)" variant="tonal" class="ml-1">
              {{ getAccessTypeLabel(league.access_type) }}
            </v-chip>
            <v-chip v-if="isMyLeague(league.id)" size="small" color="primary" variant="flat" class="ml-1">
              Member
            </v-chip>
            <v-spacer />
            <v-icon size="small">mdi-chevron-right</v-icon>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <!-- Empty State -->
    <v-row v-else-if="!leaguesStore.loading">
      <v-col cols="12" class="text-center py-12">
        <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-trophy-outline</v-icon>
        <h3 class="text-h5 text-medium-emphasis mb-2">No Leagues Found</h3>
        <p class="text-body-2 text-medium-emphasis">
          {{ search || selectedGameId ? 'Try different filters' : 'No leagues available yet' }}
        </p>
      </v-col>
    </v-row>

    <!-- Pagination -->
    <v-row v-if="leaguesStore.pagination.total_pages > 1" class="mt-4">
      <v-col cols="12" class="d-flex justify-center">
        <v-pagination
          v-model="currentPage"
          :length="leaguesStore.pagination.total_pages"
          @update:model-value="onPageChange"
        />
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLeaguesStore } from '@/stores/leagues'
import { useGamesStore } from '@/stores/games'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const leaguesStore = useLeaguesStore()
const gamesStore = useGamesStore()
const authStore = useAuthStore()

const search = ref('')
const selectedGameId = ref<string | null>(null)
const currentPage = ref(1)
let searchTimeout: number | null = null

const gameOptions = computed(() => gamesStore.games.filter(g => g.status === 'active'))

// Initialize from URL query params
onMounted(async () => {
  // Load games for the filter dropdown
  await gamesStore.fetchGames()

  // Read initial filters from URL
  if (route.query.game) {
    selectedGameId.value = route.query.game as string
  }
  if (route.query.search) {
    search.value = route.query.search as string
  }
  if (route.query.page) {
    currentPage.value = parseInt(route.query.page as string) || 1
  }

  if (authStore.isAuthenticated) {
    leaguesStore.fetchMyLeagues().catch(() => {})
  }

  await loadLeagues()
})

// Watch for route query changes (e.g., from game hub navigation)
watch(() => route.query.game, (newGame) => {
  if (newGame !== selectedGameId.value) {
    selectedGameId.value = newGame as string | null
    currentPage.value = 1
    loadLeagues()
  }
})

async function loadLeagues() {
  try {
    await leaguesStore.fetchLeagues(currentPage.value, 20, selectedGameId.value || undefined, search.value || undefined)
  } catch {
    // Error already captured in leaguesStore.error via fetchLeaguesState
  }
}

function onGameFilterChange() {
  currentPage.value = 1
  updateUrlParams()
  loadLeagues()
}

function onPageChange(page: number) {
  currentPage.value = page
  updateUrlParams()
  loadLeagues()
}

function debouncedSearch() {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
  searchTimeout = window.setTimeout(async () => {
    currentPage.value = 1
    updateUrlParams()
    await loadLeagues()
  }, 300)
}

function updateUrlParams() {
  const query: Record<string, string> = {}
  if (selectedGameId.value) {
    query.game = selectedGameId.value
  }
  if (search.value) {
    query.search = search.value
  }
  if (currentPage.value > 1) {
    query.page = currentPage.value.toString()
  }
  router.replace({ query })
}

function getGameName(gameId: string): string {
  const game = gamesStore.games.find(g => g.id === gameId)
  return game?.display_name || game?.slug || 'Unknown'
}

function getAccessTypeLabel(type: string): string {
  switch (type) {
    case 'open': return 'Open'
    case 'application': return 'Apply'
    case 'invite_only': return 'Invite Only'
    default: return type
  }
}

function getAccessTypeColor(type: string): string {
  switch (type) {
    case 'open': return 'success'
    case 'application': return 'warning'
    case 'invite_only': return 'grey'
    default: return 'grey'
  }
}

function isMyLeague(leagueId: string): boolean {
  return leaguesStore.myLeagues.some(m => m.league_id === leagueId)
}
</script>
