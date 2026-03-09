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
        <v-btn
          v-if="canComplete"
          color="success"
          prepend-icon="mdi-flag-checkered"
          @click="completeTournament"
        >
          Complete
        </v-btn>
        <v-btn
          v-if="canFinalize"
          color="success"
          prepend-icon="mdi-check-all"
          @click="finalizeTournament"
        >
          Finalize
        </v-btn>
        <v-btn
          v-if="canProcessNoShows"
          color="warning"
          variant="tonal"
          prepend-icon="mdi-account-alert"
          :loading="tournamentsStore.processNoShowsState.loading.value"
          @click="handleProcessNoShows"
        >
          Process No-Shows
        </v-btn>
        <v-btn
          v-if="canCancel"
          color="error"
          variant="tonal"
          prepend-icon="mdi-cancel"
          @click="confirmCancelTournament"
        >
          Cancel
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

                    <!-- Approved: Admin Check-In + Disqualify -->
                    <template v-else-if="item.status === 'approved'">
                      <v-btn
                        v-if="tournament?.check_in_required"
                        color="info"
                        size="small"
                        variant="tonal"
                        :loading="actionLoadingId === item.id"
                        :disabled="actionLoadingId !== null && actionLoadingId !== item.id"
                        @click="handleAdminCheckIn(item)"
                      >
                        Check In
                      </v-btn>
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

                    <!-- Checked-in / Active: Disqualify only -->
                    <template v-else-if="['checked_in', 'active'].includes(item.status)">
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
              <!-- Swiss Round Advancement -->
              <div v-if="isSwissFormat && tournament?.status === 'in_progress'" class="mb-4 d-flex align-center gap-3">
                <span v-if="swissBracket" class="text-subtitle-1">
                  Round {{ (swissBracket as Record<string, unknown>).current_round }} of {{ (swissBracket as Record<string, unknown>).total_rounds }}
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
            <v-card-text>
              <div class="d-flex align-center gap-2 mb-4">
                <v-btn
                  color="primary"
                  prepend-icon="mdi-auto-fix"
                  :loading="tournamentsStore.autoSeedState.loading.value"
                  @click="handleAutoSeed"
                >
                  Auto Seed
                </v-btn>
                <v-btn
                  variant="tonal"
                  prepend-icon="mdi-content-save"
                  :loading="tournamentsStore.manualSeedState.loading.value"
                  :disabled="seedingList.length === 0"
                  @click="handleSaveSeeding"
                >
                  Save Manual Seeding
                </v-btn>
                <v-btn
                  variant="tonal"
                  color="error"
                  prepend-icon="mdi-delete"
                  :loading="tournamentsStore.clearSeedingState.loading.value"
                  :disabled="tournamentsStore.seeding.length === 0"
                  @click="handleClearSeeding"
                >
                  Clear Seeding
                </v-btn>
              </div>

              <v-list v-if="seedingList.length > 0" density="compact">
                <v-list-item
                  v-for="(item, index) in seedingList"
                  :key="item.registration_id"
                  class="px-2"
                >
                  <template v-slot:prepend>
                    <v-chip size="small" variant="tonal" class="mr-3" min-width="40">
                      #{{ index + 1 }}
                    </v-chip>
                  </template>
                  <v-list-item-title>{{ item.participant_name }}</v-list-item-title>
                  <v-list-item-subtitle v-if="item.seed_rating">
                    Rating: {{ item.seed_rating }}
                  </v-list-item-subtitle>
                  <template v-slot:append>
                    <v-btn icon size="x-small" variant="text" :disabled="index === 0" @click="moveSeed(index, -1)">
                      <v-icon>mdi-chevron-up</v-icon>
                    </v-btn>
                    <v-btn icon size="x-small" variant="text" :disabled="index === seedingList.length - 1" @click="moveSeed(index, 1)">
                      <v-icon>mdi-chevron-down</v-icon>
                    </v-btn>
                  </template>
                </v-list-item>
              </v-list>
              <div v-else class="text-center pa-8">
                <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-sort-numeric-ascending</v-icon>
                <h3 class="text-h6 mb-2">No Seeding</h3>
                <p class="text-grey">Use "Auto Seed" to generate seeding based on ratings, or manually arrange participants.</p>
              </div>
            </v-card-text>
          </v-tabs-window-item>

          <!-- Matches Tab -->
          <v-tabs-window-item value="matches">
            <v-card-text>
              <div v-if="hasEligibleMatches" class="mb-4">
                <v-btn
                  color="primary"
                  prepend-icon="mdi-play-circle"
                  :loading="bulkStartLoading"
                  @click="handleBulkStartMatches"
                >
                  Start All Matches
                </v-btn>
              </div>
              <v-data-table
                :headers="matchHeaders"
                :items="matches"
                :loading="loading"
                :items-per-page="-1"
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

                <template v-slot:item.actions="{ item }">
                  <div class="d-flex gap-1">
                    <v-btn
                      icon
                      size="small"
                      variant="text"
                      @click="openMatchDetail(item.id)"
                    >
                      <v-icon>mdi-eye</v-icon>
                      <v-tooltip activator="parent" location="top">View Details</v-tooltip>
                    </v-btn>
                    <v-menu v-if="getNextMatchStatus(item.status)">
                      <template v-slot:activator="{ props: menuProps }">
                        <v-btn
                          size="small"
                          variant="tonal"
                          :color="getMatchActionColor(item.status)"
                          v-bind="menuProps"
                          :loading="matchTransitionLoadingId === item.id"
                          :disabled="matchTransitionLoadingId !== null && matchTransitionLoadingId !== item.id"
                        >
                          {{ getMatchActionLabel(item.status) }}
                          <v-icon end size="small">mdi-chevron-down</v-icon>
                        </v-btn>
                      </template>
                      <v-list density="compact">
                        <v-list-item
                          @click="handleMatchTransition(item.id, getNextMatchStatus(item.status)!)"
                        >
                          <v-list-item-title>{{ getMatchActionLabel(item.status) }}</v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-menu>
                  </div>
                </template>

                <template v-slot:no-data>
                  <div class="text-center pa-4">
                    <p class="text-grey">No matches generated yet</p>
                  </div>
                </template>
              </v-data-table>
            </v-card-text>
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

    <!-- Cancel Confirmation Dialog -->
    <ConfirmDialog
      :open="confirmDialog.open.value"
      :title="confirmDialog.title.value"
      :message="confirmDialog.message.value"
      :action-label="confirmDialog.actionLabel.value"
      :color="confirmDialog.color.value"
      :loading="confirmDialog.loading.value"
      @confirm="confirmDialog.execute"
      @cancel="confirmDialog.cancel"
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
import { useRoute, useRouter } from 'vue-router'
import { useGamesStore, type GameSummary } from '@/stores/games'
import { useTournamentsStore, formatTournamentFormat } from '@/stores/tournaments'
import TournamentStatusChip from '@/components/admin/TournamentStatusChip.vue'
import TournamentEditModal from '@/components/admin/TournamentEditModal.vue'
import TournamentBracket from '@/components/tournament/TournamentBracket.vue'
import RegistrationReasonModal from '@/components/admin/RegistrationReasonModal.vue'
import AdminMatchDetailModal from '@/components/admin/AdminMatchDetailModal.vue'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { formatDate, formatDateTime } from '@/utils/formatters'
import {
  getMatchStatusColor, formatMatchStatus,
  getNextMatchStatus, getMatchActionLabel, getMatchActionColor,
} from '@/utils/matchStatus'
import type { TournamentRegistrationResponse } from '@/stores/tournaments'

