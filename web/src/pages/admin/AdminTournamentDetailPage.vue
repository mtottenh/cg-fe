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
      <div v-if="tournament" class="d-flex gap-2">
        <v-btn variant="tonal" prepend-icon="mdi-open-in-new" @click="viewPublic">
          View Public
        </v-btn>
        <v-btn
          v-if="canPublish"
          color="primary"
          prepend-icon="mdi-eye"
          @click="publishTournament"
        >
          Publish
        </v-btn>
        <v-btn
          v-if="canOpenRegistration"
          color="success"
          prepend-icon="mdi-account-plus"
          @click="openRegistration"
        >
          Open Registration
        </v-btn>
        <v-btn
          v-if="canStart"
          color="primary"
          prepend-icon="mdi-play"
          @click="startTournament"
        >
          Start Tournament
        </v-btn>
      </div>
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
              <div class="text-h4 font-weight-bold">{{ formatDate(tournament.starts_at) }}</div>
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
          <v-tab value="bracket">Bracket</v-tab>
          <v-tab value="matches">Matches</v-tab>
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
                        v-if="canCloseRegistration"
                        block
                        class="mb-2"
                        color="warning"
                        prepend-icon="mdi-account-cancel"
                        @click="closeRegistration"
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
            <v-card-text>
              <v-data-table
                :headers="registrationHeaders"
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
                  <v-chip :color="getRegistrationStatusColor(item.status)" size="small">
                    {{ item.status }}
                  </v-chip>
                </template>

                <template v-slot:item.checked_in="{ item }">
                  <v-icon v-if="item.checked_in" color="success">mdi-check-circle</v-icon>
                  <v-icon v-else color="grey">mdi-circle-outline</v-icon>
                </template>

                <template v-slot:item.seed="{ item }">
                  {{ item.seed || '-' }}
                </template>

                <template v-slot:item.registered_at="{ item }">
                  {{ formatDateTime(item.registered_at) }}
                </template>

                <template v-slot:item.actions="{ item }">
                  <div class="d-flex gap-1">
                    <!-- Pending: Approve / Reject -->
                    <template v-if="item.status === 'pending'">
                      <v-btn
                        color="success"
                        size="small"
                        variant="tonal"
                        :loading="actionLoadingId === item.id"
                        :disabled="actionLoadingId !== null && actionLoadingId !== item.id"
                        @click="handleApprove(item)"
                      >
                        Approve
                      </v-btn>
                      <v-btn
                        color="warning"
                        size="small"
                        variant="tonal"
                        :disabled="actionLoadingId !== null"
                        @click="handleReject(item)"
                      >
                        Reject
                      </v-btn>
                    </template>

                    <!-- Approved / Checked-in / Active: Disqualify -->
                    <template v-else-if="['approved', 'checked_in', 'active'].includes(item.status)">
                      <v-btn
                        color="error"
                        size="small"
                        variant="tonal"
                        :disabled="actionLoadingId !== null"
                        @click="handleDisqualify(item)"
                      >
                        Disqualify
                      </v-btn>
                    </template>

                    <!-- Terminal states: No actions -->
                    <span v-else class="text-grey text-caption">-</span>
                  </div>
                </template>

                <template v-slot:no-data>
                  <div class="text-center pa-4">
                    <p class="text-grey">No registrations yet</p>
                  </div>
                </template>
              </v-data-table>
            </v-card-text>
          </v-tabs-window-item>

          <!-- Bracket Tab -->
          <v-tabs-window-item value="bracket">
            <v-card-text>
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

          <!-- Matches Tab -->
          <v-tabs-window-item value="matches">
            <v-card-text>
              <v-data-table
                :headers="matchHeaders"
                :items="matches"
                :loading="loading"
                density="comfortable"
              >
                <template v-slot:item.match_number="{ item }">
                  <v-chip size="small" variant="tonal">
                    #{{ item.match_number }}
                  </v-chip>
                </template>

                <template v-slot:item.participants="{ item }">
                  <div class="d-flex align-center">
                    <span :class="{ 'font-weight-bold': item.winner_registration_id === item.participant1_registration_id }">
                      {{ item.participant1_name || 'TBD' }}
                    </span>
                    <span class="mx-2">vs</span>
                    <span :class="{ 'font-weight-bold': item.winner_registration_id === item.participant2_registration_id }">
                      {{ item.participant2_name || 'TBD' }}
                    </span>
                  </div>
                </template>

                <template v-slot:item.score="{ item }">
                  <span v-if="item.status === 'completed'">
                    {{ item.participant1_score }} - {{ item.participant2_score }}
                  </span>
                  <span v-else class="text-grey">-</span>
                </template>

                <template v-slot:item.status="{ item }">
                  <v-chip :color="getMatchStatusColor(item.status)" size="small">
                    {{ formatMatchStatus(item.status) }}
                  </v-chip>
                </template>

                <template v-slot:item.scheduled_at="{ item }">
                  {{ item.scheduled_at ? formatDateTime(item.scheduled_at) : 'Not scheduled' }}
                </template>

                <template v-slot:no-data>
                  <div class="text-center pa-4">
                    <p class="text-grey">No matches generated yet</p>
                  </div>
                </template>
              </v-data-table>
            </v-card-text>
          </v-tabs-window-item>
        </v-tabs-window>
      </v-card>
    </template>

    <v-alert v-if="error" type="error" class="mt-4" closable @click:close="clearError">
      {{ error }}
    </v-alert>

    <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3000">
      {{ snackbarText }}
    </v-snackbar>

    <!-- Edit Modal -->
    <TournamentEditModal
      v-model="editModalOpen"
      :tournament="tournament"
      @saved="onTournamentSaved"
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
import { useRoute, useRouter } from 'vue-router'
import { useGamesStore, type GameSummary } from '@/stores/games'
import { useTournamentsStore, formatTournamentFormat } from '@/stores/tournaments'
import TournamentStatusChip from '@/components/admin/TournamentStatusChip.vue'
import TournamentEditModal from '@/components/admin/TournamentEditModal.vue'
import TournamentBracket from '@/components/tournament/TournamentBracket.vue'
import RegistrationReasonModal from '@/components/admin/RegistrationReasonModal.vue'
import type { TournamentRegistrationResponse } from '@/stores/tournaments'

