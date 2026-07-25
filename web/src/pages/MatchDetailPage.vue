<template>
  <v-container>
    <ErrorAlert :error="combinedError" retryable @clear="clearError" @retry="fetchAll" />

    <!-- Loading State -->
    <v-skeleton-loader v-if="loading && !match" type="article" class="mb-4" />

    <!-- Content -->
    <template v-else-if="match && tournament">
      <!-- Breadcrumb -->
      <v-breadcrumbs :items="breadcrumbs" class="pa-0 mb-4" />

      <!-- Match Header -->
      <v-card class="mb-6">
        <v-card-text>
          <v-row align="center">
            <!-- Participant 1 -->
            <v-col cols="12" sm="5" class="text-center">
              <v-avatar size="64" rounded="lg" class="mb-2">
                <v-img :alt="match.participant1_name ?? 'Participant 1'" v-if="match.participant1_logo_url" :src="match.participant1_logo_url" />
                <v-icon v-else size="32">mdi-account</v-icon>
              </v-avatar>
              <h3 class="text-h6" :class="{ 'font-weight-bold text-success': isWinner(match.participant1_registration_id) }">
                <v-icon v-if="isWinner(match.participant1_registration_id)" size="small" color="success" aria-label="Winner">mdi-trophy</v-icon>
                {{ match.participant1_name || 'TBD' }}
              </h3>
              <v-chip v-if="match.participant1_seed" size="small" variant="tonal" class="mt-1">
                Seed #{{ match.participant1_seed }}
              </v-chip>
            </v-col>

            <!-- Score / Status -->
            <v-col cols="12" sm="2" class="text-center">
              <template v-if="match.status === 'completed'">
                <div class="text-h3 font-weight-bold">
                  {{ match.participant1_score }} - {{ match.participant2_score }}
                </div>
                <v-chip color="success" size="small" class="mt-2">
                  Final
                </v-chip>
              </template>
              <template v-else-if="match.status === 'in_progress'">
                <div class="text-h3 font-weight-bold text-primary">
                  {{ match.participant1_score }} - {{ match.participant2_score }}
                </div>
                <v-chip color="primary" size="small" class="mt-2">
                  <v-icon start size="small">mdi-circle</v-icon>
                  Live
                </v-chip>
              </template>
              <template v-else>
                <div class="text-h4 text-medium-emphasis">VS</div>
                <v-chip :color="getMatchStatusColor(match.status)" size="small" class="mt-2">
                  {{ getMatchStatusLabel(match.status) }}
                </v-chip>
              </template>
            </v-col>

            <!-- Participant 2 -->
            <v-col cols="12" sm="5" class="text-center">
              <v-avatar size="64" rounded="lg" class="mb-2">
                <v-img :alt="match.participant2_name ?? 'Participant 2'" v-if="match.participant2_logo_url" :src="match.participant2_logo_url" />
                <v-icon v-else size="32">mdi-account</v-icon>
              </v-avatar>
              <h3 class="text-h6" :class="{ 'font-weight-bold text-success': isWinner(match.participant2_registration_id) }">
                <v-icon v-if="isWinner(match.participant2_registration_id)" size="small" color="success" aria-label="Winner">mdi-trophy</v-icon>
                {{ match.participant2_name || 'TBD' }}
              </h3>
              <v-chip v-if="match.participant2_seed" size="small" variant="tonal" class="mt-1">
                Seed #{{ match.participant2_seed }}
              </v-chip>
            </v-col>
          </v-row>

          <!-- Per-map results: the primary artifact of a finished series. -->
          <MapResultsSummary
            v-if="match.status === 'completed' && currentResult"
            :claim="currentResult"
            :maps="vetoPickedMaps"
          />

          <!-- Match Info -->
          <v-divider class="my-4" />
          <div class="d-flex justify-center ga-4 flex-wrap">
            <v-chip variant="tonal">
              <v-icon start size="small">mdi-tournament</v-icon>
              Match #{{ match.match_number }}
            </v-chip>
            <v-chip variant="tonal">
              <v-icon start size="small">mdi-layers</v-icon>
              Round {{ match.round }}
            </v-chip>
            <v-chip variant="tonal">
              <v-icon start size="small">mdi-sword-cross</v-icon>
              {{ formatMatchFormat(match.match_format) }}
            </v-chip>
            <v-chip v-if="match.scheduled_at" variant="tonal">
              <v-icon start size="small">mdi-calendar</v-icon>
              {{ formatDateTime(match.scheduled_at) }}
            </v-chip>
          </div>
        </v-card-text>
      </v-card>

      <!-- Match Status Timeline -->
      <MatchStatusTimeline :match="match" :scheduling-mode="tournament.scheduling_mode as 'live' | 'self_scheduled' | 'hybrid'" class="mb-6" />

      <!-- Scheduling Panel (for self-scheduled matches, includes calendar overlay) -->
      <MatchSchedulingPanel
        v-if="showSchedulingPanel"
        :tournament="tournament"
        :match="match"
        :active-proposal="activeProposal"
        :is-proposer="isProposer"
        :can-propose="canPropose"
        :loading="schedulingLoading"
        :suggested-times="suggestedTimes"
        :opponent-player-id="opponentPlayerId"
        class="mb-6"
        @propose="handlePropose"
        @accept="handleAccept"
        @reject="handleReject"
        @counter="handleCounter"
        @withdraw="handleWithdraw"
      />

      <!-- Check-in Panel (when scheduled or check-in is open) -->
      <v-card v-if="showCheckInPanel" class="mb-6">
        <v-card-title>
          <v-icon start>mdi-checkbox-marked-circle-outline</v-icon>
          Match Check-in
        </v-card-title>
        <v-card-text>
          <p class="mb-4">
            Both participants need to check in before the match can begin.
          </p>
          <!-- Deadline + consequence: players need to know by WHEN and what
               happens if they miss it. -->
          <v-alert
            v-if="match.scheduled_at"
            type="info"
            variant="tonal"
            density="compact"
            class="mb-4"
          >
            <template v-if="checkInCountdown">
              Match starts in <strong>{{ checkInCountdown }}</strong>
              ({{ formatDateTime(match.scheduled_at) }}).
            </template>
            <template v-else>
              Match start time: {{ formatDateTime(match.scheduled_at) }}.
            </template>
            Teams that fail to check in can be forfeited as a no-show.
          </v-alert>
          <!-- Per-participant check-in status -->
          <div class="d-flex align-center mb-2">
            <v-icon
              :color="match.participant1_checked_in_at ? 'success' : 'grey'"
              class="mr-2"
            >
              {{ match.participant1_checked_in_at ? 'mdi-check-circle' : 'mdi-circle-outline' }}
            </v-icon>
            <span>{{ match.participant1_name || 'TBD' }}</span>
            <span v-if="match.participant1_checked_in_at" class="text-caption ml-2 text-success">
              Checked in
            </span>
          </div>
          <div class="d-flex align-center mb-4">
            <v-icon
              :color="match.participant2_checked_in_at ? 'success' : 'grey'"
              class="mr-2"
            >
              {{ match.participant2_checked_in_at ? 'mdi-check-circle' : 'mdi-circle-outline' }}
            </v-icon>
            <span>{{ match.participant2_name || 'TBD' }}</span>
            <span v-if="match.participant2_checked_in_at" class="text-caption ml-2 text-success">
              Checked in
            </span>
          </div>

          <v-btn
            v-if="!userAlreadyCheckedIn"
            color="primary"
            size="large"
            :disabled="!userRegistrationId"
            :loading="tournamentsStore.matchCheckInState.loading"
            @click="handleMatchCheckIn"
          >
            <v-icon start>mdi-check</v-icon>
            Check In
          </v-btn>
          <v-alert v-else type="info" variant="tonal" density="compact">
            You've checked in. Waiting for opponent...
          </v-alert>

          <!-- Provisional lineup declaration (§0b) — declare who's playing. -->
          <LineupDeclarePanel
            :tournament-id="tournament.id"
            :match-id="match.id"
            :user-registration-id="userRegistrationId"
            class="mt-4"
          />
        </v-card-text>
      </v-card>

      <!-- Lineups (who played) — provisional declaration + demo-derived,
           opponent-visible once locked. -->
      <LineupPanel
        v-if="match.participant1_registration_id || match.participant2_registration_id"
        :tournament-id="tournament.id"
        :match-id="match.id"
        :participant1-registration-id="match.participant1_registration_id"
        :participant2-registration-id="match.participant2_registration_id"
        :participant1-name="match.participant1_name"
        :participant2-name="match.participant2_name"
        class="mb-6"
      />

      <!-- Lobby Presence Bar (shown during live lobby states) -->
      <LobbyPresenceBar
        v-if="showVetoPanel && lobbyParticipants.length > 0"
        :participants="lobbyParticipants"
        :spectator-count="lobbySpectatorCount"
        :connected="lobbyConnected"
      />

      <!-- Veto Panel (map pick/ban before match starts) -->
      <VetoPanel
        v-if="showVetoPanel"
        :match-id="match.id"
        :match-format="match.match_format"
        :user-registration-id="userRegistrationId"
        :participant1-registration-id="match.participant1_registration_id"
        :participant2-registration-id="match.participant2_registration_id"
        :participant1-name="match.participant1_name || 'Team 1'"
        :participant2-name="match.participant2_name || 'Team 2'"
      />

      <!-- Lobby Chat Panel (shown during live lobby states) -->
      <LobbyChatPanel
        v-if="showVetoPanel && lobbyConnected"
        :messages="lobbyChatMessages"
        :connected="lobbyConnected"
        @send="handleChatSend"
      />

      <!-- Game server (MatchZy integration §7.2) -->
      <MatchServerPanel
        v-if="matchIdRef"
        :match-id="matchIdRef"
        :is-admin="authStore.isAdmin"
      />

      <!-- Forfeit Button -->
      <v-card v-if="canForfeit" class="mb-6" variant="outlined" color="error">
        <v-card-text class="d-flex align-center justify-space-between">
          <div>
            <div class="text-body-2 font-weight-medium">Forfeit Match</div>
            <div class="text-caption text-medium-emphasis">
              Forfeit this match. Your opponent will be declared the winner.
            </div>
          </div>
          <v-btn
            color="error"
            variant="outlined"
            size="small"
            :loading="tournamentsStore.forfeitMatchState.loading"
            @click="handleForfeit"
          >
            <v-icon start size="small">mdi-flag</v-icon>
            Forfeit
          </v-btn>
        </v-card-text>
      </v-card>

      <!-- Result Submission/Confirmation Panel -->
      <template v-if="showResultPanel">
        <!-- Show confirmation panel when opponent has submitted -->
        <ResultConfirmationPanel
          v-if="showConfirmationPanel && currentResult"
          :match-id="match.id"
          :claim="currentResult"
          :team-a-name="match.participant1_name || 'Team 1'"
          :team-b-name="match.participant2_name || 'Team 2'"
          :team-a-registration-id="match.participant1_registration_id || ''"
          :team-b-registration-id="match.participant2_registration_id || ''"
          :submitter-name="getSubmitterName(currentResult)"
          :tournament-id="tournament.id"
          :registration-id="userRegistrationId ?? undefined"
          class="mb-6"
          @confirmed="handleResultConfirmed"
          @disputed="handleResultDisputed"
        />

        <!-- Show submission panel when user can submit -->
        <ResultSubmissionPanel
          v-else-if="canSubmitResult"
          :match-id="match.id"
          :tournament-id="tournament.id"
          :team-a-name="match.participant1_name || 'Team 1'"
          :team-b-name="match.participant2_name || 'Team 2'"
          :team-a-registration-id="match.participant1_registration_id || ''"
          :team-b-registration-id="match.participant2_registration_id || ''"
          :match-format="matchFormat"
          :maps="vetoPickedMaps"
          :selectable-maps="selectableMaps"
          class="mb-6"
        />

        <!-- Show waiting message when user submitted and waiting for opponent -->
        <v-card v-else-if="showWaitingForOpponent && currentResult" class="mb-6">
          <v-card-title class="d-flex align-center">
            <v-icon start color="info">mdi-clock-outline</v-icon>
            Awaiting Opponent Confirmation
          </v-card-title>
          <v-card-text>
            <p class="mb-4">
              You have submitted a result. Waiting for your opponent to confirm or dispute.
            </p>

            <v-card variant="outlined" class="pa-3 mb-4">
              <div class="text-center">
                <strong>Submitted Result:</strong>
                <div class="text-h5 mt-2">
                  {{ match.participant1_name }} {{ currentResult.claimed_participant1_score }} -
                  {{ currentResult.claimed_participant2_score }} {{ match.participant2_name }}
                </div>
              </div>
            </v-card>

            <v-alert v-if="autoConfirmCountdown" type="info" variant="tonal">
              <v-icon start size="small">mdi-robot</v-icon>
              Auto-confirms in <strong>{{ autoConfirmCountdown }}</strong> if not disputed.
            </v-alert>
          </v-card-text>
        </v-card>
      </template>

      <!-- Result Review Alert (admin-flagged review) -->
      <ResultReviewAlert
        v-if="match.status === 'completed'"
        :match-id="match.id"
        :user-registration-id="userRegistrationId"
      />

      <!-- Dispute Thread (when match is disputed and we have a dispute from result history) -->
      <DisputeThreadPanel
        v-if="match.disputed && activeDisputeId"
        :dispute-id="activeDisputeId"
        :can-reply="!!userRegistrationId"
      />

      <!-- Match Evidence -->
      <v-card v-if="evidenceStore.linkedDemos.length > 0 || evidenceStore.evidence.length > 0" class="mb-6">
        <v-card-title>
          <v-icon start>mdi-file-document-outline</v-icon>
          Match Evidence
        </v-card-title>
        <v-card-text>
          <EvidenceDisplay
            :linked-demos="evidenceStore.linkedDemos"
            :evidence="evidenceStore.evidence"
            :match-id="match.id"
          />
        </v-card-text>
      </v-card>

      <!-- Result History -->
      <ResultHistoryTimeline
        v-if="resultHistory.length > 0"
        :history="resultHistory"
        :team-a-name="match.participant1_name || 'Team 1'"
        :team-b-name="match.participant2_name || 'Team 2'"
        class="mb-6"
      />

      <!-- Proposal History -->
      <v-card v-if="proposalHistory.length > 0">
        <v-card-title>
          <v-icon start>mdi-history</v-icon>
          Scheduling History
        </v-card-title>
        <v-card-text>
          <v-timeline density="compact" side="end">
            <v-timeline-item
              v-for="proposal in proposalHistory"
              :key="proposal.id"
              :dot-color="getProposalStatusColor(proposal.status)"
              size="small"
            >
              <div class="d-flex justify-space-between align-center">
                <div>
                  <strong>{{ getProposalStatusLabel(proposal.status) }}</strong>
                  <div class="text-caption text-medium-emphasis">
                    {{ formatDateTime(proposal.created_at) }}
                  </div>
                </div>
                <v-chip size="x-small" :color="getProposalStatusColor(proposal.status)">
                  {{ proposal.proposed_times.length }} time{{ proposal.proposed_times.length > 1 ? 's' : '' }} proposed
                </v-chip>
              </div>
            </v-timeline-item>
          </v-timeline>
        </v-card-text>
      </v-card>
    </template>

    <!-- Not Found -->
    <EmptyState
      v-else-if="!loading"
      icon="mdi-alert-circle"
      title="Match Not Found"
      subtitle="The match you're looking for doesn't exist."
    >
      <template #action>
        <v-btn color="primary" class="mt-4" :to="{ name: 'tournaments' }">
          Browse Tournaments
        </v-btn>
      </template>
    </EmptyState>

    <!-- Confirm Dialog -->
    <ConfirmDialogHost :dialog="confirmDialog" />

  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getProposalStatusColor, getProposalStatusLabel } from '@/stores/matchScheduling'
