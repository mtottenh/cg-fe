<template>
  <v-container>
    <!-- Loading State -->
    <div v-if="loading && !tournament" class="text-center pa-8">
      <v-progress-circular indeterminate color="primary" size="48" />
      <p class="text-grey mt-4">Loading tournament...</p>
    </div>

    <!-- Content -->
    <template v-else-if="tournament">
      <!-- Header -->
      <TournamentHeader :tournament="tournament" :game="game" class="mb-6" />

      <!-- Organizer Toolbar (inline management for organizers) -->
      <OrganizerToolbar
        v-if="isOrganizer"
        :tournament="tournament"
        @edit="editModalOpen = true"
        @manage-registrations="activeTab = 'participants'"
        @action-complete="fetchData"
      />

      <!-- Registration Card (if applicable) -->
      <TournamentRegistrationCard
        v-if="showRegistrationCard"
        :tournament="tournament"
        :my-registration="myRegistration"
        :loading="registering"
        :has-eligible-teams="hasEligibleTeams"
        class="mb-6"
        @register="handleRegister"
        @withdraw="handleWithdraw"
        @check-in="handleCheckIn"
      />

      <!-- Tabs -->
      <v-card>
        <v-tabs v-model="activeTab" bg-color="transparent">
          <v-tab value="overview">Overview</v-tab>
          <v-tab value="participants">
            Participants
            <v-chip size="x-small" class="ml-2" variant="tonal">
              {{ registrations.length }}
            </v-chip>
          </v-tab>
          <v-tab value="bracket" :disabled="!hasBracket">Bracket</v-tab>
          <v-tab value="matches" :disabled="matches.length === 0">Matches</v-tab>
        </v-tabs>

        <v-divider />

        <v-tabs-window v-model="activeTab">
          <!-- Overview Tab -->
          <v-tabs-window-item value="overview">
            <v-card-text>
              <v-row>
                <v-col cols="12" md="8">
                  <!-- Description -->
                  <div v-if="tournament.description" class="mb-6">
                    <h3 class="text-h6 mb-3">About</h3>
                    <div class="text-body-1" style="white-space: pre-wrap">
                      {{ tournament.description }}
                    </div>
                  </div>

                  <!-- Rules -->
                  <div v-if="tournament.rules_url" class="mb-6">
                    <h3 class="text-h6 mb-3">Rules</h3>
                    <v-btn
                      :href="tournament.rules_url"
                      target="_blank"
                      variant="outlined"
                      prepend-icon="mdi-file-document"
                    >
                      View Tournament Rules
                    </v-btn>
                  </div>
                </v-col>

                <v-col cols="12" md="4">
                  <!-- Tournament Info Card -->
                  <v-card variant="outlined">
                    <v-card-title class="text-subtitle-1">Tournament Details</v-card-title>
                    <v-divider />
                    <v-list density="compact">
                      <v-list-item>
                        <template v-slot:prepend>
                          <v-icon size="small">mdi-tournament</v-icon>
                        </template>
                        <v-list-item-title>Format</v-list-item-title>
                        <v-list-item-subtitle>{{ formatLabel }}</v-list-item-subtitle>
                      </v-list-item>

                      <v-list-item>
                        <template v-slot:prepend>
                          <v-icon size="small">mdi-sword-cross</v-icon>
                        </template>
                        <v-list-item-title>Match Format</v-list-item-title>
                        <v-list-item-subtitle>{{ matchFormatLabel }}</v-list-item-subtitle>
                      </v-list-item>

                      <v-list-item>
                        <template v-slot:prepend>
                          <v-icon size="small">{{ participantIcon }}</v-icon>
                        </template>
                        <v-list-item-title>Participant Type</v-list-item-title>
                        <v-list-item-subtitle>{{ participantTypeLabel }}</v-list-item-subtitle>
                      </v-list-item>

                      <v-list-item>
                        <template v-slot:prepend>
                          <v-icon size="small">mdi-account-multiple</v-icon>
                        </template>
                        <v-list-item-title>Participants</v-list-item-title>
                        <v-list-item-subtitle>
                          {{ registrations.length }} / {{ tournament.max_participants }}
                        </v-list-item-subtitle>
                      </v-list-item>

                      <v-list-item v-if="tournament.registration_start">
                        <template v-slot:prepend>
                          <v-icon size="small">mdi-calendar-plus</v-icon>
                        </template>
                        <v-list-item-title>Registration Opens</v-list-item-title>
                        <v-list-item-subtitle>{{ formatDateTime(tournament.registration_start) }}</v-list-item-subtitle>
                      </v-list-item>

                      <v-list-item v-if="tournament.registration_end">
                        <template v-slot:prepend>
                          <v-icon size="small">mdi-calendar-remove</v-icon>
                        </template>
                        <v-list-item-title>Registration Closes</v-list-item-title>
                        <v-list-item-subtitle>{{ formatDateTime(tournament.registration_end) }}</v-list-item-subtitle>
                      </v-list-item>

                      <v-list-item v-if="tournament.starts_at">
                        <template v-slot:prepend>
                          <v-icon size="small">mdi-play</v-icon>
                        </template>
                        <v-list-item-title>Tournament Starts</v-list-item-title>
                        <v-list-item-subtitle>{{ formatDateTime(tournament.starts_at) }}</v-list-item-subtitle>
                      </v-list-item>

                      <v-list-item>
                        <template v-slot:prepend>
                          <v-icon size="small">mdi-clock</v-icon>
                        </template>
                        <v-list-item-title>Scheduling</v-list-item-title>
                        <v-list-item-subtitle>{{ schedulingModeLabel }}</v-list-item-subtitle>
                      </v-list-item>
                    </v-list>
                  </v-card>
                </v-col>
              </v-row>
            </v-card-text>
          </v-tabs-window-item>

          <!-- Participants Tab -->
          <v-tabs-window-item value="participants">
            <v-card-text>
              <v-data-table
                :headers="participantHeaders"
                :items="registrations"
                :loading="loading"
                density="comfortable"
              >
                <template v-slot:item.participant_logo_url="{ item }">
                  <v-avatar size="32" rounded="sm">
                    <v-img v-if="item.participant_logo_url" :src="item.participant_logo_url" />
                    <v-icon v-else>mdi-account</v-icon>
                  </v-avatar>
                </template>

                <template v-slot:item.participant_name="{ item }">
                  <div class="font-weight-medium">{{ item.participant_name }}</div>
                </template>

                <template v-slot:item.status="{ item }">
                  <v-chip size="small" variant="tonal" :color="registrationStatusColor(item.status)">
                    {{ registrationStatusLabel(item.status) }}
                  </v-chip>
                </template>

                <template v-slot:item.seed="{ item }">
                  <v-chip v-if="item.seed" size="small" variant="tonal">
                    #{{ item.seed }}
                  </v-chip>
                  <span v-else class="text-grey">-</span>
                </template>

                <template v-slot:item.checked_in="{ item }">
                  <v-icon v-if="item.checked_in" color="success" size="small">mdi-check-circle</v-icon>
                </template>

                <template v-if="isOrganizer" v-slot:item.actions="{ item }">
                  <div v-if="item.status === 'pending'" class="d-flex gap-1">
                    <v-btn
                      size="small"
                      color="success"
                      variant="tonal"
                      :loading="regActionLoadingId === item.id"
                      :disabled="regActionLoadingId !== null && regActionLoadingId !== item.id"
                      @click="handleApproveRegistration(item)"
                    >
                      Approve
                    </v-btn>
                    <v-btn
                      size="small"
                      color="error"
                      variant="tonal"
                      :disabled="regActionLoadingId !== null"
                      @click="handleRejectRegistration(item)"
                    >
                      Reject
                    </v-btn>
                  </div>
                  <span v-else class="text-grey text-caption">-</span>
                </template>

                <template v-slot:no-data>
                  <div class="text-center pa-4">
                    <p class="text-grey">No participants registered yet</p>
                  </div>
                </template>
              </v-data-table>
            </v-card-text>
          </v-tabs-window-item>

          <!-- Bracket Tab -->
          <v-tabs-window-item value="bracket">
            <v-card-text>
              <TournamentBracket
                :brackets="brackets"
                :matches="matches"
                @match-click="openMatch"
              />
            </v-card-text>
          </v-tabs-window-item>

          <!-- Matches Tab -->
          <v-tabs-window-item value="matches">
            <v-card-text>
              <v-row>
                <v-col
                  v-for="match in matches"
                  :key="match.id"
                  cols="12"
                  sm="6"
                  md="4"
                >
                  <TournamentMatchCard
                    :match="match"
                    @click="openMatch(match)"
                  />
                </v-col>
              </v-row>

              <div v-if="matches.length === 0" class="text-center pa-8">
                <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-sword-cross</v-icon>
                <h3 class="text-h6 mb-2">No Matches Yet</h3>
                <p class="text-grey">Matches will appear here once the tournament starts.</p>
              </div>
            </v-card-text>
          </v-tabs-window-item>
        </v-tabs-window>
      </v-card>
    </template>

    <!-- Not Found -->
    <v-card v-else-if="!loading" class="pa-8 text-center" variant="outlined">
      <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-alert-circle</v-icon>
      <h3 class="text-h6 mb-2">Tournament Not Found</h3>
      <p class="text-grey mb-4">The tournament you're looking for doesn't exist or has been removed.</p>
      <v-btn color="primary" :to="{ name: 'tournaments' }">
        Browse Tournaments
      </v-btn>
    </v-card>

    <v-alert v-if="error" type="error" class="mt-4" closable @click:close="clearError">
      {{ error }}
    </v-alert>

    <!-- Registration Modals -->
    <TeamRegistrationModal
      v-if="tournament"
      v-model="showTeamRegistrationModal"
      :tournament="tournament"
      :registrations="registrations"
      @register="handleTeamRegister"
    />

    <PlayerRegistrationModal
      v-if="tournament"
      v-model="showPlayerRegistrationModal"
      :tournament="tournament"
      @register="handlePlayerRegister"
    />

    <TournamentEditModal
      v-if="tournament"
      v-model="editModalOpen"
      :tournament="tournament"
      @saved="fetchData"
    />
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGamesStore, type GameSummary } from '@/stores/games'
import { useAuthStore } from '@/stores/auth'
import { useTournamentsStore, type TournamentMatchResponse } from '@/stores/tournaments'
import TournamentHeader from '@/components/tournament/TournamentHeader.vue'
import TournamentRegistrationCard from '@/components/tournament/TournamentRegistrationCard.vue'
import OrganizerToolbar from '@/components/tournament/OrganizerToolbar.vue'
import { useTournamentContext } from '@/composables/useTournamentContext'
import TournamentBracket from '@/components/tournament/TournamentBracket.vue'
import TournamentMatchCard from '@/components/tournament/TournamentMatchCard.vue'
import TeamRegistrationModal from '@/components/tournament/TeamRegistrationModal.vue'
import PlayerRegistrationModal from '@/components/tournament/PlayerRegistrationModal.vue'
import TournamentEditModal from '@/components/admin/TournamentEditModal.vue'
import { useLeagueTeamsStore } from '@/stores/leagueTeams'
import { useSnackbar } from '@/composables/useSnackbar'
import { formatDateTime } from '@/utils/formatters'
import { registrationStatusMap, getStatusColor, getStatusLabel } from '@/utils/statusMaps'