const route = useRoute()
const router = useRouter()
const gamesStore = useGamesStore()
const tournamentsStore = useTournamentsStore()

// State
const activeTab = ref('overview')
const editModalOpen = ref(false)
const snackbar = useSnackbar()

const confirmDialog = useConfirmDialog()
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

// Computed
const loading = computed(() => tournamentsStore.loading)
const error = computed(() => tournamentsStore.error)
const tournament = computed(() => tournamentsStore.currentTournament)
const registrations = computed(() => tournamentsStore.registrations)
const matches = computed(() => tournamentsStore.matches)
const brackets = computed(() => tournamentsStore.brackets)
const stages = computed(() => tournamentsStore.stages)

const sortedStages = computed(() =>
  [...stages.value].sort((a, b) => a.stage_order - b.stage_order)
)

const registrationCount = computed(() => registrations.value.length)
const matchCount = computed(() => matches.value.length)

const isSwissFormat = computed(() => tournament.value?.format === 'swiss')
const swissBracket = computed(() => brackets.value.length > 0 ? brackets.value[0] : null)
const allCurrentRoundMatchesCompleted = computed(() => {
  if (!swissBracket.value) return false
  const currentRound = (swissBracket.value as Record<string, unknown>).current_round as number | undefined
  if (!currentRound) return false
  const roundMatches = matches.value.filter((m) => m.round === currentRound)
  return roundMatches.length > 0 && roundMatches.every((m) => m.status === 'completed')
})
const canAdvanceRound = computed(() => {
  if (!isSwissFormat.value || tournament.value?.status !== 'in_progress') return false
  const bracket = swissBracket.value as Record<string, unknown> | null
  if (!bracket) return false
  const currentRound = bracket.current_round as number | undefined
  const totalRounds = bracket.total_rounds as number | undefined
  if (!currentRound || !totalRounds) return false
  return currentRound < totalRounds && allCurrentRoundMatchesCompleted.value
})

