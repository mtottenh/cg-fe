<template>
  <v-container>
    <ErrorAlert :error="error" retryable @clear="clearError" @retry="fetchData" />

    <!-- Loading State -->
    <v-skeleton-loader v-if="loading && !tournament" type="article" class="mb-4" />

    <!-- Content -->
    <template v-else-if="tournament">
      <!-- Breadcrumb: the league → tournament chain is navigable upward -->
      <v-breadcrumbs :items="breadcrumbs" class="pa-0 mb-4" />

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
          <v-tab value="awards" data-testid="awards-tab">Awards</v-tab>
          <v-tab value="stats" data-testid="stats-tab">Stats</v-tab>
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

                  <!-- Rules (creator-supplied URL — only http/https ever
                       reaches the DOM) -->
                  <div v-if="isHttpUrl(tournament.rules_url)" class="mb-6">
                    <h3 class="text-h6 mb-3">Rules</h3>
                    <v-btn
                      :href="tournament.rules_url ?? undefined"
                      target="_blank"
                      rel="noopener noreferrer"
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
              <div class="table-scroll">
                <v-data-table
                  :headers="participantHeaders"
                  :items="registrations"
                  :loading="loading"
                  density="comfortable"
                >
                  <template v-slot:item.participant_logo_url="{ item }">
                    <v-avatar size="32" rounded="sm">
                      <v-img alt="" v-if="item.participant_logo_url" :src="item.participant_logo_url" />
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
                    <span v-else class="text-medium-emphasis">-</span>
                  </template>

                  <template v-slot:item.checked_in="{ item }">
                    <v-icon v-if="item.checked_in" color="success" size="small">mdi-check-circle</v-icon>
                  </template>

                  <template v-if="isOrganizer" v-slot:item.actions="{ item }">
                    <div v-if="item.status === 'pending'" class="d-flex ga-1">
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
                    <span v-else class="text-medium-emphasis text-caption">-</span>
                  </template>

                  <template v-slot:no-data>
                    <div class="text-center pa-4">
                      <p class="text-medium-emphasis">No participants registered yet</p>
                    </div>
                  </template>
                </v-data-table>
              </div>
            </v-card-text>
          </v-tabs-window-item>

          <!-- Bracket Tab -->
          <v-tabs-window-item value="bracket">
            <v-card-text>
              <TournamentBracket
                :brackets="brackets"
                :matches="matches"
                :highlight-registration-id="myRegistration?.id"
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

              <EmptyState
                v-if="matches.length === 0"
                icon="mdi-sword-cross"
                title="No Matches Yet"
                subtitle="Matches will appear here once the tournament starts."
                variant="text"
              />
            </v-card-text>
          </v-tabs-window-item>

          <!-- Awards Tab -->
          <v-tabs-window-item value="awards">
            <v-card-text>
              <AwardsPanel scope-type="tournament" :scope-id="tournament.id" />
            </v-card-text>
          </v-tabs-window-item>

          <!-- Stats Tab -->
          <v-tabs-window-item value="stats">
            <v-card-text>
              <StatsLeaderboard scope="tournament" :scope-id="tournament.id" />
            </v-card-text>
          </v-tabs-window-item>
        </v-tabs-window>
      </v-card>
    </template>

    <!-- Not Found -->
    <EmptyState
      v-else-if="!loading"
      icon="mdi-alert-circle"
      title="Tournament Not Found"
      subtitle="The tournament you're looking for doesn't exist or has been removed."
    >
      <template #action>
        <v-btn color="primary" class="mt-4" :to="{ name: 'tournaments' }">
          Browse Tournaments
        </v-btn>
      </template>
    </EmptyState>

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
  <ConfirmDialogHost :dialog="confirmDialog" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useGamesStore, type GameSummary } from '@/stores/games'
