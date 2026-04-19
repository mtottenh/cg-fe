<template>
  <div>
    <!-- Header -->
    <div class="d-flex justify-space-between align-center mb-6">
      <div class="d-flex align-center">
        <v-btn icon variant="text" class="mr-2" @click="goBack">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <div v-if="tournament">
          <h1 class="text-h4">{{ tournament.name }}</h1>
          <div class="text-subtitle-1 text-grey d-flex align-center">
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
        :process-no-shows-loading="tournamentsStore.processNoShowsState.loading.value"
        @view-public="viewPublic"
      />
    </div>

    <!-- Loading State -->
    <v-card v-if="loading" class="pa-8 text-center">
      <v-progress-circular indeterminate color="primary" size="48" />
      <p class="text-grey mt-4">Loading tournament...</p>
    </v-card>

    <!-- Content -->
    <template v-else-if="tournament">
      <!-- Overview Cards -->
      <v-row class="mb-4">
        <v-col cols="12" md="3">
          <v-card>
            <v-card-text class="text-center">
              <div class="text-h4 font-weight-bold">{{ registrationCount }}</div>
              <div class="text-grey">Registrations</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" md="3">
          <v-card>
            <v-card-text class="text-center">
              <div class="text-h4 font-weight-bold">{{ tournament.max_participants }}</div>
              <div class="text-grey">Max Participants</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" md="3">
          <v-card>
            <v-card-text class="text-center">
              <div class="text-h4 font-weight-bold">{{ matchCount }}</div>
              <div class="text-grey">Matches</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" md="3">
          <v-card>
            <v-card-text class="text-center">
              <div class="text-h4 font-weight-bold">{{ formatDate(tournament.starts_at) || 'TBD' }}</div>
              <div class="text-grey">Start Date</div>
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
                        <td class="text-grey" width="200">Format</td>
                        <td>{{ formatTournamentFormat(tournament.format) }}</td>
                      </tr>
                      <tr>
                        <td class="text-grey">Participant Type</td>
                        <td>
                          {{ tournament.participant_type === 'team' ? `Teams (${tournament.team_size} players)` : 'Individuals' }}
                        </td>
                      </tr>
                      <tr>
                        <td class="text-grey">Match Format</td>
                        <td>{{ formatMatchFormat(tournament.default_match_format) }}</td>
                      </tr>
                      <tr>
                        <td class="text-grey">Scheduling Mode</td>
                        <td>{{ tournament.scheduling_mode }}</td>
                      </tr>
                      <tr>
                        <td class="text-grey">Registration Type</td>
                        <td>{{ tournament.registration_type }}</td>
                      </tr>
                      <tr>
                        <td class="text-grey">Registration Opens</td>
                        <td>{{ formatDateTime(tournament.registration_start) || 'Not set' }}</td>
                      </tr>
                      <tr>
                        <td class="text-grey">Registration Closes</td>
                        <td>{{ formatDateTime(tournament.registration_end) || 'Not set' }}</td>
                      </tr>
                      <tr>
                        <td class="text-grey">Tournament Starts</td>
                        <td>{{ formatDateTime(tournament.starts_at) || 'Not set' }}</td>
                      </tr>
                      <tr v-if="tournament.check_in_required">
                        <td class="text-grey">Check-in</td>
                        <td>
                          {{ formatDateTime(tournament.check_in_start) }} - {{ formatDateTime(tournament.check_in_end) }}
                        </td>
                      </tr>
                      <tr v-if="tournament.rules_url">
                        <td class="text-grey">Rules</td>
                        <td>
                          <a :href="tournament.rules_url" target="_blank">{{ tournament.rules_url }}</a>
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
            <v-card-text>
              <!-- Swiss Round Advancement -->
              <div v-if="isSwissFormat && tournament?.status === 'in_progress'" class="mb-4 d-flex align-center gap-3">
                <span v-if="swissBracket" class="text-subtitle-1">
                  Round {{ swissBracket.current_round }} of {{ swissBracket.total_rounds }}
                </span>
                <v-btn
                  v-if="canAdvanceRound"
                  color="primary"
                  prepend-icon="mdi-skip-next"
                  :loading="tournamentsStore.generateNextRoundState.loading"
                  @click="advanceRound"
                >
                  Generate Next Round
                </v-btn>
                <v-chip v-else color="info" variant="tonal">
                  {{ allCurrentRoundMatchesCompleted ? 'Final round' : 'Complete all matches to advance' }}
                </v-chip>
              </div>

              <div v-if="brackets.length === 0" class="text-center pa-8">
                <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-tournament</v-icon>
                <h3 class="text-h6 mb-2">No Bracket Generated</h3>
                <p class="text-grey">
                  The bracket will be generated when the tournament starts.
                </p>
              </div>
              <div v-else>
                <TournamentBracket :brackets="brackets" :matches="matches" />
              </div>
            </v-card-text>
          </v-tabs-window-item>

          <!-- Seeding Tab -->
          <v-tabs-window-item value="seeding">
            <SeedingTab
              :seeding-list="seedingList"
              :auto-seed-loading="tournamentsStore.autoSeedState.loading.value"
              :save-seeding-loading="tournamentsStore.manualSeedState.loading.value"
              :clear-seeding-loading="tournamentsStore.clearSeedingState.loading.value"
              @auto-seed="handleAutoSeed"
              @save="handleSaveSeeding"
              @clear="handleClearSeeding"
              @move="moveSeed"
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
            <v-card-text>
              <div class="d-flex justify-end mb-4">
                <v-btn
                  color="primary"
                  prepend-icon="mdi-plus"
                  :disabled="!['draft', 'published', 'registration', 'scheduled'].includes(tournament?.status || '')"
                  @click="stageCreateModalOpen = true"
                >
                  Add Stage
                </v-btn>
              </div>

              <v-list v-if="stages.length > 0" lines="two">
                <v-list-item v-for="stage in sortedStages" :key="stage.id">
                  <template v-slot:prepend>
                    <v-avatar color="primary" variant="tonal">
                      {{ stage.stage_order }}
                    </v-avatar>
                  </template>
                  <v-list-item-title>{{ stage.name }}</v-list-item-title>
                  <v-list-item-subtitle>
                    Format: {{ stage.format || 'Default' }}
                    <span v-if="stage.match_format"> | Match: {{ formatMatchFormat(stage.match_format) }}</span>
                  </v-list-item-subtitle>
                </v-list-item>
              </v-list>
              <div v-else class="text-center pa-8">
                <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-layers</v-icon>
                <h3 class="text-h6 mb-2">No Stages</h3>
                <p class="text-grey">Add stages for multi-phase tournaments (e.g., group stage + playoffs).</p>
              </div>
            </v-card-text>
          </v-tabs-window-item>
        </v-tabs-window>
      </v-card>
    </template>

    <v-alert v-if="error" type="error" class="mt-4" closable @click:close="clearError">
      {{ error }}
    </v-alert>


    <!-- Edit Modal -->
    <TournamentEditModal
      v-model="editModalOpen"
      :tournament="tournament"
      @saved="onTournamentSaved"
    />

    <!-- Cancel Confirmation Dialog (shared between page + useTournamentAdminActions) -->
    <ConfirmDialog
      :open="tournamentActions.confirmDialog.state.open"
      :title="tournamentActions.confirmDialog.state.title"
      :message="tournamentActions.confirmDialog.state.message"
      :action-label="tournamentActions.confirmDialog.state.actionLabel"
      :color="tournamentActions.confirmDialog.state.color"
      :loading="tournamentActions.confirmDialog.state.loading"
      @confirm="tournamentActions.confirmDialog.execute"
      @cancel="tournamentActions.confirmDialog.cancel"
    />

    <!-- Match Detail Modal -->
    <AdminMatchDetailModal
      v-model="matchDetailModalOpen"
      :match-id="selectedMatchId"
      :tournament-id="(route.params.id as string)"
      @updated="fetchData"
    />

    <!-- Stage Create Modal -->
    <v-dialog v-model="stageCreateModalOpen" max-width="500">
      <v-card>
        <v-card-title>Add Stage</v-card-title>
        <v-card-text>
          <v-text-field v-model="newStage.name" label="Stage Name" class="mb-2" />
          <v-text-field v-model.number="newStage.stage_order" label="Stage Order" type="number" class="mb-2" />
          <v-select
            v-model="newStage.format"
            :items="['single_elimination', 'double_elimination', 'round_robin', 'swiss', 'groups_and_playoffs']"
            label="Format (optional)"
            clearable
            class="mb-2"
          />
          <v-select
            v-model="newStage.match_format"
            :items="['bo1', 'bo3', 'bo5', 'bo7']"
            label="Match Format (optional)"
            clearable
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="stageCreateModalOpen = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :loading="tournamentsStore.createStageState.loading.value"
            :disabled="!newStage.name"
            @click="handleCreateStage"
          >
            Create
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

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
import { useTournamentsStore, formatTournamentFormat } from '@/stores/tournaments'
import TournamentStatusChip from '@/components/admin/TournamentStatusChip.vue'
import TournamentStatusActions from '@/components/admin/TournamentStatusActions.vue'
import TournamentEditModal from '@/components/admin/TournamentEditModal.vue'
import TournamentBracket from '@/components/tournament/TournamentBracket.vue'
import RegistrationReasonModal from '@/components/admin/RegistrationReasonModal.vue'
import AdminMatchDetailModal from '@/components/admin/AdminMatchDetailModal.vue'
import RegistrationsTab from '@/components/admin/tournament-detail/RegistrationsTab.vue'
import MatchesTab from '@/components/admin/tournament-detail/MatchesTab.vue'
import SeedingTab from '@/components/admin/tournament-detail/SeedingTab.vue'
import { useSnackbar } from '@/composables/useSnackbar'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { useTournamentAdminActions } from '@/composables/useTournamentAdminActions'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { formatDate, formatDateTime } from '@/utils/formatters'
import type { TournamentRegistrationResponse } from '@/stores/tournaments'
import type { BracketProgress } from '@/api/overrides'

