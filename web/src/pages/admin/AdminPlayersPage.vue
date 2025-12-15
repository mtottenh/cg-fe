<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-6">
      <h1 class="text-h4">Players</h1>
      <v-chip color="info" variant="tonal" size="small">
        {{ pagination.total_items }} total
      </v-chip>
    </div>

    <!-- Search and Filters -->
    <v-card class="mb-4">
      <v-card-text>
        <v-row align="center">
          <!-- Search Input - Reactive -->
          <v-col cols="12" md="4">
            <v-text-field
              v-model="search"
              prepend-inner-icon="mdi-magnify"
              label="Search by display name..."
              single-line
              hide-details
              density="compact"
              variant="outlined"
              clearable
              :loading="loading"
            />
          </v-col>

          <!-- Country Filter -->
          <v-col cols="12" md="2">
            <v-text-field
              v-model="countryFilter"
              prepend-inner-icon="mdi-earth"
              label="Country code"
              placeholder="US, DE, FR..."
              single-line
              hide-details
              density="compact"
              variant="outlined"
              clearable
              maxlength="2"
            />
          </v-col>

          <!-- Game Filter (UI placeholder - requires backend) -->
          <v-col cols="12" md="3">
            <v-select
              v-model="gameFilter"
              :items="games"
              item-title="name"
              item-value="id"
              label="Game"
              prepend-inner-icon="mdi-gamepad-variant"
              density="compact"
              variant="outlined"
              clearable
              hide-details
              :loading="loadingGames"
              disabled
            >
              <template v-slot:prepend-item>
                <v-list-item density="compact">
                  <v-list-item-subtitle class="text-caption text-warning">
                    Filter requires backend support
                  </v-list-item-subtitle>
                </v-list-item>
                <v-divider />
              </template>
            </v-select>
          </v-col>

          <!-- Team Status Filter (UI placeholder - requires backend) -->
          <v-col cols="12" md="3">
            <v-select
              v-model="teamStatusFilter"
              :items="teamStatusOptions"
              label="Team Status"
              prepend-inner-icon="mdi-account-group"
              density="compact"
              variant="outlined"
              clearable
              hide-details
              disabled
            >
              <template v-slot:prepend-item>
                <v-list-item density="compact">
                  <v-list-item-subtitle class="text-caption text-warning">
                    Filter requires backend support
                  </v-list-item-subtitle>
                </v-list-item>
                <v-divider />
              </template>
            </v-select>
          </v-col>
        </v-row>

        <!-- Active Filters Display -->
        <div v-if="hasActiveFilters" class="mt-3 d-flex align-center flex-wrap ga-2">
          <span class="text-caption text-grey mr-2">Active filters:</span>
          <v-chip
            v-if="search"
            size="small"
            closable
            @click:close="search = ''"
          >
            Name: {{ search }}
          </v-chip>
          <v-chip
            v-if="countryFilter"
            size="small"
            closable
            @click:close="countryFilter = ''"
          >
            Country: {{ countryFilter }}
          </v-chip>
          <v-btn
            v-if="hasActiveFilters"
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

    <!-- Loading State (initial load only) -->
    <v-card v-if="loading && players.length === 0" class="pa-8 text-center">
      <v-progress-circular indeterminate color="primary" size="48" />
      <p class="text-grey mt-4">Loading players...</p>
    </v-card>

    <!-- Players Table -->
    <v-card v-else>
      <!-- Loading overlay for subsequent loads -->
      <v-overlay
        :model-value="loading && players.length > 0"
        contained
        class="align-center justify-center"
        scrim="rgba(0,0,0,0.3)"
      >
        <v-progress-circular indeterminate color="primary" />
      </v-overlay>

      <v-data-table
        :headers="headers"
        :items="filteredPlayers"
        :items-per-page="pagination.per_page"
        class="elevation-0"
      >
        <template v-slot:item.avatar_url="{ item }">
          <v-avatar size="36">
            <v-img v-if="item.avatar_url" :src="item.avatar_url" />
            <v-icon v-else>mdi-account</v-icon>
          </v-avatar>
        </template>

        <template v-slot:item.display_name="{ item }">
          <div>
            <div class="font-weight-medium">{{ item.display_name }}</div>
            <div class="text-caption text-grey">ID: {{ item.id.substring(0, 8) }}...</div>
          </div>
        </template>

        <template v-slot:item.country_code="{ item }">
          <span v-if="item.country_code" class="text-uppercase font-weight-medium">
            {{ item.country_code }}
          </span>
          <span v-else class="text-grey">-</span>
        </template>

        <template v-slot:item.actions="{ item }">
          <v-btn
            icon
            size="small"
            variant="text"
            @click="openPlayerDetail(item)"
            title="View Details"
          >
            <v-icon>mdi-eye</v-icon>
          </v-btn>
          <v-btn
            icon
            size="small"
            variant="text"
            :to="`/players/${item.id}`"
            title="Public Profile"
          >
            <v-icon>mdi-open-in-new</v-icon>
          </v-btn>
        </template>

        <template v-slot:no-data>
          <div class="text-center pa-8">
            <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-account-search</v-icon>
            <p class="text-grey">
              {{ hasActiveFilters ? 'No players found matching your filters' : 'No players found' }}
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
          <div class="text-center text-caption text-grey pb-2">
            Showing {{ filteredPlayers.length }} of {{ pagination.total_items }} players
          </div>
        </template>
      </v-data-table>
    </v-card>

    <v-alert v-if="error" type="error" class="mt-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <!-- Player Detail Modal -->
    <v-dialog v-model="detailModalOpen" max-width="700">
      <v-card v-if="selectedPlayer">
        <v-card-title class="d-flex justify-space-between align-center">
          <span>Player Details</span>
          <v-btn icon variant="text" @click="detailModalOpen = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>

        <v-divider />

        <v-card-text>
          <div v-if="loadingDetail" class="text-center pa-8">
            <v-progress-circular indeterminate color="primary" />
          </div>

          <template v-else-if="playerDetail">
            <!-- Profile Header -->
            <div class="d-flex align-center mb-4">
              <v-avatar size="80" class="mr-4">
                <v-img v-if="playerDetail.avatar_url" :src="playerDetail.avatar_url" />
                <v-icon v-else size="48">mdi-account</v-icon>
              </v-avatar>
              <div>
                <h3 class="text-h5">{{ playerDetail.display_name }}</h3>
                <div class="text-caption text-grey">{{ playerDetail.id }}</div>
                <v-chip
                  v-if="playerDetail.country_code"
                  size="small"
                  variant="tonal"
                  class="mt-1"
                >
                  {{ playerDetail.country_code }}
                </v-chip>
              </div>
            </div>

            <!-- Player Info -->
            <v-list density="compact" class="mb-4">
              <v-list-item>
                <template v-slot:prepend>
                  <v-icon>mdi-text</v-icon>
                </template>
                <v-list-item-title>Bio</v-list-item-title>
                <v-list-item-subtitle>{{ playerDetail.bio || 'No bio set' }}</v-list-item-subtitle>
              </v-list-item>
              <v-list-item v-if="playerDetail.timezone">
                <template v-slot:prepend>
                  <v-icon>mdi-clock-outline</v-icon>
                </template>
                <v-list-item-title>Timezone</v-list-item-title>
                <v-list-item-subtitle>{{ playerDetail.timezone }}</v-list-item-subtitle>
              </v-list-item>
              <v-list-item>
                <template v-slot:prepend>
                  <v-icon>mdi-calendar</v-icon>
                </template>
                <v-list-item-title>Joined</v-list-item-title>
                <v-list-item-subtitle>{{ formatDate(playerDetail.created_at) }}</v-list-item-subtitle>
              </v-list-item>
            </v-list>

            <!-- League Team Memberships -->
            <h4 class="text-subtitle-1 font-weight-medium mb-2">League Team Memberships</h4>
            <div v-if="loadingTeams" class="text-center pa-4">
              <v-progress-circular indeterminate color="primary" size="24" />
            </div>
            <v-list v-else-if="playerTeams.length > 0" density="compact">
              <v-list-item v-for="team in playerTeams" :key="team.team_id">
                <template v-slot:prepend>
                  <v-avatar size="32">
                    <v-img v-if="team.team_logo_url" :src="team.team_logo_url" />
                    <v-icon v-else size="20">mdi-account-group</v-icon>
                  </v-avatar>
                </template>
                <v-list-item-title>{{ team.team_name }} [{{ team.team_tag }}]</v-list-item-title>
                <v-list-item-subtitle>
                  {{ team.league_name }} - {{ team.season_name }}
                  <v-chip size="x-small" class="ml-2" :color="getRoleColor(team.role)">
                    {{ team.role }}
                  </v-chip>
                </v-list-item-subtitle>
              </v-list-item>
            </v-list>
            <p v-else class="text-grey text-center pa-4">No team memberships</p>
          </template>
        </v-card-text>

        <v-divider />

        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            :to="`/players/${selectedPlayer.id}`"
          >
            View Public Profile
          </v-btn>
          <v-btn variant="text" @click="detailModalOpen = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { api, ApiError } from '@/api'
