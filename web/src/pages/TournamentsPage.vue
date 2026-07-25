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
          aria-label="Game"
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
          aria-label="Status"
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
    <v-row v-if="loading && filteredTournaments.length === 0">
      <v-col v-for="n in 8" :key="n" cols="12" sm="6" md="4" lg="3">
        <v-skeleton-loader type="card" />
      </v-col>
    </v-row>

    <!-- Empty State -->
    <EmptyState
      v-else-if="filteredTournaments.length === 0"
      icon="mdi-tournament"
      title="No Tournaments Found"
      :subtitle="hasActiveFilters ? 'No tournaments match your filters.' : 'Check back later for upcoming tournaments.'"
    >
      <template #action>
        <v-btn v-if="hasActiveFilters" color="primary" variant="tonal" class="mt-4" @click="clearFilters">
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
const { loading: tournamentsLoading, error } = storeToRefs(tournamentsStore)
const { loading: gamesLoading } = storeToRefs(gamesStore)
const loading = computed(() => tournamentsLoading.value || gamesLoading.value)
const games = computed(() => gamesStore.games.filter((g) => g.status === 'active'))

/**
 * The rows this page renders, and the page count that reaches the rest.
 *
 * These are page-local rather than `storeToRefs(tournamentsStore)` because a
 * multi-status tab issues one request per status (see `fetchData`), and the
 * store keeps only the LAST response. The merged result lives here.
 */
const items = ref<TournamentSummaryResponse[]>([])
const totalPages = ref(1)

const PER_PAGE = 20

/**
 * The generated status union, taken straight off the response DTO. Every status
 * literal in this file is annotated with it, so a status that the backend does
 * not have is a compile error instead of a filter that silently matches nothing
 * (the P-19 failure mode).
 */
type TournamentStatus = TournamentSummaryResponse['status']

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
const UPCOMING_TOURNAMENT_STATUSES: TournamentStatus[] = ['published', 'registration', 'scheduled']

/**
 * Terminal "it's over and there are results" statuses. `finalized` is the state
 * a tournament reaches after `completed` is verified, and it was missing here —
 * finalized tournaments vanished from the Completed tab.
 */
const FINISHED_TOURNAMENT_STATUSES: TournamentStatus[] = ['completed', 'finalized']

/**
 * Tab → the statuses the server must be asked for.
 *
 * Every tab predicate is a pure function of a single row, so restricting the
 * QUERY to the tab's statuses and letting the server paginate is exactly
 * equivalent to filtering the whole table — with the difference that every
 * matching row is now reachable through the pager. Filtering an already-fetched
 * page (what this page used to do) can only ever see 20 rows. See P-28.
 */
const TAB_STATUSES: Record<string, TournamentStatus[]> = {
  all: [],
  // `registration_open` is `status = registration` AND inside the registration
  // window. The status half is the server's; the window half is refined below.
  registration_open: ['registration'],
  in_progress: ['in_progress'],
  upcoming: UPCOMING_TOURNAMENT_STATUSES,
  completed: FINISHED_TOURNAMENT_STATUSES,
}

// Values MUST be real backend statuses: the select feeds `?status=`, which the
// API rejects with 400 for anything that is not a `TournamentStatus`. The
// annotation makes a stale literal a compile error rather than a dead filter.
const statusOptions: { value: TournamentStatus; label: string }[] = [
  { value: 'registration', label: 'Registration Open' },
  { value: 'scheduled', label: 'Starting Soon' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'finalized', label: 'Finalized' },
  { value: 'cancelled', label: 'Cancelled' },
]

/**
 * The statuses to ask the server for, given the tab and the status select.
 *
 * `null` means "the tab and the select contradict each other" (e.g. the
 * Completed tab with status=Registration Open): no row can satisfy both, so
 * there is nothing to fetch.
 */
const serverStatuses = computed<TournamentStatus[] | null>(() => {
  const tab = TAB_STATUSES[activeTab.value] ?? []
  const selected = statusOptions.find((o) => o.value === filters.value.status)?.value
  if (!selected) return tab
  if (tab.length === 0) return [selected]
  return tab.includes(selected) ? [selected] : null
})