const canEditSeeding = computed(() =>
  tournament.value && ['registration', 'scheduled'].includes(tournament.value.status)
)
const canProcessNoShows = computed(() =>
  tournament.value?.status === 'scheduled' && tournament.value.check_in_required
)
const canPublish = computed(() => tournament.value?.status === 'draft')
const canOpenRegistration = computed(() => tournament.value?.status === 'published')
const canCloseRegistration = computed(() => tournament.value?.status === 'registration')
const canStart = computed(() => tournament.value?.status === 'scheduled')
const canCancel = computed(() => tournament.value && !['completed', 'finalized', 'cancelled'].includes(tournament.value.status))
const canComplete = computed(() => tournament.value?.status === 'in_progress')
const canFinalize = computed(() => tournament.value?.status === 'completed')

const hasEligibleMatches = computed(() => {
  if (tournament.value?.status !== 'in_progress') return false
  return matches.value.some(m => ['pending', 'ready', 'scheduled'].includes(m.status))
})

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
  { title: 'Actions', key: 'actions', width: '200px', sortable: false },
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
    const eligible = matches.value.filter(m => ['pending', 'ready', 'scheduled'].includes(m.status))
    const reason = 'Bulk admin action'
    for (const m of eligible) {
      // Follow state machine: pending → ready → scheduled → in_progress
      if (m.status === 'pending') {
        await tournamentsStore.adminMatchTransition(tournament.value.id, m.id, 'ready', reason)
      }
      if (m.status === 'pending' || m.status === 'ready') {
        await tournamentsStore.adminMatchTransition(tournament.value.id, m.id, 'scheduled', reason)
      }
      await tournamentsStore.adminMatchTransition(tournament.value.id, m.id, 'in_progress', reason)
    }
    snackbar.show(`${eligible.length} match(es) started`, 'success')
    await tournamentsStore.fetchMatches(tournament.value.id)
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to start matches', 'error')
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

// Actions
async function publishTournament() {
  if (!tournament.value) return
  try {
    await tournamentsStore.publishTournament(tournament.value.id)
    snackbar.show('Tournament published successfully', 'success')
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to publish tournament', 'error')
  }
}

async function openRegistration() {
  if (!tournament.value) return
  try {
    await tournamentsStore.openRegistration(tournament.value.id)
    snackbar.show('Registration opened successfully', 'success')
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to open registration', 'error')
  }
}

