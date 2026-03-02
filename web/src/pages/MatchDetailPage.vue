<template>
  <v-container>
    <!-- Loading State -->
    <div v-if="loading && !match" class="text-center pa-8">
      <v-progress-circular indeterminate color="primary" size="48" />
      <p class="text-grey mt-4">Loading match...</p>
    </div>

    <!-- Content -->
    <template v-else-if="match && tournament">
      <!-- Breadcrumb -->
      <v-breadcrumbs :items="breadcrumbs" class="pa-0 mb-4" />

      <!-- Match Header -->
      <v-card class="mb-6">
        <v-card-text>
          <v-row align="center">
            <!-- Participant 1 -->
            <v-col cols="5" class="text-center">
              <v-avatar size="64" rounded="lg" class="mb-2">
                <v-img v-if="match.participant1_logo_url" :src="match.participant1_logo_url" />
                <v-icon v-else size="32">mdi-account</v-icon>
              </v-avatar>
              <h3 class="text-h6" :class="{ 'font-weight-bold text-success': isWinner(match.participant1_registration_id) }">
                {{ match.participant1_name || 'TBD' }}
              </h3>
              <v-chip v-if="match.participant1_seed" size="small" variant="tonal" class="mt-1">
                Seed #{{ match.participant1_seed }}
              </v-chip>
            </v-col>

            <!-- Score / Status -->
            <v-col cols="2" class="text-center">
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
                <div class="text-h4 text-grey">VS</div>
                <v-chip :color="getStatusColor(match.status)" size="small" class="mt-2">
                  {{ getStatusLabel(match.status) }}
                </v-chip>
              </template>
            </v-col>

            <!-- Participant 2 -->
            <v-col cols="5" class="text-center">
              <v-avatar size="64" rounded="lg" class="mb-2">
                <v-img v-if="match.participant2_logo_url" :src="match.participant2_logo_url" />
                <v-icon v-else size="32">mdi-account</v-icon>
              </v-avatar>
              <h3 class="text-h6" :class="{ 'font-weight-bold text-success': isWinner(match.participant2_registration_id) }">
                {{ match.participant2_name || 'TBD' }}
              </h3>
              <v-chip v-if="match.participant2_seed" size="small" variant="tonal" class="mt-1">
                Seed #{{ match.participant2_seed }}
              </v-chip>
            </v-col>
          </v-row>

          <!-- Match Info -->
          <v-divider class="my-4" />
          <div class="d-flex justify-center gap-4 flex-wrap">
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
      <MatchStatusTimeline :match="match" class="mb-6" />

      <!-- Scheduling Panel (for self-scheduled matches) -->
      <MatchSchedulingPanel
        v-if="showSchedulingPanel"
        :tournament="tournament"
        :match="match"
        :active-proposal="activeProposal"
        :is-proposer="isProposer"
        :can-propose="canPropose"
        :loading="schedulingLoading"
        class="mb-6"
        @propose="handlePropose"
        @accept="handleAccept"
        @reject="handleReject"
        @counter="handleCounter"
      />

      <!-- Check-in Panel (when check-in is open) -->
      <v-card v-if="match.status === 'checking_in'" class="mb-6">
        <v-card-title>
          <v-icon start>mdi-checkbox-marked-circle-outline</v-icon>
          Match Check-in
        </v-card-title>
        <v-card-text>
          <p class="mb-4">Both participants need to check in before the match can begin.</p>
          <v-btn color="primary" size="large">
            <v-icon start>mdi-check</v-icon>
            Check In
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
          class="mb-6"
          @submitted="handleResultSubmitted"
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
                  <div class="text-caption text-grey">
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
    <v-card v-else-if="!loading" class="pa-8 text-center" variant="outlined">
      <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-alert-circle</v-icon>
      <h3 class="text-h6 mb-2">Match Not Found</h3>
      <p class="text-grey mb-4">The match you're looking for doesn't exist.</p>
      <v-btn color="primary" :to="{ name: 'tournaments' }">
        Browse Tournaments
      </v-btn>
    </v-card>

    <v-alert v-if="combinedError" type="error" class="mt-4" closable @click:close="clearError">
      {{ combinedError }}
    </v-alert>

    <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3000">
      {{ snackbarText }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getProposalStatusColor, getProposalStatusLabel } from '@/stores/matchScheduling'
import type { ResultClaimResponse } from '@/stores/matchResults'
import { useMatchDetail } from '@/composables/useMatchDetail'
import MatchStatusTimeline from '@/components/match/MatchStatusTimeline.vue'
import MatchSchedulingPanel from '@/components/match/MatchSchedulingPanel.vue'
import ResultSubmissionPanel from '@/components/match/results/ResultSubmissionPanel.vue'
import ResultConfirmationPanel from '@/components/match/results/ResultConfirmationPanel.vue'
import ResultHistoryTimeline from '@/components/match/results/ResultHistoryTimeline.vue'

