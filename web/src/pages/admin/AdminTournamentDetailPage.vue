<template>
  <div>
    <!-- Header -->
    <div class="d-flex justify-space-between align-center mb-6">
      <div class="d-flex align-center">
        <v-btn aria-label="Back" icon variant="text" class="mr-2" @click="goBack">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <div v-if="tournament">
          <h1 class="text-h4">{{ tournament.name }}</h1>
          <div class="text-subtitle-1 text-medium-emphasis d-flex align-center">
            <TournamentStatusChip :status="tournament.status" class="mr-2" />
            <span>{{ formatTournamentFormat(tournament.format) }}</span>
            <span class="mx-2">|</span>
            <span>{{ getGame(tournament.game_id)?.display_name || 'Unknown Game' }}</span>
          </div>
        </div>
      </div>
      <TournamentStatusActions
        v-if="tournament"
        :actions="tournamentActions"
        :process-no-shows-loading="tournamentsStore.processNoShowsState.loading"
        @view-public="viewPublic"
      />
    </div>

    <ErrorAlert :error="error" retryable @clear="clearError" @retry="fetchData" />

    <!-- Loading State -->
    <v-card v-if="loading" class="pa-8 text-center">
      <v-progress-circular indeterminate color="primary" size="48" />
      <p class="text-medium-emphasis mt-4">Loading tournament...</p>
    </v-card>

    <!-- Content -->
    <template v-else-if="tournament">
      <!-- Overview Cards -->
      <v-row class="mb-4">
        <v-col cols="12" md="3">
          <v-card>
            <v-card-text class="text-center">
              <div class="text-h4 font-weight-bold">{{ registrationCount }}</div>
              <div class="text-medium-emphasis">Registrations</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" md="3">
          <v-card>
            <v-card-text class="text-center">
              <div class="text-h4 font-weight-bold">{{ tournament.max_participants }}</div>
              <div class="text-medium-emphasis">Max Participants</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" md="3">
          <v-card>
            <v-card-text class="text-center">
              <div class="text-h4 font-weight-bold">{{ matchCount }}</div>
              <div class="text-medium-emphasis">Matches</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" md="3">
          <v-card>
            <v-card-text class="text-center">
              <div class="text-h4 font-weight-bold">{{ formatDate(tournament.starts_at) || 'TBD' }}</div>
              <div class="text-medium-emphasis">Start Date</div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- Tabs -->
      <v-card>
        <v-tabs v-model="activeTab" bg-color="transparent">
          <v-tab value="overview">Overview</v-tab>
          <v-tab value="registrations">Registrations</v-tab>
          <v-tab value="seeding" :disabled="!canEditSeeding">Seeding</v-tab>
          <v-tab value="bracket">Bracket</v-tab>
          <v-tab value="matches">Matches</v-tab>
          <v-tab value="stages">Stages</v-tab>
          <v-tab value="awards" data-testid="admin-awards-tab-btn">Awards</v-tab>
        </v-tabs>

        <v-divider />

        <v-tabs-window v-model="activeTab">
          <!-- Overview Tab -->
          <v-tabs-window-item value="overview">
            <v-card-text>
              <v-row>
                <v-col cols="12" md="8">
                  <h3 class="text-h6 mb-3">Tournament Details</h3>
                  <v-table density="comfortable">
                    <tbody>
                      <tr>
                        <td class="text-medium-emphasis" width="200">Format</td>
                        <td>{{ formatTournamentFormat(tournament.format) }}</td>
                      </tr>
                      <tr>
                        <td class="text-medium-emphasis">Participant Type</td>
                        <td>{{ formatParticipantType(tournament.participant_type, tournament.team_size) }}</td>
                      </tr>
                      <tr>
                        <td class="text-medium-emphasis">Match Format</td>
                        <td>{{ formatMatchFormat(tournament.default_match_format) }}</td>
                      </tr>
                      <tr>
                        <td class="text-medium-emphasis">Scheduling Mode</td>
                        <td>{{ formatSchedulingMode(tournament.scheduling_mode) }}</td>
                      </tr>
                      <tr>
                        <td class="text-medium-emphasis">Registration Type</td>
                        <td>{{ tournament.registration_type }}</td>
                      </tr>
                      <tr>
                        <td class="text-medium-emphasis">Registration Opens</td>
                        <td>{{ formatDateTime(tournament.registration_start) || 'Not set' }}</td>
                      </tr>
                      <tr>
                        <td class="text-medium-emphasis">Registration Closes</td>
                        <td>{{ formatDateTime(tournament.registration_end) || 'Not set' }}</td>
                      </tr>
                      <tr>
                        <td class="text-medium-emphasis">Tournament Starts</td>
                        <td>{{ formatDateTime(tournament.starts_at) || 'Not set' }}</td>
                      </tr>
                      <tr v-if="tournament.check_in_required">
                        <td class="text-medium-emphasis">Check-in</td>
                        <td>
                          {{ formatDateTime(tournament.check_in_start) }} - {{ formatDateTime(tournament.check_in_end) }}
                        </td>
                      </tr>
                      <tr v-if="tournament.rules_url">
                        <td class="text-medium-emphasis">Rules</td>
                        <td>
                          <a
                            :href="isHttpUrl(tournament.rules_url) ? tournament.rules_url : undefined"
                            target="_blank"
                            rel="noopener noreferrer"
                          >{{ tournament.rules_url }}</a>
                        </td>
                      </tr>
                    </tbody>
                  </v-table>

                  <div v-if="tournament.description" class="mt-6">
                    <h3 class="text-h6 mb-3">Description</h3>
                    <div class="text-body-1" style="white-space: pre-wrap">{{ tournament.description }}</div>
                  </div>
                </v-col>

                <v-col cols="12" md="4">
                  <v-card variant="outlined">
                    <v-card-title>Quick Actions</v-card-title>
                    <v-card-text>
                      <v-btn block class="mb-2" prepend-icon="mdi-pencil" @click="openEditModal">
                        Edit Tournament
                      </v-btn>
                      <v-btn
                        v-if="tournamentActions.canCloseRegistration.value"
                        block
                        class="mb-2"
                        color="warning"
                        prepend-icon="mdi-account-cancel"
                        @click="tournamentActions.closeRegistration"
                      >
                        Close Registration
                      </v-btn>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>
            </v-card-text>
          </v-tabs-window-item>

          <!-- Registrations Tab -->
          <v-tabs-window-item value="registrations">
            <RegistrationsTab
              :registrations="registrations"
              :loading="loading"
              :check-in-required="tournament?.check_in_required ?? false"
              :action-loading-id="actionLoadingId"
              @approve="handleApprove"
              @reject="handleReject"
              @disqualify="handleDisqualify"
              @admin-check-in="handleAdminCheckIn"
            />
          </v-tabs-window-item>

          <!-- Bracket Tab -->
          <v-tabs-window-item value="bracket">
            <BracketTab @advance-round="tournamentActions.advanceRound" />
          </v-tabs-window-item>

          <!-- Seeding Tab -->
          <v-tabs-window-item value="seeding">
            <SeedingTab
              :seeding="seeding"
              :auto-seed-loading="tournamentsStore.autoSeedState.loading"
              :save-seeding-loading="tournamentsStore.manualSeedState.loading"
              :clear-seeding-loading="tournamentsStore.clearSeedingState.loading"
              @auto-seed="handleAutoSeed"
              @save="handleSaveSeeding"
              @clear="handleClearSeeding"
            />
          </v-tabs-window-item>

          <!-- Matches Tab -->
          <v-tabs-window-item value="matches">
            <MatchesTab
              :matches="matches"
              :loading="loading"
              :tournament-status="tournament?.status"
              :bulk-start-loading="bulkStartLoading"
              :match-transition-loading-id="matchTransitionLoadingId"
              @view-detail="openMatchDetail"
              @transition="handleMatchTransition"
              @bulk-start="handleBulkStartMatches"
            />
          </v-tabs-window-item>
          <!-- Stages Tab -->
          <v-tabs-window-item value="stages">
            <StagesTab
              :tournament-id="tournament.id"
              :tournament-status="tournament.status"
            />
          </v-tabs-window-item>

          <!-- Awards Tab -->
          <v-tabs-window-item value="awards">
            <AwardsTab
              v-if="tournament"
              scope-type="tournament"
              :scope-id="tournament.id"
              :game-id="tournament.game_id"
            />
          </v-tabs-window-item>
        </v-tabs-window>
      </v-card>
    </template>


    <!-- Edit Modal -->
    <TournamentEditModal
      v-model="editModalOpen"
      :tournament="tournament"
      @saved="onTournamentSaved"
    />

    <!-- Cancel Confirmation Dialog (shared between page + useTournamentAdminActions) -->
    <ConfirmDialogHost :dialog="tournamentActions.confirmDialog" />

    <!-- Match Detail Modal -->
    <AdminMatchDetailModal
      v-model="matchDetailModalOpen"
      :match-id="selectedMatchId"
      :tournament-id="(route.params.id as string)"
      @updated="fetchData"
    />

    <!-- Registration Action Modal -->
    <RegistrationReasonModal
      v-model="showReasonModal"
      :mode="reasonModalMode"
      :registration="selectedRegistration"
      :loading="actionLoadingId !== null"
      @confirm="handleReasonConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useGamesStore, type GameSummary } from '@/stores/games'
