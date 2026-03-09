<template>
  <v-card variant="outlined">
    <v-card-title class="d-flex align-center">
      <v-icon start>mdi-calendar-clock</v-icon>
      Schedule Match
    </v-card-title>
    <v-divider />
    <v-card-text>
      <!-- No active proposal - can propose -->
      <template v-if="!activeProposal && canPropose">
        <p class="mb-4">Propose times for this match. Your opponent will be able to accept, reject, or counter-propose.</p>

        <!-- View mode toggle -->
        <v-btn-toggle
          v-if="opponentPlayerId"
          v-model="viewMode"
          mandatory
          density="compact"
          variant="outlined"
          class="mb-4"
        >
          <v-btn value="calendar" size="small">
            <v-icon start size="small">mdi-calendar-month</v-icon>
            Calendar
          </v-btn>
          <v-btn value="manual" size="small">
            <v-icon start size="small">mdi-form-textbox</v-icon>
            Manual
          </v-btn>
        </v-btn-toggle>

        <!-- Calendar overlay mode -->
        <AvailabilityCalendarOverlay
          v-if="viewMode === 'calendar' && opponentPlayerId && tournamentId && matchId"
          v-model="proposedTimes"
          :opponent-player-id="opponentPlayerId"
          :tournament-id="tournamentId"
          :match-id="matchId"
          class="mb-4"
        />

        <!-- Manual time picker mode -->
        <ScheduleTimePicker
          v-else
          v-model="proposedTimes"
          :suggested-times="suggestedTimes"
        />

        <v-textarea
          v-model="notes"
          label="Notes (optional)"
          rows="2"
          variant="outlined"
          density="comfortable"
          hint="Add any additional context for your opponent"
        />

        <div class="d-flex justify-end mt-4">
          <v-btn
            color="primary"
            :loading="loading"
            :disabled="!hasValidTime"
            @click="submitProposal"
          >
            <v-icon start>mdi-send</v-icon>
            Send Proposal
          </v-btn>
        </div>
      </template>

      <!-- Active proposal exists -->
      <template v-else-if="activeProposal">
        <ProposalCard
          :proposal="activeProposal"
          :is-proposer="isProposer"
          :loading="loading"
          @accept="(time) => $emit('accept', time)"
          @reject="(reason) => $emit('reject', reason)"
          @counter="openCounterDialog"
        />
      </template>

      <!-- Match is scheduled - show confirmation -->
      <template v-else-if="match.status === 'scheduled'">
        <v-alert type="success" variant="tonal" class="mb-4">
          <div class="d-flex align-center">
            <v-icon start>mdi-calendar-check</v-icon>
            <div>
              <strong>Match Scheduled</strong>
              <div v-if="match.scheduled_at" class="text-body-2">
                {{ formatScheduledTime(match.scheduled_at) }}
              </div>
            </div>
          </div>
        </v-alert>
        <p class="text-body-2 text-medium-emphasis">
          The match time has been agreed upon. Waiting for the match to begin.
        </p>
      </template>

      <!-- Cannot propose -->
      <template v-else>
        <v-alert type="info" variant="tonal">
          <p class="mb-0">Scheduling is not available at this time.</p>
        </v-alert>
      </template>
    </v-card-text>

    <!-- Counter-proposal Dialog -->
    <v-dialog v-model="counterDialogOpen" max-width="600" persistent>
      <v-card>
        <v-card-title>Counter-Propose</v-card-title>
        <v-divider />
        <v-card-text>
          <p class="mb-4">Suggest alternative times that work better for you.</p>

          <ScheduleTimePicker
            v-model="counterTimes"
            :suggested-times="suggestedTimes"
          />

          <v-textarea
            v-model="counterNotes"
            label="Notes (optional)"
            rows="2"
            variant="outlined"
            density="comfortable"
            class="mt-4"
          />
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="counterDialogOpen = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :loading="loading"
            :disabled="!hasValidCounterTime"
            @click="submitCounter"
          >
            Send Counter-Proposal
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { TournamentResponse, TournamentMatchResponse } from '@/stores/tournaments'
import type { ScheduleProposalResponse } from '@/stores/matchScheduling'
import { formatDateTimeLongWithWeekday } from '@/utils/formatters'
import ProposalCard from './ProposalCard.vue'
import ScheduleTimePicker from './ScheduleTimePicker.vue'
import AvailabilityCalendarOverlay from './AvailabilityCalendarOverlay.vue'

const props = withDefaults(
  defineProps<{
    tournament: TournamentResponse
    match: TournamentMatchResponse
    activeProposal: ScheduleProposalResponse | null
    isProposer: boolean
    canPropose: boolean
    loading?: boolean
    suggestedTimes?: string[]
    opponentPlayerId?: string | null
    tournamentId?: string
    matchId?: string
  }>(),
  {
    suggestedTimes: () => [],
    opponentPlayerId: null,
    tournamentId: '',
    matchId: '',
  }
)

// View mode: calendar (default when opponent is known) or manual
const viewMode = ref<'calendar' | 'manual'>(props.opponentPlayerId ? 'calendar' : 'manual')

function formatScheduledTime(iso: string): string {
  return formatDateTimeLongWithWeekday(iso)
}

const emit = defineEmits<{
  propose: [times: string[], notes?: string]
  accept: [time: string]
  reject: [reason?: string]
  counter: [times: string[], notes?: string]
}>()

// Proposal form state
const proposedTimes = ref<string[]>(['', ''])
const notes = ref('')

// Counter-proposal dialog state
const counterDialogOpen = ref(false)
const counterTimes = ref<string[]>(['', ''])
const counterNotes = ref('')

const hasValidTime = computed(() => {
  return proposedTimes.value.some((t) => t !== '')
})

const hasValidCounterTime = computed(() => {
  return counterTimes.value.some((t) => t !== '')
})

function submitProposal() {
  const validTimes = proposedTimes.value
    .filter((t) => t !== '')
    .map((t) => new Date(t).toISOString())

  if (validTimes.length > 0) {
    emit('propose', validTimes, notes.value || undefined)
  }
}

function openCounterDialog() {
  counterTimes.value = ['', '']
  counterNotes.value = ''
  counterDialogOpen.value = true
}

function submitCounter() {
  const validTimes = counterTimes.value
    .filter((t) => t !== '')
    .map((t) => new Date(t).toISOString())

  if (validTimes.length > 0) {
    emit('counter', validTimes, counterNotes.value || undefined)
    counterDialogOpen.value = false
  }
}
</script>