const route = useRoute()
const router = useRouter()
const gamesStore = useGamesStore()
const tournamentsStore = useTournamentsStore()

// State
const activeTab = ref('overview')
const editModalOpen = ref(false)
const snackbar = useSnackbar()

const feedback = useActionFeedback()
const stageCreateModalOpen = ref(false)
const newStage = ref({ name: '', stage_order: 1, format: null as string | null, match_format: null as string | null })

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
  registrations, matches, brackets, stages,
} = storeToRefs(tournamentsStore)

const sortedStages = computed(() =>
  [...stages.value].sort((a, b) => a.stage_order - b.stage_order)
)

const registrationCount = computed(() => registrations.value.length)
const matchCount = computed(() => matches.value.length)

const isSwissFormat = computed(() => tournament.value?.format === 'swiss')
const swissBracket = computed<BracketProgress | null>(() =>
  (brackets.value[0] as BracketProgress | undefined) ?? null
)
const allCurrentRoundMatchesCompleted = computed(() => {
  const b = swissBracket.value
  if (!b?.current_round) return false
  const roundMatches = matches.value.filter((m) => m.round === b.current_round)
  return roundMatches.length > 0 && roundMatches.every((m) => m.status === 'completed')
})
const canAdvanceRound = computed(() => {
  if (!isSwissFormat.value || tournament.value?.status !== 'in_progress') return false
  const b = swissBracket.value
  if (!b?.current_round || !b?.total_rounds) return false
  return b.current_round < b.total_rounds && allCurrentRoundMatchesCompleted.value
})

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