const route = useRoute()
const router = useRouter()
const gamesStore = useGamesStore()
const authStore = useAuthStore()
const tournamentsStore = useTournamentsStore()
const leagueTeamsStore = useLeagueTeamsStore()

// Computed (tournament must be declared before useTournamentContext)
const loading = computed(() => tournamentsStore.loading)
const error = computed(() => tournamentsStore.error)
const tournament = computed(() => tournamentsStore.currentTournament)

const {
  isOrganizer, isTeamTournament, myRegistration, hasEligibleTeams,
  loadOrganizerRoles,
} = useTournamentContext(tournament)

// State
const activeTab = ref('overview')
const registering = ref(false)
const snackbar = useSnackbar()
const showTeamRegistrationModal = ref(false)
const showPlayerRegistrationModal = ref(false)
const editModalOpen = ref(false)
const allRegistrations = computed(() => tournamentsStore.registrations)
const registrations = computed(() =>
  allRegistrations.value.filter((r) => r.status !== 'withdrawn' && r.status !== 'disqualified'),
)
const matches = computed(() => tournamentsStore.matches)
const brackets = computed(() => tournamentsStore.brackets)
const isAuthenticated = computed(() => authStore.isAuthenticated)

const game = computed<GameSummary | undefined>(() => {
  if (!tournament.value) return undefined
  return gamesStore.games.find((g) => g.id === tournament.value!.game_id)
})

