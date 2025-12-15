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

        <v-row>
          <v-col v-for="(_, index) in proposedTimes" :key="index" cols="12" md="6">
            <v-text-field
              v-model="proposedTimes[index]"
              :label="`Time Option ${index + 1}`"
              type="datetime-local"
              variant="outlined"
              density="comfortable"
              :rules="index === 0 ? [rules.required] : []"
            >
              <template v-slot:append>
                <v-btn
                  v-if="index > 0"
                  icon
                  size="small"
                  variant="text"
                  @click="removeTimeSlot(index)"
                >
                  <v-icon>mdi-close</v-icon>
                </v-btn>
              </template>
            </v-text-field>
          </v-col>
        </v-row>

        <div class="d-flex gap-2 mb-4">
          <v-btn
            v-if="proposedTimes.length < 5"
            variant="tonal"
            size="small"
            @click="addTimeSlot"
          >
            <v-icon start>mdi-plus</v-icon>
            Add Time Option
          </v-btn>
        </div>

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

      <!-- Cannot propose -->
      <template v-else>
        <v-alert type="info" variant="tonal">
          <p class="mb-0">
            Waiting for match to be ready for scheduling. Both participants must be confirmed first.
          </p>
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

          <v-row>
            <v-col v-for="(_, index) in counterTimes" :key="index" cols="12" md="6">
              <v-text-field
                v-model="counterTimes[index]"
                :label="`Time Option ${index + 1}`"
                type="datetime-local"
                variant="outlined"
                density="comfortable"
              >
                <template v-slot:append>
                  <v-btn
                    v-if="index > 0"
                    icon
                    size="small"
                    variant="text"
                    @click="counterTimes.splice(index, 1)"
                  >
                    <v-icon>mdi-close</v-icon>
                  </v-btn>
                </template>
              </v-text-field>
            </v-col>
          </v-row>

          <v-btn
            v-if="counterTimes.length < 5"
            variant="tonal"
            size="small"
            @click="counterTimes.push('')"
          >
            <v-icon start>mdi-plus</v-icon>
            Add Time Option
          </v-btn>

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
import ProposalCard from './ProposalCard.vue'

const props = defineProps<{
  tournament: TournamentResponse
  match: TournamentMatchResponse
  activeProposal: ScheduleProposalResponse | null
  isProposer: boolean
  canPropose: boolean
  loading?: boolean
}>()

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

const rules = {
  required: (v: string) => !!v || 'Required',
}

const hasValidTime = computed(() => {
  return proposedTimes.value.some((t) => t !== '')
})

const hasValidCounterTime = computed(() => {
  return counterTimes.value.some((t) => t !== '')
})

function addTimeSlot() {
  if (proposedTimes.value.length < 5) {
    proposedTimes.value.push('')
  }
}

function removeTimeSlot(index: number) {
  proposedTimes.value.splice(index, 1)
}

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