const route = useRoute()
const router = useRouter()
const gamesStore = useGamesStore()
const tournamentsStore = useTournamentsStore()

// State
const activeTab = ref('overview')
const editModalOpen = ref(false)
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('success')

// Registration action state
const actionLoadingId = ref<string | null>(null)
const showReasonModal = ref(false)
const reasonModalMode = ref<'reject' | 'disqualify'>('reject')
const selectedRegistration = ref<TournamentRegistrationResponse | null>(null)

// Computed
const loading = computed(() => tournamentsStore.loading)
const error = computed(() => tournamentsStore.error)
const tournament = computed(() => tournamentsStore.currentTournament)
const registrations = computed(() => tournamentsStore.registrations)
const matches = computed(() => tournamentsStore.matches)
const brackets = computed(() => tournamentsStore.brackets)

const registrationCount = computed(() => registrations.value.length)
const matchCount = computed(() => matches.value.length)

const canPublish = computed(() => tournament.value?.status === 'draft')
const canOpenRegistration = computed(() => tournament.value?.status === 'published')
const canCloseRegistration = computed(() => tournament.value?.status === 'registration_open')
const canStart = computed(() => tournament.value?.status === 'ready')

// Table headers
const registrationHeaders = [
  { title: '', key: 'participant_logo_url', width: '50px', sortable: false },
  { title: 'Participant', key: 'participant_name' },
  { title: 'Status', key: 'status', width: '120px' },
  { title: 'Checked In', key: 'checked_in', width: '100px' },
  { title: 'Seed', key: 'seed', width: '80px' },
  { title: 'Registered', key: 'registered_at', width: '150px' },
  { title: 'Actions', key: 'actions', width: '200px', sortable: false },
]