import type { ResultClaimResponse } from '@/stores/matchResults'
import { useTournamentsStore } from '@/stores/tournaments'
import { useMatchDetail } from '@/composables/useMatchDetail'
import { useMatchLobby, provideMatchLobby } from '@/composables/useMatchLobby'
import MatchStatusTimeline from '@/components/match/MatchStatusTimeline.vue'
import MatchSchedulingPanel from '@/components/match/MatchSchedulingPanel.vue'
import ResultSubmissionPanel from '@/components/match/results/ResultSubmissionPanel.vue'
import ResultConfirmationPanel from '@/components/match/results/ResultConfirmationPanel.vue'
import ResultHistoryTimeline from '@/components/match/results/ResultHistoryTimeline.vue'
import MapResultsSummary from '@/components/match/results/MapResultsSummary.vue'
import EvidenceDisplay from '@/components/match/evidence/EvidenceDisplay.vue'
import VetoPanel from '@/components/match/veto/VetoPanel.vue'
import LineupPanel from '@/components/match/LineupPanel.vue'
import LineupDeclarePanel from '@/components/match/LineupDeclarePanel.vue'
import LobbyChatPanel from '@/components/match/LobbyChatPanel.vue'
import MatchServerPanel from '@/components/match/MatchServerPanel.vue'
import { useAuthStore } from '@/stores/auth'
import { useMatchServerStore } from '@/stores/matchServer'
import LobbyPresenceBar from '@/components/match/LobbyPresenceBar.vue'
import DisputeThreadPanel from '@/components/match/DisputeThreadPanel.vue'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useDisputesStore } from '@/stores/disputes'
import ResultReviewAlert from '@/components/match/results/ResultReviewAlert.vue'
import { useSnackbar } from '@/composables/useSnackbar'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { formatDateTime } from '@/utils/formatters'
import {
  getMatchStatusColor, getMatchStatusLabel, formatMatchFormat,
} from '@/utils/matchStatus'