import { useAuthStore } from '@/stores/auth'
import {
  useTournamentsStore,
  formatTournamentFormat,
  formatSchedulingMode,
  formatParticipantType,
  participantTypeIcon,
  type TournamentMatchResponse,
} from '@/stores/tournaments'
import { formatMatchFormat } from '@/utils/matchStatus'
import TournamentHeader from '@/components/tournament/TournamentHeader.vue'
import TournamentRegistrationCard from '@/components/tournament/TournamentRegistrationCard.vue'
import OrganizerToolbar from '@/components/tournament/OrganizerToolbar.vue'
import { useTournamentContext } from '@/composables/useTournamentContext'
import TournamentBracket from '@/components/tournament/TournamentBracket.vue'
import AwardsPanel from '@/components/awards/AwardsPanel.vue'
import StatsLeaderboard from '@/components/awards/StatsLeaderboard.vue'
import TournamentMatchCard from '@/components/tournament/TournamentMatchCard.vue'
import TeamRegistrationModal from '@/components/tournament/TeamRegistrationModal.vue'
import PlayerRegistrationModal from '@/components/tournament/PlayerRegistrationModal.vue'
import TournamentEditModal from '@/components/admin/TournamentEditModal.vue'
import { useLeagueTeamsStore } from '@/stores/leagueTeams'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import EmptyState from '@/components/EmptyState.vue'
import { formatDateTime } from '@/utils/formatters'
import { isHttpUrl } from '@/utils/urls'
import { registrationStatusMap, getStatusColor, getStatusLabel } from '@/utils/statusMaps'

const route = useRoute()
const router = useRouter()
const gamesStore = useGamesStore()
const authStore = useAuthStore()
const tournamentsStore = useTournamentsStore()
const leagueTeamsStore = useLeagueTeamsStore()

// Store-backed reactive refs (tournament must be resolved before useTournamentContext).
const {
  loading, error,
  currentTournament: tournament,
  registrations: allRegistrations,
  matches, brackets,
} = storeToRefs(tournamentsStore)

const {
  isOrganizer, isTeamTournament, myRegistration, hasEligibleTeams,
  loadOrganizerRoles,
} = useTournamentContext(tournament)

// State
const breadcrumbs = computed(() => {
  const items: Array<{ title: string; to?: object; disabled?: boolean }> = [
    { title: 'Tournaments', to: { name: 'tournaments' } },
  ]
  if (tournament.value?.league_id) {
    items.unshift({
      title: 'League',
      to: { name: 'league-detail', params: { id: tournament.value.league_id } },
    })
  }
  items.push({ title: tournament.value?.name ?? 'Tournament', disabled: true })
  return items
})

// Tab is URL-addressable (?tab=bracket) so views can be deep-linked and
// survive refresh — same pattern as LeaguesPage's filter sync.
const VALID_TABS = ['overview', 'participants', 'bracket', 'matches', 'awards', 'stats']
const initialTab = typeof route.query.tab === 'string' && VALID_TABS.includes(route.query.tab)
  ? route.query.tab
  : 'overview'
const activeTab = ref(initialTab)

watch(activeTab, (tab) => {
  const current = route.query.tab ?? 'overview'
  if (current === tab) return
  router.replace({ query: { ...route.query, tab: tab === 'overview' ? undefined : tab } })
})

watch(() => route.query.tab, (tab) => {
  const next = typeof tab === 'string' && VALID_TABS.includes(tab) ? tab : 'overview'
  if (next !== activeTab.value) activeTab.value = next
})
const feedback = useActionFeedback()
const confirmDialog = useConfirmDialog()
const showTeamRegistrationModal = ref(false)
const showPlayerRegistrationModal = ref(false)
const editModalOpen = ref(false)

// Aggregated loading signal for the registration panel — true whenever any
// registration-related store action is in flight.
const registering = computed(() =>
  tournamentsStore.registerTeamState.loading
    || tournamentsStore.registerPlayerState.loading
    || tournamentsStore.withdrawState.loading
    || tournamentsStore.checkInState.loading
)
const registrations = computed(() =>
  allRegistrations.value.filter((r) => r.status !== 'withdrawn' && r.status !== 'disqualified'),
)
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