import {
  useTournamentsStore,
  formatTournamentFormat,
  formatParticipantType,
  formatSchedulingMode,
} from '@/stores/tournaments'
import { formatMatchFormat } from '@/utils/matchStatus'
import TournamentStatusChip from '@/components/admin/TournamentStatusChip.vue'
import TournamentStatusActions from '@/components/admin/TournamentStatusActions.vue'
import TournamentEditModal from '@/components/admin/TournamentEditModal.vue'
import RegistrationReasonModal from '@/components/admin/RegistrationReasonModal.vue'
import AdminMatchDetailModal from '@/components/admin/AdminMatchDetailModal.vue'
import RegistrationsTab from '@/components/admin/tournament-detail/RegistrationsTab.vue'
import MatchesTab from '@/components/admin/tournament-detail/MatchesTab.vue'
import SeedingTab from '@/components/admin/tournament-detail/SeedingTab.vue'
import StagesTab from '@/components/admin/tournament-detail/StagesTab.vue'
import BracketTab from '@/components/admin/tournament-detail/BracketTab.vue'
import AwardsTab from '@/components/admin/tournament-detail/AwardsTab.vue'
import { useSnackbar } from '@/composables/useSnackbar'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { useTournamentAdminActions } from '@/composables/useTournamentAdminActions'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import { formatDate, formatDateTime } from '@/utils/formatters'
import { isHttpUrl } from '@/utils/urls'
import type { TournamentRegistrationResponse } from '@/stores/tournaments'