const hasBracket = computed(() => brackets.value.length > 0 || matches.value.length > 0)

const showRegistrationCard = computed(() => {
  if (!tournament.value) return false
  const status = tournament.value.status
  // Show registration card for published tournaments onward (not drafts or completed/cancelled)
  return ['published', 'registration', 'scheduled', 'in_progress'].includes(status)
})

// Format helpers
const formatLabel = computed(() => {
  if (!tournament.value) return ''
  switch (tournament.value.format) {
    case 'single_elimination':
      return 'Single Elimination'
    case 'double_elimination':
      return 'Double Elimination'
    case 'round_robin':
      return 'Round Robin'
    case 'swiss':
      return 'Swiss'
    case 'groups_and_playoffs':
      return 'Groups & Playoffs'
    default:
      return tournament.value.format
  }
})

const matchFormatLabel = computed(() => {
  if (!tournament.value) return ''
  switch (tournament.value.default_match_format) {
    case 'bo1':
      return 'Best of 1'
    case 'bo3':
      return 'Best of 3'
    case 'bo5':
      return 'Best of 5'
    case 'bo7':
      return 'Best of 7'
    default:
      return tournament.value.default_match_format
  }
})

const participantIcon = computed(() => {
  if (!tournament.value) return 'mdi-account'
  return tournament.value.participant_type === 'team' ? 'mdi-account-group' : 'mdi-account'
})