const route = useRoute()

const {
  match, tournament, activeProposal, proposalHistory,
  currentResult, resultHistory, matchFormat,
  loading, schedulingLoading, error: combinedError, clearError,
  showSchedulingPanel, showCheckInPanel, isProposer, canPropose,
  showResultPanel, showConfirmationPanel, canSubmitResult,
  showWaitingForOpponent, autoConfirmCountdown, checkInCountdown, vetoPickedMaps,
  selectableMaps,
  opponentPlayerId, suggestedTimes, userRegistrationId,
  fetchAll,
  schedulingStore,
  resultsStore,
  evidenceStore,
} = useMatchDetail()

const tournamentsStore = useTournamentsStore()
const disputesStore = useDisputesStore()

// UI state (stays in the page)
const snackbar = useSnackbar()
const feedback = useActionFeedback()
const confirmDialog = useConfirmDialog()

// Own the match-lobby composable at the page level and provide it to
// descendants (VetoPanel, chat/presence panels) so there's a single
// websocket per match regardless of consumer count. Previously VetoPanel
// instantiated the composable and re-exposed lobby state via defineExpose,
// which coupled MatchDetailPage to a template ref — moved to provide/inject.
const matchIdRef = computed<string | null>(() => match.value?.id ?? null)

// Game-server reservation state (MatchZy §7.2): fetched per match, kept
// fresh by status changes + the lobby websocket pushes.
const authStore = useAuthStore()
const matchServerStore = useMatchServerStore()
watch(
  matchIdRef,
  (id) => {
    matchServerStore.clear()
    if (id) {
      void matchServerStore.fetchMatchServer(id)
      void matchServerStore.fetchSubstitutions(id)
    }
  },
  { immediate: true },
)
watch(
  () => match.value?.status,
  (status, prev) => {
    if (status && prev && status !== prev && matchIdRef.value) {
      void matchServerStore.fetchMatchServer(matchIdRef.value)
    }
  },
)