const hasActiveFilters = computed(
  () => Boolean(search.value) || Boolean(filters.value.game_id) || Boolean(filters.value.status) || activeTab.value !== 'all',
)

/**
 * The only filtering left on the client, and the only one that is safe to do
 * here: `is_registration_open` is the backend's own predicate — status is
 * `registration` AND now is inside the registration window
 * (portal-domain/src/entities/tournament.rs:109-129) — and it has no query
 * parameter. It can only ever REMOVE rows from a page that the server already
 * narrowed to `status = registration`, so no tournament becomes unreachable:
 * every `registration` row still lands on exactly one page of the pager.
 */
const filteredTournaments = computed(() =>
  activeTab.value === 'registration_open'
    ? items.value.filter((t) => t.is_registration_open)
    : items.value,
)

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

/**
 * Mirror the server's ordering (`ORDER BY starts_at DESC NULLS LAST,
 * created_at DESC` — portal-db/src/adapters/tournament/tournament.rs:344) so a
 * merged multi-status page reads the same way a single-status one does.
 * `created_at` is not on the summary DTO, so name is the stable tie-break.
 */
function byStartsAtDesc(a: TournamentSummaryResponse, b: TournamentSummaryResponse): number {
  if (a.starts_at && b.starts_at) {
    if (a.starts_at !== b.starts_at) return a.starts_at < b.starts_at ? 1 : -1
    return a.name.localeCompare(b.name)
  }
  if (a.starts_at) return -1
  if (b.starts_at) return 1
  return a.name.localeCompare(b.name)
}

// Requests are serialised and stamped: two overlapping fetches would otherwise
// interleave their reads of the store's shared `pagination`, and a slow one
// could overwrite a newer result.
let fetchQueue: Promise<void> = Promise.resolve()
let fetchToken = 0

function fetchData(): Promise<void> {
  const run = fetchQueue.then(runFetch, runFetch)
  fetchQueue = run.catch(() => {})
  return run
}

async function runFetch(): Promise<void> {
  const token = ++fetchToken
  const statuses = serverStatuses.value

  if (statuses === null) {
    items.value = []
    totalPages.value = 1
    return
  }

  // The API's `status` filter takes exactly ONE status
  // (portal-api/src/handlers/tournaments/lifecycle.rs:229), so a tab that spans
  // several is issued as one request per status at the same page number and the
  // responses are merged. Page N of the tab is therefore page N of each status;
  // that is not a globally sorted page, but it is exhaustive — every row shows
  // up on exactly one page, which is the property the pager needs.
  const queries: Array<{ status?: TournamentStatus }> =
    statuses.length > 0 ? statuses.map((status) => ({ status })) : [{}]

  const merged = new Map<string, TournamentSummaryResponse>()
  let pages = 1

  try {
    for (const query of queries) {
      const rows = await tournamentsStore.fetchTournaments({
        ...query,
        game_id: filters.value.game_id || undefined,
        search: search.value || undefined,
        page: page.value,
        per_page: PER_PAGE,
      })
      if (token !== fetchToken) return
      for (const row of rows) merged.set(row.id, row)
      pages = Math.max(pages, tournamentsStore.pagination.total_pages || 1)
    }
  } catch {
    // Surfaced through the store's `error`, which drives <ErrorAlert>.
    return
  }

  items.value = [...merged.values()].sort(byStartsAtDesc)
  totalPages.value = pages
}

/**
 * Any filter change resets to page 1 and refetches. Search is debounced so a
 * burst of keystrokes costs one request.
 */
let searchDebounce: ReturnType<typeof setTimeout> | undefined

function refetchFromFirstPage() {
  if (page.value !== 1) {
    page.value = 1 // the `page` watcher fetches
  } else {
    fetchData()
  }
}

watch(search, () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(refetchFromFirstPage, 300)
})

watch([activeTab, filters], refetchFromFirstPage, { deep: true })

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
  // Games only feed the filter select, so they are fetched once — not on every
  // keystroke-triggered refetch.
  gamesStore.fetchGames().catch(() => {
    // Surfaced through the games store's own error state.
  })
  fetchData()
})
</script>