// Format helpers — delegated to the shared tournament formatters.
const formatLabel = computed(() =>
  tournament.value ? formatTournamentFormat(tournament.value.format) : ''
)
const matchFormatLabel = computed(() =>
  tournament.value ? formatMatchFormat(tournament.value.default_match_format) : ''
)
const participantIcon = computed(() => participantTypeIcon(tournament.value?.participant_type))
const participantTypeLabel = computed(() =>
  tournament.value
    ? formatParticipantType(tournament.value.participant_type, tournament.value.team_size)
    : ''
)
const schedulingModeLabel = computed(() =>
  tournament.value ? formatSchedulingMode(tournament.value.scheduling_mode) : ''
)

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
  showTeamRegistrationModal.value = false
  await feedback.run(
    () => tournamentsStore.registerTeam(tournament.value!.id, {
      team_season_id: teamSeasonId,
      participant_name: participantName,
      participant_logo_url: participantLogoUrl ?? null,
    }),
    {
      success: 'Team registered successfully!',
      failureFallback: 'Failed to register team',
      errorSource: tournamentsStore,
      after: fetchData,
    },
  )
}

async function handlePlayerRegister(participantName: string) {
  if (!tournament.value) return
  showPlayerRegistrationModal.value = false
  await feedback.run(
    () => tournamentsStore.registerPlayer(tournament.value!.id, {
      participant_name: participantName,
    }),
    {
      success: 'Successfully registered!',
      failureFallback: 'Failed to register',
      errorSource: tournamentsStore,
      after: fetchData,
    },
  )
}

function handleWithdraw() {
  if (!tournament.value || !myRegistration.value) return
  confirmDialog.confirm({
    title: 'Withdraw from Tournament',
    message: `Withdraw from ${tournament.value.name}? Your registration is removed and your spot may be given to someone else.`,
    action: 'Withdraw',
    color: 'error',
    handler: async () => {
      await feedback.run(
        () => tournamentsStore.withdrawFromTournament(tournament.value!.id, myRegistration.value!.id),
        {
          success: 'Successfully withdrawn',
          failureFallback: 'Failed to withdraw',
          errorSource: tournamentsStore,
          after: fetchData,
          rethrow: true,
        },
      )
    },
  })
}

async function handleCheckIn() {
  if (!tournament.value || !myRegistration.value) return
  await feedback.run(
    () => tournamentsStore.checkIn(tournament.value!.id, myRegistration.value!.id),
    {
      success: 'Successfully checked in!',
      failureFallback: 'Failed to check in',
      errorSource: tournamentsStore,
      after: fetchData,
    },
  )
}

// Organizer registration actions
async function handleApproveRegistration(registration: { id: string; participant_name: string }) {
  if (!tournament.value) return
  regActionLoadingId.value = registration.id
  await feedback.run(
    () => tournamentsStore.approveRegistration(tournament.value!.id, registration.id),
    {
      success: `${registration.participant_name} approved`,
      failureFallback: 'Failed to approve registration',
      errorSource: tournamentsStore,
    },
  )
  regActionLoadingId.value = null
}

function handleRejectRegistration(registration: { id: string; participant_name: string }) {
  if (!tournament.value) return
  confirmDialog.confirm({
    title: 'Reject Registration',
    message: `Reject ${registration.participant_name}'s registration? They will not participate in this tournament.`,
    action: 'Reject',
    color: 'error',
    handler: async () => {
      regActionLoadingId.value = registration.id
      try {
        await feedback.run(
          () => tournamentsStore.rejectRegistration(tournament.value!.id, registration.id),
          {
            success: `${registration.participant_name} rejected`,
            failureFallback: 'Failed to reject registration',
            errorSource: tournamentsStore,
            rethrow: true,
          },
        )
      } finally {
        regActionLoadingId.value = null
      }
    },
  })
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
  (slug) => {
    // Param empties out while navigating away — don't fire a spurious fetch.
    if (slug) fetchData()
  }
)

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
/* Wide tables scroll within themselves; the page never scrolls sideways. */
.table-scroll {
  overflow-x: auto;
}
</style>