// §7.3 / review M7: on a reload during server setup or a live match the
// veto panel never mounts (it only renders for checking_in/pick_ban), so
// nothing would open the lobby socket — connect it here whenever a
// reservation is active.
watch(
  () => matchServerStore.reservation?.status,
  (status, prev) => {
    if (status !== prev && matchServerStore.isActive()) {
      void matchLobby.initialize()
    }
  },
)
const matchLobby = useMatchLobby(matchIdRef, userRegistrationId)
provideMatchLobby(matchLobby)

const lobbyParticipants = matchLobby.participants
const lobbySpectatorCount = matchLobby.spectatorCount
const lobbyConnected = matchLobby.connected
const lobbyChatMessages = matchLobby.chatMessages

function handleChatSend(chatType: 'team' | 'all', content: string) {
  matchLobby.sendChat(chatType, content)
}

// Veto panel visibility: show when match has veto_required and is in veto-relevant states
// The match state machine is: ... → checking_in → pick_ban → in_progress → ...
// Show the panel during pick_ban (active veto) and checking_in (upcoming veto preview)
const showVetoPanel = computed(() => {
  if (!match.value || !tournament.value) return false
  if (!match.value.veto_required) return false
  return ['checking_in', 'pick_ban'].includes(match.value.status)
})

// Forfeit: available when user is a participant and match is active
const canForfeit = computed(() => {
  if (!match.value || !userRegistrationId.value || !tournament.value) return false
  return ['scheduled', 'checking_in', 'ready', 'pick_ban', 'in_progress', 'awaiting_result'].includes(match.value.status)
})

