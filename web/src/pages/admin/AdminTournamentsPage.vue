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
              <template v-slot:item="{ item: _item, props: itemProps }">
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
              <v-img v-if="getGame(item.game_id)?.icon_url" :src="getGame(item.game_id)?.icon_url ?? undefined" />
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
          {{ item.starts_at ? formatShortDateTime(item.starts_at) : 'TBD' }}
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
    <ConfirmDialog
      :open="confirmDialog.open.value"
      :title="confirmDialog.title.value"
      :message="confirmDialog.message.value"
      :action-label="confirmDialog.actionLabel.value"
      :color="confirmDialog.color.value"
      :loading="confirmDialog.loading.value"
      :error="confirmDialog.dialogError.value"
      @clear-error="confirmDialog.dialogError.value = null"
      @confirm="confirmDialog.execute"
      @cancel="confirmDialog.cancel"
    />
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
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { formatShortDateTime } from '@/utils/formatters'

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

// Snackbar state
const snackbar = useSnackbar()

// Confirm dialog
const confirmDialog = useConfirmDialog()

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
  { value: 'registration', label: 'Registration Open' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'finalized', label: 'Finalized' },
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
        status: filters.value.status ?? undefined,
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
      confirmDialog.confirm({
        title: 'Publish Tournament',
        message: 'Are you sure you want to publish this tournament? It will become visible to the public.',
        action: 'Publish',
        color: 'primary',
        handler: async () => {
          await tournamentsStore.publishTournament(tournament.id)
          snackbar.show('Tournament published successfully', 'success')
          await fetchData()
        },
      })
      break
    case 'open-registration':
      confirmDialog.confirm({
        title: 'Open Registration',
        message: 'Are you sure you want to open registration for this tournament?',
        action: 'Open',
        color: 'success',
        handler: async () => {
          await tournamentsStore.openRegistration(tournament.id)
          snackbar.show('Registration opened successfully', 'success')
          await fetchData()
        },
      })
      break
    case 'close-registration':
      confirmDialog.confirm({
        title: 'Close Registration',
        message: 'Are you sure you want to close registration? No new participants will be able to register.',
        action: 'Close',
        color: 'warning',
        handler: async () => {
          await tournamentsStore.closeRegistration(tournament.id)
          snackbar.show('Registration closed successfully', 'success')
          await fetchData()
        },
      })
      break
    case 'start':
      confirmDialog.confirm({
        title: 'Start Tournament',
        message: 'Are you sure you want to start this tournament? This will generate the bracket and begin matches.',
        action: 'Start',
        color: 'primary',
        handler: async () => {
          await tournamentsStore.startTournament(tournament.id)
          snackbar.show('Tournament started successfully', 'success')
          await fetchData()
        },
      })
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
    case 'cancel':
      confirmDialog.confirm({
        title: 'Cancel Tournament',
        message: 'Are you sure you want to cancel this tournament? This action cannot be undone.',
        action: 'Cancel Tournament',
        color: 'error',
        handler: async () => {
          await tournamentsStore.cancelTournament(tournament.id)
          snackbar.show('Tournament cancelled', 'success')
          await fetchData()
        },
      })
      break
    case 'finalize':
      confirmDialog.confirm({
        title: 'Finalize Tournament',
        message: 'Are you sure you want to finalize this tournament? Results will be locked.',
        action: 'Finalize',
        color: 'success',
        handler: async () => {
          await tournamentsStore.finalizeTournament(tournament.id)
          snackbar.show('Tournament finalized', 'success')
          await fetchData()
        },
      })
      break
    case 'view-public':
      window.open(`/tournaments/${tournament.slug}`, '_blank')
      break
    case 'view-results':
    case 'view-details':
      router.push({ name: 'admin-tournament-detail', params: { id: tournament.id } })
      break
    default:
      snackbar.show(`Action "${action}" not implemented yet`, 'info')
  }
}

async function openEditModal(tournament: TournamentSummaryResponse) {
  try {
    selectedTournament.value = await tournamentsStore.fetchTournament(tournament.id)
    editModalOpen.value = true
  } catch {
    snackbar.show('Failed to load tournament details', 'error')
  }
}

// Modal callbacks
function onTournamentCreated() {
  snackbar.show('Tournament created successfully', 'success')
  fetchData()
}

function onTournamentSaved() {
  snackbar.show('Tournament updated successfully', 'success')
  fetchData()
}

onMounted(() => {
  fetchData()
})
</script>
