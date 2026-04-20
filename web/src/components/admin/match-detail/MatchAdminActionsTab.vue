<template>
  <v-row v-if="match">
    <!-- Schedule -->
    <v-col cols="12">
      <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-subtitle-1">
          <v-icon class="mr-2">mdi-calendar</v-icon>
          Schedule Match
        </v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="6">
              <v-text-field
                v-model="scheduleDate"
                type="datetime-local"
                label="Date & Time"
                variant="outlined"
                density="compact"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                v-model="scheduleNotes"
                label="Notes (optional)"
                variant="outlined"
                density="compact"
              />
            </v-col>
          </v-row>
          <v-btn
            color="primary"
            :loading="tournamentsStore.adminScheduleState.loading"
            :disabled="!scheduleDate"
            @click="handleSchedule"
          >
            Schedule
          </v-btn>
        </v-card-text>
      </v-card>
    </v-col>

    <!-- Forfeit -->
    <v-col cols="12" md="6">
      <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-subtitle-1">
          <v-icon class="mr-2" color="warning">mdi-flag</v-icon>
          Forfeit Match
        </v-card-title>
        <v-card-text>
          <v-select
            v-model="forfeitRegistrationId"
            :items="participantOptions"
            label="Forfeiting Participant"
            variant="outlined"
            density="compact"
            class="mb-2"
          />
          <v-select
            v-model="forfeitType"
            :items="forfeitTypeOptions"
            label="Forfeit Type"
            variant="outlined"
            density="compact"
            class="mb-2"
          />
          <v-textarea
            v-model="forfeitReason"
            label="Reason *"
            variant="outlined"
            density="compact"
            rows="2"
          />
          <v-btn
            color="warning"
            :loading="tournamentsStore.adminForfeitState.loading"
            :disabled="!forfeitRegistrationId || !forfeitType || !forfeitReason.trim()"
            @click="handleForfeit"
          >
            Forfeit
          </v-btn>
        </v-card-text>
      </v-card>
    </v-col>

    <!-- Double Forfeit -->
    <v-col cols="12" md="6">
      <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-subtitle-1">
          <v-icon class="mr-2" color="error">mdi-account-cancel</v-icon>
          Double Forfeit
        </v-card-title>
        <v-card-text>
          <v-textarea
            v-model="doubleForfeitReason"
            label="Reason *"
            variant="outlined"
            density="compact"
            rows="2"
          />
          <v-btn
            color="error"
            :loading="tournamentsStore.adminDoubleForfeitState.loading"
            :disabled="!doubleForfeitReason.trim()"
            @click="handleDoubleForfeit"
          >
            Double Forfeit
          </v-btn>
        </v-card-text>
      </v-card>
    </v-col>

    <!-- Progression (for completed matches) -->
    <v-col v-if="match.status === 'completed'" cols="12">
      <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-subtitle-1">
          <v-icon class="mr-2" color="primary">mdi-arrow-right-bold</v-icon>
          Bracket Progression
        </v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12" md="4">
              <div class="text-subtitle-2 mb-2">Process Progression</div>
              <v-select
                v-model="progressionWinnerId"
                :items="participantOptions"
                label="Winner"
                variant="outlined"
                density="compact"
                class="mb-2"
              />
              <v-btn
                color="primary"
                :loading="tournamentsStore.processProgressionState.loading"
                :disabled="!progressionWinnerId"
                @click="handleProcessProgression"
              >
                Process
              </v-btn>
            </v-col>
            <v-col cols="12" md="4">
              <div class="text-subtitle-2 mb-2">Reapply Progression</div>
              <v-select
                v-model="reapplyWinnerId"
                :items="participantOptions"
                label="New Winner"
                variant="outlined"
                density="compact"
                class="mb-2"
              />
              <v-btn
                color="warning"
                :loading="tournamentsStore.reapplyProgressionState.loading"
                :disabled="!reapplyWinnerId"
                @click="handleReapplyProgression"
              >
                Reapply
              </v-btn>
            </v-col>
            <v-col cols="12" md="4">
              <div class="text-subtitle-2 mb-2">Revert Progression</div>
              <p class="text-body-2 text-grey mb-2">Undo bracket advancement for this match.</p>
              <v-btn
                color="error"
                :loading="tournamentsStore.revertProgressionState.loading"
                @click="handleRevertProgression"
              >
                Revert
              </v-btn>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTournamentsStore, type TournamentMatchResponse } from '@/stores/tournaments'