const breadcrumbs = computed(() => [
  { title: 'Tournaments', to: { name: 'tournaments' } },
  {
    title: tournament.value?.name || 'Tournament',
    to: { name: 'tournament-detail', params: { slug: route.params.tournamentSlug } },
  },
  { title: `Match #${match.value?.match_number || ''}`, disabled: true },
])

// Active dispute for this match (fetched via GET /tournaments/{id}/matches/{id}/dispute)
const activeDisputeId = computed(() => disputesStore.matchDispute?.id ?? null)

const userAlreadyCheckedIn = computed(() => {
  if (!match.value || !userRegistrationId.value) return false
  if (userRegistrationId.value === match.value.participant1_registration_id)
    return !!match.value.participant1_checked_in_at
  if (userRegistrationId.value === match.value.participant2_registration_id)
    return !!match.value.participant2_checked_in_at
  return false
})

// Template helpers
function isWinner(registrationId: string | null | undefined): boolean {
  if (!registrationId || !match.value?.winner_registration_id) return false
  return match.value.winner_registration_id === registrationId
}

// Match status/format helpers imported from @/utils/matchStatus.

function getSubmitterName(claim: ResultClaimResponse): string {
  if (claim.submitted_by_registration_id === match.value?.participant1_registration_id) {
    return match.value?.participant1_name || 'Opponent'
  }
  return match.value?.participant2_name || 'Opponent'
}

