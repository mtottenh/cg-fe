<template>
  <v-container>
    <!-- Header -->
    <div class="d-flex justify-space-between align-center mb-6">
      <div>
        <h1 class="text-h3 font-weight-bold">Tournaments</h1>
        <p class="text-subtitle-1 text-medium-emphasis">Find and join competitive tournaments</p>
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
                      <v-img alt="" v-if="item.raw.icon_url" :src="item.raw.icon_url" />
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

    <ErrorAlert :error="error" retryable @clear="clearError" @retry="fetchData" />

    <!-- Initial Load Skeleton -->
    <v-row v-if="loading && tournaments.length === 0">
      <v-col v-for="n in 8" :key="n" cols="12" sm="6" md="4" lg="3">
        <v-skeleton-loader type="card" />
      </v-col>
    </v-row>

    <!-- Empty State -->
    <EmptyState
      v-else-if="filteredTournaments.length === 0"
      icon="mdi-tournament"
      title="No Tournaments Found"
      :subtitle="tournaments.length === 0 ? 'Check back later for upcoming tournaments.' : 'No tournaments match your filters.'"
    >
      <template #action>
        <v-btn v-if="tournaments.length > 0" color="primary" variant="tonal" class="mt-4" @click="clearFilters">
          Clear Filters
        </v-btn>
      </template>
    </EmptyState>

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
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useGamesStore } from '@/stores/games'
import { useTournamentsStore, type TournamentSummaryResponse } from '@/stores/tournaments'
import TournamentCard from '@/components/tournament/TournamentCard.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import EmptyState from '@/components/EmptyState.vue'

const router = useRouter()
const route = useRoute()
const gamesStore = useGamesStore()
const tournamentsStore = useTournamentsStore()

// State — hydrated from the URL so filtered views are shareable and survive
// refresh (same pattern as LeaguesPage).
const VALID_TABS = ['all', 'registration_open', 'in_progress', 'upcoming', 'completed']
function queryString(key: string): string | undefined {
  const v = route.query[key]
  return typeof v === 'string' && v !== '' ? v : undefined
}

const search = ref(queryString('q') ?? '')
const activeTab = ref(VALID_TABS.includes(queryString('tab') ?? '') ? queryString('tab')! : 'all')
const page = ref(Number(queryString('page')) > 0 ? Number(queryString('page')) : 1)
const filters = ref<{ game_id?: string; status?: string }>({
  game_id: queryString('game'),
  status: queryString('status'),
})

// Store-backed reactive refs
const { tournaments, pagination } = storeToRefs(tournamentsStore)
const { loading: tournamentsLoading, error } = storeToRefs(tournamentsStore)
const { loading: gamesLoading } = storeToRefs(gamesStore)
const loading = computed(() => tournamentsLoading.value || gamesLoading.value)
const games = computed(() => gamesStore.games.filter((g) => g.status === 'active'))
const totalPages = computed(() => pagination.value.total_pages || 1)

/**
 * Statuses a tournament that has not started yet can be in.
 *
 * The real enum is `draft/published/registration/scheduled/in_progress/
 * completed/finalized/cancelled` — `TournamentStatus`
 * (portal-core/src/types/status.rs:118) and the `tournaments_check_status`
 * CHECK (migrations/0053_fix_tournament_status_constraint.sql).
 *
 * The "Upcoming" tab used to filter on
 * `['draft','published','registration_open','registration_closed','ready']`.
 * `registration_open`, `registration_closed` and `ready` are not tournament
 * statuses at all, so the tab matched almost nothing and rendered as a
 * permanent empty state — the primary discovery surface for tournaments that
 * have not started. See COVERAGE-PLAN.md §9b P-19.
 *
 * `draft` is deliberately excluded: a draft is unpublished and must not be
 * advertised on a public tab.
 */
const UPCOMING_TOURNAMENT_STATUSES = ['published', 'registration', 'scheduled']

/**
 * Terminal "it's over and there are results" statuses. `finalized` is the state
 * a tournament reaches after `completed` is verified, and it was missing here —
 * finalized tournaments vanished from the Completed tab.
 */
const FINISHED_TOURNAMENT_STATUSES = ['completed', 'finalized']

// Values MUST be real backend statuses: the select feeds a strict equality
// filter below, so a stale value silently yields zero results.
const statusOptions = [
  { value: 'registration', label: 'Registration Open' },
  { value: 'scheduled', label: 'Starting Soon' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'finalized', label: 'Finalized' },
  { value: 'cancelled', label: 'Cancelled' },
]

// Apply tab-based filtering
const tabFilteredTournaments = computed(() => {
  let result = tournaments.value

  switch (activeTab.value) {
    case 'registration_open':
      // `is_registration_open` is the backend's own predicate: status is
      // `registration` AND now is inside the registration window
      // (portal-domain/src/entities/tournament.rs:109-129). It is strictly
      // stronger than the `status === 'registration'` string compare this used
      // to lean on, and it matches what gates the card's "Register Now" CTA.
      result = result.filter((t) => t.is_registration_open)
      break
    case 'in_progress':
      result = result.filter((t) => t.status === 'in_progress')
      break
    case 'upcoming':
      result = result.filter((t) => UPCOMING_TOURNAMENT_STATUSES.includes(t.status))
      break
    case 'completed':
      result = result.filter((t) => FINISHED_TOURNAMENT_STATUSES.includes(t.status))
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

// Push UI state into the URL.
watch([search, activeTab, page, filters], () => {
  router.replace({
    query: {
      ...route.query,
      q: search.value || undefined,
      tab: activeTab.value === 'all' ? undefined : activeTab.value,
      game: filters.value.game_id || undefined,
      status: filters.value.status || undefined,
      page: page.value > 1 ? String(page.value) : undefined,
    },
  })
}, { deep: true })

// Accept external URL changes (nav from a game hub, back/forward).
watch(() => route.query, (q) => {
  const nextSearch = typeof q.q === 'string' ? q.q : ''
  const nextTab = typeof q.tab === 'string' && VALID_TABS.includes(q.tab) ? q.tab : 'all'
  const nextGame = typeof q.game === 'string' ? q.game : undefined
  const nextStatus = typeof q.status === 'string' ? q.status : undefined
  const nextPage = Number(q.page) > 0 ? Number(q.page) : 1

  if (nextSearch !== search.value) search.value = nextSearch
  if (nextTab !== activeTab.value) activeTab.value = nextTab
  if (nextGame !== filters.value.game_id || nextStatus !== filters.value.status) {
    filters.value = { game_id: nextGame, status: nextStatus }
  }
  if (nextPage !== page.value) page.value = nextPage
})

watch(page, () => {
  fetchData()
})

onMounted(() => {
  fetchData()
})
</script>