const route = useRoute()
const router = useRouter()
const gamesStore = useGamesStore()
const tournamentsStore = useTournamentsStore()

// State
const activeTab = ref('overview')
const editModalOpen = ref(false)
const snackbar = useSnackbar()

const feedback = useActionFeedback()

// Match transition state
const matchTransitionLoadingId = ref<string | null>(null)
const bulkStartLoading = ref(false)

// Match detail modal
const matchDetailModalOpen = ref(false)
const selectedMatchId = ref<string | null>(null)

// Registration action state
const actionLoadingId = ref<string | null>(null)
const showReasonModal = ref(false)
const reasonModalMode = ref<'reject' | 'disqualify'>('reject')
const selectedRegistration = ref<TournamentRegistrationResponse | null>(null)

// Reactive refs straight from the store (replaces the computed-indirection pattern)
const {
  loading, error,
  currentTournament: tournament,
  registrations, matches, seeding,
} = storeToRefs(tournamentsStore)

const registrationCount = computed(() => registrations.value.length)
const matchCount = computed(() => matches.value.length)

const canEditSeeding = computed(() =>
  tournament.value && ['registration', 'scheduled'].includes(tournament.value.status)
)

// Lifecycle actions + their `can*` guards live in useTournamentAdminActions.
// Reached from the template as `tournamentActions.canX` / `tournamentActions.x()`.
const tournamentActions = useTournamentAdminActions(tournament, { after: () => fetchData() })