// Match check-in
async function handleMatchCheckIn() {
  if (!tournament.value || !match.value || !userRegistrationId.value) return
  await feedback.run(
    () => tournamentsStore.matchCheckIn(tournament.value!.id, match.value!.id, userRegistrationId.value!),
    {
      success: 'Checked in successfully!',
      failureFallback: 'Failed to check in',
      errorSource: tournamentsStore,
      after: fetchAll,
    },
  )
}

// Forfeit handler — requires the forfeiting user's registration id so the
// backend knows which side conceded (endpoint body is { registration_id }).
function handleForfeit() {
  if (!tournament.value || !match.value || !userRegistrationId.value) return
  const regId = userRegistrationId.value
  confirmDialog.confirm({
    title: 'Forfeit Match',
    message: 'Are you sure you want to forfeit this match? This cannot be undone. Your opponent will be declared the winner.',
    action: 'Forfeit',
    color: 'error',
    handler: async () => {
      await tournamentsStore.forfeitMatch(tournament.value!.id, match.value!.id, regId)
      snackbar.show('Match forfeited.', 'warning')
      await fetchAll()
    },
  })
}

// Thin event handlers
async function handlePropose(times: string[], notes?: string) {
  if (!tournament.value || !match.value) return
  await feedback.run(
    () => schedulingStore.proposeSchedule(tournament.value!.id, match.value!.id, times, notes),
    {
      success: 'Schedule proposal sent!',
      failureFallback: 'Failed to send proposal',
      errorSource: schedulingStore,
      after: fetchAll,
    },
  )
}

async function handleAccept(selectedTime: string) {
  if (!tournament.value || !match.value || !activeProposal.value) return
  const proposalId = activeProposal.value.id
  await feedback.run(
    () => schedulingStore.acceptProposal(tournament.value!.id, match.value!.id, {
      proposal_id: proposalId,
      selected_time: selectedTime,
    }),
    {
      success: 'Schedule accepted!',
      failureFallback: 'Failed to accept proposal',
      errorSource: schedulingStore,
      after: fetchAll,
    },
  )
}