const participantTypeLabel = computed(() => {
  if (!tournament.value) return ''
  if (tournament.value.participant_type === 'team') {
    return `Teams (${tournament.value.team_size} players)`
  }
  return 'Individuals'
})

const schedulingModeLabel = computed(() => {
  if (!tournament.value) return ''
  switch (tournament.value.scheduling_mode) {
    case 'live':
      return 'Live Event'
    case 'self_scheduled':
      return 'Self-Scheduled'
    case 'hybrid':
      return 'Hybrid'
    default:
      return tournament.value.scheduling_mode
  }
})

// Registration action state
const regActionLoadingId = ref<string | null>(null)

// Table headers
const participantHeaders = computed(() => {
  const headers = [
    { title: '', key: 'participant_logo_url', width: '50px', sortable: false },
    { title: 'Participant', key: 'participant_name' },
    { title: 'Status', key: 'status', width: '120px' },
    { title: 'Seed', key: 'seed', width: '80px' },
    { title: 'Checked In', key: 'checked_in', width: '100px' },
  ]
  if (isOrganizer.value) {
    headers.push({ title: 'Actions', key: 'actions', width: '150px', sortable: false })
  }
  return headers
})

const registrationStatusColor = (status: string) => getStatusColor(registrationStatusMap, status)
const registrationStatusLabel = (status: string) => getStatusLabel(registrationStatusMap, status)

function clearError() {
  tournamentsStore.error = null
}

function openMatch(match: TournamentMatchResponse) {
  if (!tournament.value) return
  router.push({
    name: 'match-detail',
    params: {
      tournamentSlug: tournament.value.slug,
      matchId: match.id,
    },
  })
}