// Helpers
function getGame(gameId: string): GameSummary | undefined {
  return gamesStore.games.find((g) => g.id === gameId)
}

// Match + tournament formatters imported from @/utils/matchStatus and @/stores/tournaments.

async function handleMatchTransition(matchId: string, toStatus: string) {
  if (!tournament.value) return
  matchTransitionLoadingId.value = matchId
  try {
    await tournamentsStore.adminMatchTransition(tournament.value.id, matchId, toStatus, 'Admin action')
    snackbar.show(`Match transitioned to ${toStatus.replace(/_/g, ' ')}`, 'success')
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to transition match', 'error')
  } finally {
    matchTransitionLoadingId.value = null
  }
}

function handleBulkStartMatches() {
  if (!tournament.value) return
  const eligible = matches.value.filter((m) => ['pending', 'ready', 'scheduled'].includes(m.status))
  if (eligible.length === 0) {
    snackbar.show('No matches are eligible to start', 'info')
    return
  }
  // Preview what will happen before force-marching the state machine.
  tournamentActions.confirmDialog.confirm({
    title: 'Bulk Start Matches',
    message: `Force ${eligible.length} match(es) (pending/ready/scheduled) straight to in-progress? Check-in and veto steps are skipped.`,
    action: `Start ${eligible.length} Match(es)`,
    color: 'warning',
    handler: async () => {
      await runBulkStartMatches(eligible)
    },
  })
}

async function runBulkStartMatches(eligible: typeof matches.value) {
  if (!tournament.value) return
  bulkStartLoading.value = true
  try {
    const tournamentId = tournament.value.id
    const reason = 'Bulk admin action'

    // Walk each match through its remaining state-machine steps in sequence,
    // but run matches in parallel with allSettled so one failure doesn't skip the rest.
    async function promoteMatch(match: typeof eligible[number]) {
      if (match.status === 'pending') {
        await tournamentsStore.adminMatchTransition(tournamentId, match.id, 'ready', reason)
      }
      if (match.status === 'pending' || match.status === 'ready') {
        await tournamentsStore.adminMatchTransition(tournamentId, match.id, 'scheduled', reason)
      }
      await tournamentsStore.adminMatchTransition(tournamentId, match.id, 'in_progress', reason)
    }

    const results = await Promise.allSettled(eligible.map((m) => promoteMatch(m)))
    const succeeded = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.length - succeeded

    if (failed === 0) {
      snackbar.show(`${succeeded} match(es) started`, 'success')
    } else if (succeeded === 0) {
      snackbar.show(`Failed to start ${failed} match(es)`, 'error')
    } else {
      snackbar.show(`Started ${succeeded} match(es); ${failed} failed`, 'warning')
    }

    await tournamentsStore.fetchMatches(tournamentId)
  } finally {
    bulkStartLoading.value = false
  }
}

function openMatchDetail(matchId: string) {
  selectedMatchId.value = matchId
  matchDetailModalOpen.value = true
}

function clearError() {
  tournamentsStore.error = null
}

// Navigation
function goBack() {
  router.push({ name: 'admin-tournaments' })
}

function viewPublic() {
  if (tournament.value) {
    window.open(`/tournaments/${tournament.value.slug}`, '_blank')
  }
}