import { useActionFeedback } from '@/composables/useActionFeedback'

const props = defineProps<{
  match: TournamentMatchResponse | null
  tournamentId: string
}>()

const emit = defineEmits<{
  updated: []
}>()

const tournamentsStore = useTournamentsStore()
const feedback = useActionFeedback()

const scheduleDate = ref('')
const scheduleNotes = ref('')
const forfeitRegistrationId = ref('')
const forfeitType = ref('no_show')
const forfeitReason = ref('')
const doubleForfeitReason = ref('')
const progressionWinnerId = ref('')
const reapplyWinnerId = ref('')

const forfeitTypeOptions = [
  { title: 'No Show', value: 'no_show' },
  { title: 'Forfeit', value: 'forfeit' },
  { title: 'Disqualification', value: 'disqualification' },
]

const participantOptions = computed(() => {
  if (!props.match) return []
  const opts: Array<{ title: string; value: string }> = []
  if (props.match.participant1_registration_id) {
    opts.push({
      title: props.match.participant1_name || 'P1',
      value: props.match.participant1_registration_id,
    })
  }
  if (props.match.participant2_registration_id) {
    opts.push({
      title: props.match.participant2_name || 'P2',
      value: props.match.participant2_registration_id,
    })
  }
  return opts
})

// Reset forms + pre-fill progression winner when the host modal switches matches.
watch(() => props.match?.id, () => {
  scheduleDate.value = ''
  scheduleNotes.value = ''
  forfeitRegistrationId.value = ''
  forfeitType.value = 'no_show'
  forfeitReason.value = ''
  doubleForfeitReason.value = ''
  reapplyWinnerId.value = ''
  progressionWinnerId.value = props.match?.winner_registration_id ?? ''
}, { immediate: true })

function afterSuccess() {
  emit('updated')
}

async function handleSchedule() {
  if (!props.match || !scheduleDate.value) return
  const matchId = props.match.id
  const iso = new Date(scheduleDate.value).toISOString()
  const notes = scheduleNotes.value || undefined
  await feedback.run(
    () => tournamentsStore.adminScheduleMatch(props.tournamentId, matchId, iso, notes),
    { success: 'Match scheduled', errorSource: tournamentsStore.adminScheduleState, after: afterSuccess },
  )
}

async function handleForfeit() {
  if (!props.match || !forfeitRegistrationId.value) return
  const matchId = props.match.id
  const regId = forfeitRegistrationId.value
  const type = forfeitType.value
  const reason = forfeitReason.value.trim()
  await feedback.run(
    () => tournamentsStore.adminForfeitMatch(props.tournamentId, matchId, regId, type, reason),
    { success: 'Match forfeited', errorSource: tournamentsStore.adminForfeitState, after: afterSuccess },
  )
}

async function handleDoubleForfeit() {
  if (!props.match) return
  const matchId = props.match.id
  const reason = doubleForfeitReason.value.trim()
  await feedback.run(
    () => tournamentsStore.adminDoubleForfeit(props.tournamentId, matchId, reason),
    { success: 'Double forfeit processed', errorSource: tournamentsStore.adminDoubleForfeitState, after: afterSuccess },
  )
}

async function handleProcessProgression() {
  if (!props.match || !progressionWinnerId.value) return
  const match = props.match
  const winnerId = progressionWinnerId.value
  const loserId = match.participant1_registration_id === winnerId
    ? match.participant2_registration_id
    : match.participant1_registration_id
  if (!loserId) return
  await feedback.run(
    () => tournamentsStore.processProgression(match.id, winnerId, loserId),
    { success: 'Progression processed', errorSource: tournamentsStore.processProgressionState, after: afterSuccess },
  )
}

async function handleReapplyProgression() {
  if (!props.match || !reapplyWinnerId.value) return
  const matchId = props.match.id
  const winnerId = reapplyWinnerId.value
  await feedback.run(
    () => tournamentsStore.reapplyProgression(matchId, winnerId),
    { success: 'Progression reapplied', errorSource: tournamentsStore.reapplyProgressionState, after: afterSuccess },
  )
}

async function handleRevertProgression() {
  if (!props.match) return
  const matchId = props.match.id
  await feedback.run(
    () => tournamentsStore.revertProgression(matchId),
    { success: 'Progression reverted', errorSource: tournamentsStore.revertProgressionState, after: afterSuccess },
  )
}
</script>