// Registration handlers
function handleRegister() {
  if (!tournament.value || !isAuthenticated.value) {
    router.push({ name: 'login', query: { redirect: route.fullPath } })
    return
  }

  // Open appropriate modal based on participant type
  if (isTeamTournament.value) {
    showTeamRegistrationModal.value = true
  } else {
    showPlayerRegistrationModal.value = true
  }
}

async function handleTeamRegister(teamSeasonId: string, participantName: string, participantLogoUrl?: string) {
  if (!tournament.value) return

  registering.value = true
  showTeamRegistrationModal.value = false
  try {
    await tournamentsStore.registerTeam(tournament.value.id, {
      team_season_id: teamSeasonId,
      participant_name: participantName,
      participant_logo_url: participantLogoUrl ?? null,
    })
    snackbar.show('Team registered successfully!', 'success')
    await fetchData()
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to register team', 'error')
  } finally {
    registering.value = false
  }
}

async function handlePlayerRegister(participantName: string) {
  if (!tournament.value) return

  registering.value = true
  showPlayerRegistrationModal.value = false
  try {
    await tournamentsStore.registerPlayer(tournament.value.id, {
      participant_name: participantName,
    })
    snackbar.show('Successfully registered!', 'success')
    await fetchData()
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to register', 'error')
  } finally {
    registering.value = false
  }
}

async function handleWithdraw() {
  if (!tournament.value || !myRegistration.value) return

  registering.value = true
  try {
    await tournamentsStore.withdrawFromTournament(tournament.value.id, myRegistration.value.id)
    snackbar.show('Successfully withdrawn', 'success')
    await fetchData()
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to withdraw', 'error')
  } finally {
    registering.value = false
  }
}

async function handleCheckIn() {
  if (!tournament.value || !myRegistration.value) return

  registering.value = true
  try {
    await tournamentsStore.checkIn(tournament.value.id, myRegistration.value.id)
    snackbar.show('Successfully checked in!', 'success')
    await fetchData()
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to check in', 'error')
  } finally {
    registering.value = false
  }
}

// Organizer registration actions
async function handleApproveRegistration(registration: { id: string; participant_name: string }) {
  if (!tournament.value) return
  regActionLoadingId.value = registration.id
  try {
    await tournamentsStore.approveRegistration(tournament.value.id, registration.id)
    snackbar.show(`${registration.participant_name} approved`, 'success')
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to approve registration', 'error')
  } finally {
    regActionLoadingId.value = null
  }
}

async function handleRejectRegistration(registration: { id: string; participant_name: string }) {
  if (!tournament.value) return
  regActionLoadingId.value = registration.id
  try {
    await tournamentsStore.rejectRegistration(tournament.value.id, registration.id)
    snackbar.show(`${registration.participant_name} rejected`, 'success')
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to reject registration', 'error')
  } finally {
    regActionLoadingId.value = null
  }
}

async function fetchData() {
  const slug = route.params.slug as string
  try {
    await tournamentsStore.fetchTournamentBySlug(slug)
    if (tournamentsStore.currentTournament) {
      const id = tournamentsStore.currentTournament.id
      const fetchPromises: Promise<unknown>[] = [
        tournamentsStore.fetchRegistrations(id),
        tournamentsStore.fetchMatches(id),
        tournamentsStore.fetchBrackets(id),
        gamesStore.fetchGames(),
      ]

      // Fetch user's teams for team tournaments when authenticated
      if (
        tournamentsStore.currentTournament.participant_type === 'team' &&
        authStore.isAuthenticated
      ) {
        fetchPromises.push(leagueTeamsStore.fetchMyTeams())
      }

      // Load organizer roles for non-admin users
      if (authStore.isAuthenticated) {
        fetchPromises.push(loadOrganizerRoles())
      }

      await Promise.all(fetchPromises)
    }
  } catch {
    // Errors captured in store
  }
}

// Watch for route changes
watch(
  () => route.params.slug,
  () => {
    fetchData()
  }
)

onMounted(() => {
  fetchData()
})
</script>