function openEditModal() {
  editModalOpen.value = true
}

function onTournamentSaved() {
  snackbar.show('Tournament updated successfully', 'success')
  fetchData()
}


// Registration action handlers
async function handleApprove(registration: TournamentRegistrationResponse) {
  if (!tournament.value) return
  actionLoadingId.value = registration.id
  await feedback.run(
    () => tournamentsStore.approveRegistration(tournament.value!.id, registration.id),
    { success: `${registration.participant_name} approved`, errorSource: tournamentsStore },
  )
  actionLoadingId.value = null
}

function handleReject(registration: TournamentRegistrationResponse) {
  selectedRegistration.value = registration
  reasonModalMode.value = 'reject'
  showReasonModal.value = true
}

function handleDisqualify(registration: TournamentRegistrationResponse) {
  selectedRegistration.value = registration
  reasonModalMode.value = 'disqualify'
  showReasonModal.value = true
}

async function handleReasonConfirm(reason: string) {
  if (!tournament.value || !selectedRegistration.value) return

  actionLoadingId.value = selectedRegistration.value.id
  const participantName = selectedRegistration.value.participant_name

  try {
    if (reasonModalMode.value === 'reject') {
      await tournamentsStore.rejectRegistration(
        tournament.value.id,
        selectedRegistration.value.id,
        reason || undefined
      )
      snackbar.show(`${participantName} rejected`, 'success')
    } else {
      await tournamentsStore.disqualifyRegistration(
        tournament.value.id,
        selectedRegistration.value.id,
        reason
      )
      snackbar.show(`${participantName} disqualified`, 'success')
    }
    showReasonModal.value = false
  } catch {
    snackbar.show(tournamentsStore.error || `Failed to ${reasonModalMode.value} registration`, 'error')
  } finally {
    actionLoadingId.value = null
    selectedRegistration.value = null
  }
}

// Seeding handlers (list ordering lives in SeedingTab; `save` emits the final order)
async function handleAutoSeed() {
  if (!tournament.value) return
  await feedback.run(() => tournamentsStore.autoSeed(tournament.value!.id),
    { success: 'Seeding generated automatically', errorSource: tournamentsStore })
}

async function handleSaveSeeding(seeds: Array<{ registration_id: string; seed: number }>) {
  if (!tournament.value) return
  await feedback.run(() => tournamentsStore.manualSeed(tournament.value!.id, seeds),
    { success: 'Seeding saved', errorSource: tournamentsStore })
}

async function handleClearSeeding() {
  if (!tournament.value) return
  await feedback.run(() => tournamentsStore.clearSeeding(tournament.value!.id),
    { success: 'Seeding cleared', errorSource: tournamentsStore })
}

// Admin check-in handler
async function handleAdminCheckIn(registration: TournamentRegistrationResponse) {
  if (!tournament.value) return
  actionLoadingId.value = registration.id
  await feedback.run(
    () => tournamentsStore.adminCheckIn(tournament.value!.id, registration.id),
    { success: `${registration.participant_name} checked in`, errorSource: tournamentsStore },
  )
  actionLoadingId.value = null
}

// Data fetching
async function fetchData() {
  const id = route.params.id as string
  try {
    await Promise.all([
      tournamentsStore.fetchTournament(id),
      tournamentsStore.fetchRegistrations(id),
      tournamentsStore.fetchMatches(id),
      tournamentsStore.fetchBrackets(id),
      tournamentsStore.fetchStages(id),
      tournamentsStore.fetchSeeding(id).catch(() => []),
      gamesStore.fetchGames(),
    ])
  } catch {
    // Errors are captured in store
  }
}

// Handle tab from query param
watch(
  () => route.query.tab,
  (tab) => {
    if (tab && typeof tab === 'string') {
      activeTab.value = tab
    }
  },
  { immediate: true }
)

onMounted(() => {
  fetchData()
})
</script>
