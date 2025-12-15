<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-6">
      <h1 class="text-h4">Tournaments</h1>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="createModalOpen = true">
        Create Tournament
      </v-btn>
    </div>

    <!-- Filters -->
    <v-card class="mb-4">
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
              :items="activeGames"
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
              v-model="filters.league_id"
              :items="availableLeagues"
              item-title="name"
              item-value="id"
              label="League"
              density="compact"
              variant="outlined"
              hide-details
              clearable
            >
              <template v-slot:item="{ item, props: itemProps }">
                <v-list-item v-bind="itemProps">
                  <template v-slot:prepend>
                    <v-icon size="small">mdi-trophy</v-icon>
                  </template>
                </v-list-item>
              </template>
            </v-select>
          </v-col>
          <v-col cols="12" md="2">
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
          <v-col cols="12" md="2" class="d-flex align-center">
            <v-btn
              color="primary"
              variant="tonal"
              prepend-icon="mdi-refresh"
              :loading="loading"
              block
              @click="fetchData"
            >
              Refresh
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Loading State -->
    <v-card v-if="loading && tournaments.length === 0" class="pa-8 text-center">
      <v-progress-circular indeterminate color="primary" size="48" />
      <p class="text-grey mt-4">Loading tournaments...</p>
    </v-card>

    <!-- Empty State -->
    <v-card v-else-if="filteredTournaments.length === 0" class="pa-8 text-center">
      <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-tournament</v-icon>
      <h3 class="text-h6 mb-2">No Tournaments Found</h3>
      <p class="text-grey mb-4">
        {{ tournaments.length === 0 ? 'Create your first tournament to get started.' : 'No tournaments match your filters.' }}
      </p>
      <v-btn v-if="tournaments.length === 0" color="primary" prepend-icon="mdi-plus" @click="createModalOpen = true">
        Create Tournament
      </v-btn>
      <v-btn v-else color="primary" variant="tonal" @click="clearFilters">
        Clear Filters
      </v-btn>
    </v-card>

    <!-- Tournaments Table -->
    <v-card v-else>
      <v-data-table
        :headers="headers"
        :items="filteredTournaments"
        :items-per-page="20"
        :loading="loading"
        class="elevation-0"
        density="comfortable"
        hover
        @click:row="(_e: Event, { item }: { item: TournamentSummaryResponse }) => openTournament(item)"
      >
        <template v-slot:item.logo_url="{ item }">
          <v-avatar size="36" rounded="sm">
            <v-img v-if="item.logo_url" :src="item.logo_url" />
            <v-icon v-else>mdi-tournament</v-icon>
          </v-avatar>
        </template>

        <template v-slot:item.name="{ item }">
          <div>
            <div class="font-weight-medium">{{ item.name }}</div>
            <div class="text-caption text-grey">{{ item.slug }}</div>
          </div>
        </template>

        <template v-slot:item.game_id="{ item }">
          <div class="d-flex align-center">
            <v-avatar size="20" rounded="sm" class="mr-2">
              <v-img v-if="getGame(item.game_id)?.icon_url" :src="getGame(item.game_id)?.icon_url" />
              <v-icon v-else size="14">mdi-gamepad-variant</v-icon>
            </v-avatar>
            <span>{{ getGame(item.game_id)?.display_name || 'Unknown' }}</span>
          </div>
        </template>

        <template v-slot:item.format="{ item }">
          <v-chip size="small" variant="tonal">
            {{ formatTournamentFormat(item.format) }}
          </v-chip>
        </template>

        <template v-slot:item.participant_type="{ item }">
          <v-icon size="small" class="mr-1">
            {{ item.participant_type === 'team' ? 'mdi-account-group' : 'mdi-account' }}
          </v-icon>
          {{ formatParticipantType(item.participant_type) }}
        </template>

        <template v-slot:item.max_participants="{ item }">
          {{ item.max_participants }}
        </template>

        <template v-slot:item.starts_at="{ item }">
          {{ item.starts_at ? formatDateTime(item.starts_at) : 'TBD' }}
        </template>

        <template v-slot:item.status="{ item }">
          <TournamentStatusChip :status="item.status" />
        </template>

        <template v-slot:item.actions="{ item }">
          <div @click.stop>
            <TournamentActionsMenu :tournament="item" @action="(action) => handleAction(item, action)" />
          </div>
        </template>

        <template v-slot:no-data>
          <div class="text-center pa-4">
            <p class="text-grey">No tournaments found</p>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <v-alert v-if="error" type="error" class="mt-4" closable @click:close="clearError">
      {{ error }}
    </v-alert>

    <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3000">
      {{ snackbarText }}
    </v-snackbar>

    <!-- Modals -->
    <TournamentCreateModal
      v-model="createModalOpen"
      :games="activeGames"
      :leagues="leaguesForModal"
      :seasons="seasonsForModal"
      @created="onTournamentCreated"
    />

    <TournamentEditModal
      v-model="editModalOpen"
      :tournament="selectedTournament"
      @saved="onTournamentSaved"
    />

    <!-- Confirm Dialog -->
    <v-dialog v-model="confirmDialogOpen" max-width="400" persistent>
      <v-card>
        <v-card-title>{{ confirmDialogTitle }}</v-card-title>
        <v-card-text>{{ confirmDialogMessage }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="confirmDialogOpen = false">Cancel</v-btn>
          <v-btn :color="confirmDialogColor" variant="flat" :loading="actionLoading" @click="executeConfirmedAction">
            {{ confirmDialogAction }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGamesStore, type GameSummary } from '@/stores/games'
import { useLeaguesStore } from '@/stores/leagues'
import { useLeagueSeasonsStore } from '@/stores/leagueSeasons'
import { useTournamentsStore, formatTournamentFormat, type TournamentSummaryResponse, type TournamentResponse } from '@/stores/tournaments'
import TournamentStatusChip from '@/components/admin/TournamentStatusChip.vue'
import TournamentActionsMenu from '@/components/admin/TournamentActionsMenu.vue'
import TournamentCreateModal from '@/components/admin/TournamentCreateModal.vue'
import TournamentEditModal from '@/components/admin/TournamentEditModal.vue'

const router = useRouter()
const gamesStore = useGamesStore()
const leaguesStore = useLeaguesStore()
const leagueSeasonsStore = useLeagueSeasonsStore()
const tournamentsStore = useTournamentsStore()

// Local state
const search = ref('')
const filters = ref<{ game_id?: string; league_id?: string; status?: string }>({})

// Modal state
const createModalOpen = ref(false)
const editModalOpen = ref(false)
const selectedTournament = ref<TournamentResponse | null>(null)

// Confirm dialog state
const confirmDialogOpen = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmDialogAction = ref('')
const confirmDialogColor = ref('primary')
const pendingAction = ref<{ tournament: TournamentSummaryResponse; action: string } | null>(null)
const actionLoading = ref(false)

// Snackbar state
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('success')

// Computed
const loading = computed(() => gamesStore.loading || tournamentsStore.loading || leaguesStore.loading)
const error = computed(() => gamesStore.error || tournamentsStore.error || leaguesStore.error)
const tournaments = computed(() => tournamentsStore.tournaments)

const activeGames = computed(() => gamesStore.games.filter((g) => g.status === 'active'))

// Leagues filtered by selected game (if any)
const availableLeagues = computed(() => {
  const leagues = leaguesStore.leagues.filter(l => l.status === 'active')
  if (filters.value.game_id) {
    return leagues.filter(l => l.game_id === filters.value.game_id)
  }
  return leagues
})

// All seasons for league dropdown
const allSeasons = computed(() => leagueSeasonsStore.seasons)

// Leagues for create modal (with game_id for filtering)
const leaguesForModal = computed(() =>
  leaguesStore.leagues
    .filter(l => l.status === 'active')
    .map(l => ({
      id: l.id,
      name: l.name,
      game_id: l.game_id,
      status: l.status,
    }))
)

// Seasons for create modal (with league_id for filtering)
const seasonsForModal = computed(() =>
  leagueSeasonsStore.seasons.map(s => ({
    id: s.id,
    name: s.name,
    league_id: s.league_id,
    status: s.status,
  }))
)

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'registration_open', label: 'Registration Open' },
  { value: 'registration_closed', label: 'Registration Closed' },
  { value: 'check_in_open', label: 'Check-in Open' },
  { value: 'ready', label: 'Ready' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const filteredTournaments = computed(() => {
  let result = tournaments.value

  // Apply search filter
  if (search.value) {
    const q = search.value.toLowerCase()
    result = result.filter(
      (t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q)
    )
  }

  // Apply game filter
  if (filters.value.game_id) {
    result = result.filter((t) => t.game_id === filters.value.game_id)
  }

  // Apply league filter (done server-side if possible, but also client-side for real-time filtering)
  // Note: tournament summary may not include league_id, so this is handled primarily in API call

  // Apply status filter
  if (filters.value.status) {
    result = result.filter((t) => t.status === filters.value.status)
  }

  return result
})

// Table headers
const headers = [
  { title: '', key: 'logo_url', width: '50px', sortable: false },
  { title: 'Name', key: 'name' },
  { title: 'Game', key: 'game_id', width: '150px' },
  { title: 'Format', key: 'format', width: '150px' },
  { title: 'Type', key: 'participant_type', width: '120px' },
  { title: 'Max', key: 'max_participants', width: '80px' },
  { title: 'Starts', key: 'starts_at', width: '150px' },
  { title: 'Status', key: 'status', width: '150px' },
  { title: '', key: 'actions', width: '50px', sortable: false },
]

// Helpers
function getGame(gameId: string): GameSummary | undefined {
  return gamesStore.games.find((g) => g.id === gameId)
}

function getLeague(leagueId: string | undefined) {
  if (!leagueId) return undefined
  return leaguesStore.leagues.find((l) => l.id === leagueId)
}

function formatParticipantType(type: string): string {
  switch (type) {
    case 'individual':
      return 'Solo'
    case 'team':
      return 'Team'
    case 'adhoc':
      return 'Ad-hoc'
    default:
      return type
  }
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function clearFilters() {
  search.value = ''
  filters.value = {}
}

function clearError() {
  tournamentsStore.error = null
  gamesStore.error = null
  leaguesStore.error = null
}

// Data fetching
async function fetchData() {
  try {
    await Promise.all([
      tournamentsStore.fetchTournaments({
        game_id: filters.value.game_id,
        league_id: filters.value.league_id,
        status: filters.value.status,
      }),
      gamesStore.fetchGames(),
      leaguesStore.fetchLeagues(1, 100), // Fetch all leagues for dropdown
    ])
  } catch {
    // Errors are captured in stores
  }
}

// Fetch seasons when a league is selected in filters
watch(() => filters.value.league_id, async (leagueId) => {
  if (leagueId) {
    try {
      await leagueSeasonsStore.fetchSeasons(leagueId)
    } catch {
      // Silently fail
    }
  }
})

// Navigation
function openTournament(tournament: TournamentSummaryResponse) {
  router.push({ name: 'admin-tournament-detail', params: { id: tournament.id } })
}

// Action handlers
async function handleAction(tournament: TournamentSummaryResponse, action: string) {
  switch (action) {
    case 'edit':
      await openEditModal(tournament)
      break
    case 'publish':
      confirmAction(tournament, action, 'Publish Tournament', 'Are you sure you want to publish this tournament? It will become visible to the public.', 'Publish', 'primary')
      break
    case 'open-registration':
      confirmAction(tournament, action, 'Open Registration', 'Are you sure you want to open registration for this tournament?', 'Open', 'success')
      break
    case 'close-registration':
      confirmAction(tournament, action, 'Close Registration', 'Are you sure you want to close registration? No new participants will be able to register.', 'Close', 'warning')
      break
    case 'start':
      confirmAction(tournament, action, 'Start Tournament', 'Are you sure you want to start this tournament? This will generate the bracket and begin matches.', 'Start', 'primary')
      break
    case 'view-registrations':
      router.push({ name: 'admin-tournament-detail', params: { id: tournament.id }, query: { tab: 'registrations' } })
      break
    case 'view-bracket':
      router.push({ name: 'admin-tournament-detail', params: { id: tournament.id }, query: { tab: 'bracket' } })
      break
    case 'manage-matches':
      router.push({ name: 'admin-tournament-detail', params: { id: tournament.id }, query: { tab: 'matches' } })
      break
    case 'view-public':
      window.open(`/tournaments/${tournament.slug}`, '_blank')
      break
    default:
      showSnackbar(`Action "${action}" not implemented yet`, 'info')
  }
}

function confirmAction(
  tournament: TournamentSummaryResponse,
  action: string,
  title: string,
  message: string,
  actionLabel: string,
  color: string
) {
  pendingAction.value = { tournament, action }
  confirmDialogTitle.value = title
  confirmDialogMessage.value = message
  confirmDialogAction.value = actionLabel
  confirmDialogColor.value = color
  confirmDialogOpen.value = true
}

async function executeConfirmedAction() {
  if (!pendingAction.value) return

  const { tournament, action } = pendingAction.value
  actionLoading.value = true

  try {
    switch (action) {
      case 'publish':
        await tournamentsStore.publishTournament(tournament.id)
        showSnackbar('Tournament published successfully', 'success')
        break
      case 'open-registration':
        await tournamentsStore.openRegistration(tournament.id)
        showSnackbar('Registration opened successfully', 'success')
        break
      case 'close-registration':
        await tournamentsStore.closeRegistration(tournament.id)
        showSnackbar('Registration closed successfully', 'success')
        break
      case 'start':
        await tournamentsStore.startTournament(tournament.id)
        showSnackbar('Tournament started successfully', 'success')
        break
    }
    confirmDialogOpen.value = false
    await fetchData()
  } catch {
    showSnackbar(tournamentsStore.error || 'Action failed', 'error')
  } finally {
    actionLoading.value = false
    pendingAction.value = null
  }
}

async function openEditModal(tournament: TournamentSummaryResponse) {
  try {
    selectedTournament.value = await tournamentsStore.fetchTournament(tournament.id)
    editModalOpen.value = true
  } catch {
    showSnackbar('Failed to load tournament details', 'error')
  }
}

// Modal callbacks
function onTournamentCreated() {
  showSnackbar('Tournament created successfully', 'success')
  fetchData()
}

function onTournamentSaved() {
  showSnackbar('Tournament updated successfully', 'success')
  fetchData()
}

function showSnackbar(text: string, color: string) {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
}

onMounted(() => {
  fetchData()
})
</script>