const route = useRoute()

const {
  match, tournament, activeProposal, proposalHistory,
  currentResult, resultHistory, matchFormat,
  loading, schedulingLoading, error: combinedError, clearError,
  showSchedulingPanel, isProposer, canPropose,
  showResultPanel, showConfirmationPanel, canSubmitResult,
  showWaitingForOpponent, autoConfirmCountdown,
  fetchAll, fetchResultData,
  schedulingStore,
} = useMatchDetail()

// UI state (stays in the page)
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('success')

const breadcrumbs = computed(() => [
  { title: 'Tournaments', to: { name: 'tournaments' } },
  {
    title: tournament.value?.name || 'Tournament',
    to: { name: 'tournament-detail', params: { slug: route.params.tournamentSlug } },
  },
  { title: `Match #${match.value?.match_number || ''}`, disabled: true },
])

// Template helpers
function isWinner(registrationId: string | null | undefined): boolean {
  if (!registrationId || !match.value?.winner_registration_id) return false
  return match.value.winner_registration_id === registrationId
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'grey', scheduling: 'info', scheduled: 'primary',
    checking_in: 'warning', pick_ban: 'info', in_progress: 'primary',
    awaiting_result: 'warning', completed: 'success', cancelled: 'error',
  }
  return colors[status] || 'grey'
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending', scheduling: 'Scheduling', scheduled: 'Scheduled',
    checking_in: 'Check-in', pick_ban: 'Pick/Ban', in_progress: 'In Progress',
    awaiting_result: 'Awaiting Result', completed: 'Completed', cancelled: 'Cancelled',
  }
  return labels[status] || status
}

function formatMatchFormat(format: string): string {
  const formats: Record<string, string> = {
    bo1: 'Best of 1', bo3: 'Best of 3', bo5: 'Best of 5', bo7: 'Best of 7',
  }
  return formats[format] || format
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

function getSubmitterName(claim: ResultClaimResponse): string {
  if (claim.submitted_by_registration_id === match.value?.participant1_registration_id) {
    return match.value?.participant1_name || 'Opponent'
  }
  return match.value?.participant2_name || 'Opponent'
}

function showSnackbar(text: string, color: string) {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
}

// Thin event handlers
async function handlePropose(times: string[], notes?: string) {
  if (!tournament.value || !match.value) return
  try {
    await schedulingStore.proposeSchedule(tournament.value.id, match.value.id, times, notes)
    showSnackbar('Schedule proposal sent!', 'success')
    await fetchAll()
  } catch {
    showSnackbar(combinedError.value || 'Failed to send proposal', 'error')
  }
}

async function handleAccept(selectedTime: string) {
  if (!tournament.value || !match.value) return
  try {
    await schedulingStore.acceptProposal(tournament.value.id, match.value.id, {
      selected_time: selectedTime,
    })
    showSnackbar('Schedule accepted!', 'success')
    await fetchAll()
  } catch {
    showSnackbar(combinedError.value || 'Failed to accept proposal', 'error')
  }
}

async function handleReject(reason?: string) {
  if (!tournament.value || !match.value) return
  try {
    await schedulingStore.rejectProposal(tournament.value.id, match.value.id, {
      reason: reason ?? null,
    })
    showSnackbar('Proposal rejected', 'info')
    await fetchAll()
  } catch {
    showSnackbar(combinedError.value || 'Failed to reject proposal', 'error')
  }
}

async function handleCounter(times: string[], notes?: string) {
  if (!tournament.value || !match.value) return
  try {
    await schedulingStore.counterPropose(tournament.value.id, match.value.id, times, notes)
    showSnackbar('Counter-proposal sent!', 'success')
    await fetchAll()
  } catch {
    showSnackbar(combinedError.value || 'Failed to send counter-proposal', 'error')
  }
}

async function handleResultSubmitted() {
  showSnackbar('Result submitted! Waiting for opponent confirmation.', 'success')
  await fetchResultData()
}

async function handleResultConfirmed() {
  showSnackbar('Result confirmed! Match completed.', 'success')
  await fetchAll()
}

async function handleResultDisputed() {
  showSnackbar('Result disputed. An admin will review.', 'warning')
  await fetchResultData()
}

// Lifecycle
watch(
  () => [route.params.tournamentSlug, route.params.matchId],
  () => { fetchAll() }
)

onMounted(() => { fetchAll() })
</script>