import { useGamesStore } from '@/stores/games'
import type { components } from '@/api/types'

type PlayerSummary = components['schemas']['PlayerSearchResponse']
type PlayerDetail = components['schemas']['PlayerResponse']
type PlayerLeagueTeamMembership = components['schemas']['PlayerLeagueTeamMembershipResponse']
type PaginationMeta = components['schemas']['PaginationMeta']
type ApiErrorResponse = components['schemas']['ApiError']

// Stores
const gamesStore = useGamesStore()

// State
const players = ref<PlayerSummary[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const currentPage = ref(1)
const pagination = ref<PaginationMeta>({ page: 1, per_page: 20, total_items: 0, total_pages: 0 })

// Filters
const search = ref('')
const countryFilter = ref('')
const gameFilter = ref<string | null>(null)
const teamStatusFilter = ref<string | null>(null)

// Game and team status options (for future backend support)
const games = computed(() => gamesStore.games)
const loadingGames = computed(() => gamesStore.loading)
const teamStatusOptions = [
  { title: 'Any', value: null },
  { title: 'On a team', value: 'has_team' },
  { title: 'Looking for team', value: 'lft' },
  { title: 'No team', value: 'no_team' },
]

// Computed
const hasActiveFilters = computed(() => {
  return !!search.value || !!countryFilter.value || !!gameFilter.value || !!teamStatusFilter.value
})

// Client-side country filtering (until backend supports it)
const filteredPlayers = computed(() => {
  if (!countryFilter.value) return players.value
  const filter = countryFilter.value.toUpperCase()
  return players.value.filter(p => p.country_code?.toUpperCase() === filter)
})

// Detail modal
const detailModalOpen = ref(false)
const selectedPlayer = ref<PlayerSummary | null>(null)
const playerDetail = ref<PlayerDetail | null>(null)
const playerTeams = ref<PlayerLeagueTeamMembership[]>([])
const loadingDetail = ref(false)
const loadingTeams = ref(false)

// Table headers
const headers = [
  { title: '', key: 'avatar_url', width: '60px', sortable: false },
  { title: 'Display Name', key: 'display_name' },
  { title: 'Country', key: 'country_code', width: '100px' },
  { title: 'Actions', key: 'actions', width: '100px', sortable: false, align: 'center' as const },
]

// Helpers
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString()
}

