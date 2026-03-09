<template>
  <v-container class="py-8">
    <div class="d-flex justify-space-between align-center mb-6">
      <h1 class="text-h3">Players</h1>
      <v-chip color="info" variant="tonal" size="small">
        {{ playersStore.pagination.total_items }} total
      </v-chip>
    </div>

    <!-- Search and Filters -->
    <v-card class="mb-4">
      <v-card-text>
        <v-row align="center">
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
              :loading="playersStore.fetchPlayersState.loading"
            />
          </v-col>

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

          <v-col cols="12" md="3">
            <v-select
              v-model="gameFilter"
              :items="gamesStore.games"
              item-title="display_name"
              item-value="id"
              label="Game"
              prepend-inner-icon="mdi-gamepad-variant"
              density="compact"
              variant="outlined"
              clearable
              hide-details
              :loading="gamesStore.loading"
            />
          </v-col>

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
            />
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
          <v-chip
            v-if="gameFilter"
            size="small"
            closable
            @click:close="gameFilter = null"
          >
            Game: {{ gamesStore.games.find(g => g.id === gameFilter)?.display_name || gameFilter }}
          </v-chip>
          <v-chip
            v-if="teamStatusFilter"
            size="small"
            closable
            @click:close="teamStatusFilter = null"
          >
            Team: {{ teamStatusOptions.find(o => o.value === teamStatusFilter)?.title || teamStatusFilter }}
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

    <!-- Loading State (initial load only) -->
    <v-card v-if="playersStore.fetchPlayersState.loading && playersStore.players.length === 0" class="pa-8 text-center">
      <v-progress-circular indeterminate color="primary" size="48" />
      <p class="text-grey mt-4">Loading players...</p>
    </v-card>

    <!-- Players Table -->
    <v-card v-else>
      <v-overlay
        :model-value="playersStore.fetchPlayersState.loading && playersStore.players.length > 0"
        contained
        class="align-center justify-center"
        scrim="rgba(0,0,0,0.3)"
      >
        <v-progress-circular indeterminate color="primary" />
      </v-overlay>

      <v-data-table
        :headers="headers"
        :items="playersStore.players"
        :items-per-page="playersStore.pagination.per_page"
        class="elevation-0"
      >
        <template v-slot:item.avatar_url="{ item }">
          <v-avatar size="36" color="secondary">
            <v-img v-if="item.avatar_url" :src="item.avatar_url" />
            <span v-else class="text-body-2">{{ item.display_name.substring(0, 2).toUpperCase() }}</span>
          </v-avatar>
        </template>

        <template v-slot:item.display_name="{ item }">
          <router-link :to="`/players/${item.id}`" class="text-decoration-none font-weight-medium">
            {{ item.display_name }}
          </router-link>
        </template>

        <template v-slot:item.country_code="{ item }">
          <span v-if="item.country_code" class="text-uppercase font-weight-medium">
            {{ item.country_code }}
          </span>
          <span v-else class="text-grey">&mdash;</span>
        </template>

        <template v-slot:item.looking_for_team="{ item }">
          <v-chip v-if="item.looking_for_team" size="small" color="success" variant="tonal">
            LFT
          </v-chip>
        </template>

        <template v-slot:item.elo_current="{ item }">
          <span
            v-if="getDisplayStat(item, 'elo_current')"
            :style="getDisplayStatColor(item, 'elo_current') ? { color: getDisplayStatColor(item, 'elo_current') } : {}"
            class="font-weight-bold"
          >
            {{ getDisplayStat(item, 'elo_current') }}
          </span>
          <span v-else class="text-grey">&mdash;</span>
        </template>

        <template v-slot:item.elo_peak="{ item }">
          <span v-if="getDisplayStat(item, 'elo_peak')" class="font-weight-bold">
            {{ getDisplayStat(item, 'elo_peak') }}
          </span>
          <span v-else class="text-grey">&mdash;</span>
        </template>

        <template v-slot:item.win_rate="{ item }">
          <span v-if="getDisplayStat(item, 'win_rate')">
            {{ getDisplayStat(item, 'win_rate') }}
          </span>
          <span v-else class="text-grey">&mdash;</span>
        </template>

        <template v-slot:no-data>
          <div class="text-center pa-8">
            <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-account-search-outline</v-icon>
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
              :length="playersStore.pagination.total_pages"
              :total-visible="7"
              @update:model-value="goToPage"
            />
          </div>
          <div class="text-center text-caption text-grey pb-2">
            Showing {{ playersStore.players.length }} of {{ playersStore.pagination.total_items }} players
          </div>
        </template>
      </v-data-table>
    </v-card>

    <v-alert v-if="playersStore.fetchPlayersState.error" type="error" class="mt-4" closable>
      {{ playersStore.fetchPlayersState.error }}
    </v-alert>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { usePlayersStore, type PlayerSearchResult } from '@/stores/players'
import { useGamesStore } from '@/stores/games'

const playersStore = usePlayersStore()
const gamesStore = useGamesStore()

// Filters
const search = ref('')
const countryFilter = ref('')
const gameFilter = ref<string | null>(null)
const teamStatusFilter = ref<string | null>(null)
const currentPage = ref(1)

const teamStatusOptions = [
  { title: 'On a team', value: 'has_team' },
  { title: 'Looking for team', value: 'lft' },
  { title: 'No team', value: 'no_team' },
]

const hasActiveFilters = computed(() => {
  return !!search.value || !!countryFilter.value || !!gameFilter.value || !!teamStatusFilter.value
})

// Table headers
const headers = [
  { title: '', key: 'avatar_url', width: '60px', sortable: false },
  { title: 'Display Name', key: 'display_name' },
  { title: 'Country', key: 'country_code', width: '100px' },
  { title: 'LFT', key: 'looking_for_team', width: '80px', sortable: false },
  { title: 'CS Rating', key: 'elo_current', width: '130px', sortable: false },
  { title: 'Peak Rating', key: 'elo_peak', width: '130px', sortable: false },
  { title: 'Win Rate', key: 'win_rate', width: '100px', sortable: false },
]

function buildFilters() {
  return {
    q: search.value || undefined,
    country_code: countryFilter.value?.toUpperCase() || undefined,
    game_id: gameFilter.value || undefined,
    team_status: teamStatusFilter.value || undefined,
    page: currentPage.value,
    per_page: 20,
  }
}

function fetchPlayers() {
  playersStore.fetchPlayers(buildFilters())
}

function goToPage(page: number) {
  currentPage.value = page
  fetchPlayers()
}

function getDisplayStat(item: PlayerSearchResult, key: string): string | null {
  return item.display_stats?.find(s => s.key === key)?.value ?? null
}

function getDisplayStatColor(item: PlayerSearchResult, key: string): string | undefined {
  return item.display_stats?.find(s => s.key === key)?.color ?? undefined
}

function clearAllFilters() {
  search.value = ''
  countryFilter.value = ''
  gameFilter.value = null
  teamStatusFilter.value = null
}

// Debounced search — reset to page 1
watchDebounced(
  search,
  () => {
    currentPage.value = 1
    fetchPlayers()
  },
  { debounce: 300 }
)

// Immediate filter changes — reset to page 1
watch([countryFilter, gameFilter, teamStatusFilter], () => {
  currentPage.value = 1
  fetchPlayers()
})

onMounted(() => {
  gamesStore.fetchGames()
  fetchPlayers()
})
</script>