async function closeRegistration() {
  if (!tournament.value) return
  try {
    await tournamentsStore.closeRegistration(tournament.value.id)
    snackbar.show('Registration closed successfully', 'success')
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to close registration', 'error')
  }
}

async function startTournament() {
  if (!tournament.value) return
  try {
    await tournamentsStore.startTournament(tournament.value.id)
    snackbar.show('Tournament started successfully', 'success')
    // Refresh to load generated bracket and matches
    await fetchData()
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to start tournament', 'error')
  }
}

async function completeTournament() {
  if (!tournament.value) return
  try {
    await tournamentsStore.completeTournament(tournament.value.id)
    snackbar.show('Tournament completed successfully', 'success')
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to complete tournament', 'error')
  }
}

async function finalizeTournament() {
  if (!tournament.value) return
  try {
    await tournamentsStore.finalizeTournament(tournament.value.id)
    snackbar.show('Tournament finalized successfully', 'success')
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to finalize tournament', 'error')
  }
}

function confirmCancelTournament() {
  confirmDialog.confirm({
    title: 'Cancel Tournament',
    message: 'Are you sure you want to cancel this tournament? This action cannot be undone.',
    action: 'Cancel Tournament',
    color: 'error',
    handler: async () => {
      if (!tournament.value) return
      await tournamentsStore.cancelTournament(tournament.value.id)
      snackbar.show('Tournament cancelled', 'success')
    },
  })
}

async function advanceRound() {
  if (!tournament.value) return
  try {
    await tournamentsStore.generateNextRound(tournament.value.id)
    snackbar.show('Next round generated successfully', 'success')
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to generate next round', 'error')
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
  try {
    await tournamentsStore.approveRegistration(tournament.value.id, registration.id)
    snackbar.show(`${registration.participant_name} approved`, 'success')
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to approve registration', 'error')
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
  try {
    await tournamentsStore.autoSeed(tournament.value.id)
    snackbar.show('Seeding generated automatically', 'success')
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to auto-seed', 'error')
  }
}

async function handleSaveSeeding() {
  if (!tournament.value) return
  try {
    const seeds = seedingList.value.map((s, i) => ({
      registration_id: s.registration_id,
      seed: i + 1,
    }))
    await tournamentsStore.manualSeed(tournament.value.id, seeds)
    snackbar.show('Seeding saved', 'success')
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to save seeding', 'error')
  }
}

async function handleClearSeeding() {
  if (!tournament.value) return
  try {
    await tournamentsStore.clearSeeding(tournament.value.id)
    snackbar.show('Seeding cleared', 'success')
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to clear seeding', 'error')
  }
}

// Stage handler
async function handleCreateStage() {
  if (!tournament.value || !newStage.value.name) return
  try {
    await tournamentsStore.createStage(tournament.value.id, {
      name: newStage.value.name,
      stage_order: newStage.value.stage_order,
      format: newStage.value.format,
      match_format: newStage.value.match_format,
    } as any)
    stageCreateModalOpen.value = false
    newStage.value = { name: '', stage_order: stages.value.length + 1, format: null, match_format: null }
    snackbar.show('Stage created', 'success')
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to create stage', 'error')
  }
}

// No-shows handler
async function handleProcessNoShows() {
  if (!tournament.value) return
  try {
    await tournamentsStore.processNoShows(tournament.value.id)
    snackbar.show('No-shows processed', 'success')
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to process no-shows', 'error')
  }
}

// Admin check-in handler
async function handleAdminCheckIn(registration: TournamentRegistrationResponse) {
  if (!tournament.value) return
  actionLoadingId.value = registration.id
  try {
    await tournamentsStore.adminCheckIn(tournament.value.id, registration.id)
    snackbar.show(`${registration.participant_name} checked in`, 'success')
  } catch {
    snackbar.show(tournamentsStore.error || 'Failed to admin check-in', 'error')
  } finally {
    actionLoadingId.value = null
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