function getRoleColor(role: string): string {
  switch (role) {
    case 'captain':
    case 'founder':
      return 'primary'
    case 'player':
      return 'success'
    case 'substitute':
      return 'info'
    default:
      return 'grey'
  }
}

function clearAllFilters() {
  search.value = ''
  countryFilter.value = ''
  gameFilter.value = null
  teamStatusFilter.value = null
}

// API calls
async function fetchPlayers(page = 1, searchQuery = '') {
  loading.value = true
  error.value = null

  try {
    const { data, error: apiError } = await api.GET('/v1/players', {
      params: { query: { page, per_page: 20, q: searchQuery || undefined } },
    })

    if (apiError) {
      const err = apiError as ApiErrorResponse
      throw new ApiError(err.status, err.detail, err.errors ?? undefined)
    }

    players.value = data!.data
    pagination.value = data!.pagination
    currentPage.value = page
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.detail
    } else {
      error.value = 'Failed to load players'
    }
  } finally {
    loading.value = false
  }
}

function goToPage(page: number) {
  fetchPlayers(page, search.value)
}

async function openPlayerDetail(player: PlayerSummary) {
  selectedPlayer.value = player
  playerDetail.value = null
  playerTeams.value = []
  detailModalOpen.value = true

  // Fetch details and teams in parallel
  loadingDetail.value = true
  loadingTeams.value = true

  try {
    const { data, error: apiError } = await api.GET('/v1/players/{player_id}', {
      params: { path: { player_id: player.id } },
    })

    if (apiError) {
      const err = apiError as ApiErrorResponse
      throw new ApiError(err.status, err.detail, err.errors ?? undefined)
    }

    playerDetail.value = data!.data
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.detail
    }
  } finally {
    loadingDetail.value = false
  }

  try {
    const { data, error: apiError } = await api.GET('/v1/players/{player_id}/league-teams', {
      params: { path: { player_id: player.id } },
    })

    if (apiError) {
      const err = apiError as ApiErrorResponse
      throw new ApiError(err.status, err.detail, err.errors ?? undefined)
    }

    playerTeams.value = data!.data
  } catch {
    // Non-critical error, just show empty teams
    playerTeams.value = []
  } finally {
    loadingTeams.value = false
  }
}

// Reactive search with debounce (300ms)
watchDebounced(
  search,
  (newSearch) => {
    currentPage.value = 1
    fetchPlayers(1, newSearch)
  },
  { debounce: 300 }
)

// Watch for page changes (without debounce)
watch(currentPage, (_newPage) => {
  // Only fetch if not triggered by search (search already fetches)
  // This is handled by goToPage, so this watcher is informational
})

onMounted(async () => {
  // Load games for filter dropdown (even if disabled for now)
  gamesStore.fetchGames()
  // Load initial players
  fetchPlayers()
})
</script>