function formatMatchFormat(format: string): string {
  switch (format) {
    case 'bo1': return 'Best of 1'
    case 'bo3': return 'Best of 3'
    case 'bo5': return 'Best of 5'
    case 'bo7': return 'Best of 7'
    default: return format
  }
}

// Match status helpers imported from @/utils/matchStatus

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

async function handleBulkStartMatches() {
  if (!tournament.value) return
  bulkStartLoading.value = true
  try {
    const tournamentId = tournament.value.id
    const eligible = matches.value.filter((m) => ['pending', 'ready', 'scheduled'].includes(m.status))
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

// Lifecycle actions (publish / open-close-registration / start / complete /
// finalize / cancel / advance / processNoShows) live in useTournamentAdminActions
// above. The bracket tab still references advanceRound directly:
const advanceRound = tournamentActions.advanceRound

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

// Seeding handlers
import type { SeededParticipantResponse } from '@/stores/tournaments'

const seedingList = ref<SeededParticipantResponse[]>([])

// Sync seeding list from store
watch(() => tournamentsStore.seeding, (newSeeding) => {
  seedingList.value = [...newSeeding]
}, { immediate: true })

function moveSeed(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= seedingList.value.length) return
  const temp = seedingList.value[index]!
  seedingList.value[index] = seedingList.value[target]!
  seedingList.value[target] = temp
}

async function handleAutoSeed() {
  if (!tournament.value) return
  await feedback.run(() => tournamentsStore.autoSeed(tournament.value!.id),
    { success: 'Seeding generated automatically', errorSource: tournamentsStore })
}

async function handleSaveSeeding() {
  if (!tournament.value) return
  const seeds = seedingList.value.map((s, i) => ({
    registration_id: s.registration_id,
    seed: i + 1,
  }))
  await feedback.run(() => tournamentsStore.manualSeed(tournament.value!.id, seeds),
    { success: 'Seeding saved', errorSource: tournamentsStore })
}

async function handleClearSeeding() {
  if (!tournament.value) return
  await feedback.run(() => tournamentsStore.clearSeeding(tournament.value!.id),
    { success: 'Seeding cleared', errorSource: tournamentsStore })
}

// Stage handler
async function handleCreateStage() {
  if (!tournament.value || !newStage.value.name) return
  const result = await feedback.run(
    () => tournamentsStore.createStage(tournament.value!.id, {
      name: newStage.value.name,
      stage_order: newStage.value.stage_order,
      format: newStage.value.format ?? '',
      match_format: newStage.value.match_format,
    }),
    { success: 'Stage created', errorSource: tournamentsStore },
  )
  if (result !== null) {
    stageCreateModalOpen.value = false
    newStage.value = { name: '', stage_order: stages.value.length + 1, format: null, match_format: null }
  }
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