const matchHeaders = [
  { title: 'Match', key: 'match_number', width: '80px' },
  { title: 'Participants', key: 'participants' },
  { title: 'Score', key: 'score', width: '100px' },
  { title: 'Status', key: 'status', width: '120px' },
  { title: 'Scheduled', key: 'scheduled_at', width: '150px' },
]

// Helpers
function getGame(gameId: string): GameSummary | undefined {
  return gamesStore.games.find((g) => g.id === gameId)
}

function formatMatchFormat(format: string): string {
  switch (format) {
    case 'bo1':
      return 'Best of 1'
    case 'bo3':
      return 'Best of 3'
    case 'bo5':
      return 'Best of 5'
    case 'bo7':
      return 'Best of 7'
    default:
      return format
  }
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'TBD'
  return new Date(dateStr).toLocaleDateString()
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString()
}

function getRegistrationStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'warning'
    case 'approved':
      return 'success'
    case 'checked_in':
      return 'primary'
    case 'rejected':
      return 'error'
    case 'withdrawn':
      return 'grey'
    default:
      return 'grey'
  }
}

function getMatchStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'grey'
    case 'scheduling':
      return 'info'
    case 'scheduled':
      return 'primary'
    case 'checking_in':
      return 'warning'
    case 'pick_ban':
      return 'info'
    case 'in_progress':
      return 'primary'
    case 'awaiting_result':
      return 'warning'
    case 'completed':
      return 'success'
    case 'cancelled':
      return 'error'
    default:
      return 'grey'
  }
}

function formatMatchStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
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

// Actions
async function publishTournament() {
  if (!tournament.value) return
  try {
    await tournamentsStore.publishTournament(tournament.value.id)
    showSnackbar('Tournament published successfully', 'success')
  } catch {
    showSnackbar(tournamentsStore.error || 'Failed to publish tournament', 'error')
  }
}

async function openRegistration() {
  if (!tournament.value) return
  try {
    await tournamentsStore.openRegistration(tournament.value.id)
    showSnackbar('Registration opened successfully', 'success')
  } catch {
    showSnackbar(tournamentsStore.error || 'Failed to open registration', 'error')
  }
}

async function closeRegistration() {
  if (!tournament.value) return
  try {
    await tournamentsStore.closeRegistration(tournament.value.id)
    showSnackbar('Registration closed successfully', 'success')
  } catch {
    showSnackbar(tournamentsStore.error || 'Failed to close registration', 'error')
  }
}

async function startTournament() {
  if (!tournament.value) return
  try {
    await tournamentsStore.startTournament(tournament.value.id)
    showSnackbar('Tournament started successfully', 'success')
    // Refresh to load generated bracket and matches
    await fetchData()
  } catch {
    showSnackbar(tournamentsStore.error || 'Failed to start tournament', 'error')
  }
}

function openEditModal() {
  editModalOpen.value = true
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

// Registration action handlers
async function handleApprove(registration: TournamentRegistrationResponse) {
  if (!tournament.value) return
  actionLoadingId.value = registration.id
  try {
    await tournamentsStore.approveRegistration(tournament.value.id, registration.id)
    showSnackbar(`${registration.participant_name} approved`, 'success')
  } catch {
    showSnackbar(tournamentsStore.error || 'Failed to approve registration', 'error')
  } finally {
    actionLoadingId.value = null
  }
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
      showSnackbar(`${participantName} rejected`, 'success')
    } else {
      await tournamentsStore.disqualifyRegistration(
        tournament.value.id,
        selectedRegistration.value.id,
        reason
      )
      showSnackbar(`${participantName} disqualified`, 'success')
    }
    showReasonModal.value = false
  } catch {
    showSnackbar(tournamentsStore.error || `Failed to ${reasonModalMode.value} registration`, 'error')
  } finally {
    actionLoadingId.value = null
    selectedRegistration.value = null
  }
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