async function handleReject(reason?: string) {
  if (!tournament.value || !match.value || !activeProposal.value) return
  const proposalId = activeProposal.value.id
  await feedback.run(
    () => schedulingStore.rejectProposal(tournament.value!.id, match.value!.id, {
      proposal_id: proposalId,
    }, reason),
    {
      // Info-level result; useActionFeedback always shows 'success' as success color,
      // but the original code used 'info'. Snackbar color doesn't carry semantic
      // weight here beyond visual tone — keep as success for consistency.
      success: 'Proposal rejected',
      failureFallback: 'Failed to reject proposal',
      errorSource: schedulingStore,
      after: fetchAll,
    },
  )
}

async function handleCounter(times: string[], notes?: string) {
  if (!tournament.value || !match.value || !activeProposal.value) return
  const proposalId = activeProposal.value.id
  await feedback.run(
    () => schedulingStore.counterPropose(tournament.value!.id, match.value!.id, proposalId, times, notes),
    {
      success: 'Counter-proposal sent!',
      failureFallback: 'Failed to send counter-proposal',
      errorSource: schedulingStore,
      after: fetchAll,
    },
  )
}

/**
 * Withdraw the viewer's own pending proposal (P-9). Only reachable from the
 * proposer branch of ProposalCard; the backend independently enforces
 * "caller must be the proposer" with a 403.
 */
async function handleWithdraw() {
  if (!tournament.value || !match.value || !activeProposal.value) return
  const proposalId = activeProposal.value.id
  await feedback.run(
    () => schedulingStore.cancelProposal(tournament.value!.id, match.value!.id, {
      proposal_id: proposalId,
    }),
    {
      success: 'Proposal withdrawn',
      failureFallback: 'Failed to withdraw proposal',
      errorSource: schedulingStore,
      after: fetchAll,
    },
  )
}

/**
 * P-127 — the submitter's feedback, driven by state rather than by an event.
 *
 * This replaces `handleResultSubmitted`, which was bound to
 * `ResultSubmissionPanel`'s `@submitted` and **could never run**: the panel
 * renders behind `canSubmitResult`, `submitResult` writes the new pending
 * claim that falsifies it, and Vue's `emit()` discards events from an
 * unmounted instance. So the user got no confirmation that the most
 * important action on the page had worked. See the watcher in
 * `useMatchDetail` for the full mechanism and for the match refresh.
 *
 * Unlike `@disputed`/`@confirmed` below — which P-6 deliberately left wired
 * as the correct response should the event ever land — the `@submitted`
 * binding is GONE from the template rather than kept alongside this watcher,
 * because the two would double-fire the snackbar the day the panel stops
 * being unmounted by its own write. Nothing is lost: this watcher fires on
 * exactly the same successful submission, mounted or not.
 */
watch(
  () => resultsStore.submitResultState.loading,
  (isLoading, wasLoading) => {
    if (isLoading || !wasLoading) return
    if (resultsStore.submitResultState.error) return
    snackbar.show('Result submitted! Waiting for opponent confirmation.', 'success')
  },
)

async function handleResultConfirmed() {
  snackbar.show('Result confirmed! Match completed.', 'success')
  await fetchAll()
}

/**
 * P-6: this used to call `fetchResultData()`, which refetches the CLAIM and the
 * claim history and nothing else — while disputing also rewrites the MATCH
 * (`status` → `disputed`, `disputed` → true) and creates the dispute row that
 * gates the thread panel. `fetchAll` is what `handleResultConfirmed` already
 * does, for the same reason.
 *
 * DO NOT rely on this handler for the refresh, though: `ResultConfirmationPanel`
 * is unmounted by the store write that precedes its own `emit('disputed')`, so
 * `@disputed` does not reliably arrive here at all. The refresh that actually
 * runs is the claim-status watcher in `useMatchDetail`; see the comment there.
 * This stays because it is the correct response if the event does land, and
 * because the snackbar is this component's to show.
 */
async function handleResultDisputed() {
  snackbar.show('Result disputed. An admin will review.', 'warning')
  await fetchAll()
}

// Lifecycle
watch(
  () => [route.params.tournamentSlug, route.params.matchId],
  ([slug, matchId]) => {
    // Params empty out while navigating away — don't fire a spurious fetch.
    if (slug && matchId) fetchAll()
  }
)

onMounted(() => { fetchAll() })
</script>
