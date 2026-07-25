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
          aria-label="Forfeiting Participant"
            v-model="forfeitRegistrationId"
            :items="participantOptions"
            label="Forfeiting Participant"
            variant="outlined"
            density="compact"
            class="mb-2"
          />
          <v-select
          aria-label="Forfeit Type"
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
              <p class="text-body-2 text-medium-emphasis mb-2">
                Advance the winner into the next bracket slot for the first time
                (use when automatic progression didn't run).
              </p>
              <v-select
          aria-label="Winner"
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
              <p class="text-body-2 text-medium-emphasis mb-2">
                Replace an already-advanced winner with a different one (use
                after a result correction).
              </p>
              <v-select
          aria-label="New Winner"
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
              <p class="text-body-2 text-medium-emphasis mb-2">
                Undo bracket advancement for this match entirely — downstream
                pairings created from it are rolled back.
              </p>
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
  <ConfirmDialogHost :dialog="confirmDialog" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTournamentsStore, type TournamentMatchResponse } from '@/stores/tournaments'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'

const props = defineProps<{
  match: TournamentMatchResponse | null
  tournamentId: string
}>()

const emit = defineEmits<{
  updated: []
}>()

const tournamentsStore = useTournamentsStore()
const feedback = useActionFeedback()
const confirmDialog = useConfirmDialog()

function participantName(registrationId: string | null | undefined): string {
  if (!props.match) return 'Unknown'
  if (registrationId === props.match.participant1_registration_id) {
    return props.match.participant1_name || 'Participant 1'
  }
  if (registrationId === props.match.participant2_registration_id) {
    return props.match.participant2_name || 'Participant 2'
  }
  return 'Unknown'
}

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

function handleForfeit() {
  if (!props.match || !forfeitRegistrationId.value) return
  const matchId = props.match.id
  const regId = forfeitRegistrationId.value
  const type = forfeitType.value
  const reason = forfeitReason.value.trim()
  confirmDialog.confirm({
    title: 'Forfeit Match',
    message: `Forfeit ${participantName(regId)} (${type.replace('_', ' ')})? The match is decided immediately.`,
    action: 'Forfeit',
    color: 'error',
    handler: async () => {
      await feedback.run(
        () => tournamentsStore.adminForfeitMatch(props.tournamentId, matchId, regId, type, reason),
        { success: 'Match forfeited', errorSource: tournamentsStore.adminForfeitState, after: afterSuccess, rethrow: true },
      )
    },
  })
}

function handleDoubleForfeit() {
  if (!props.match) return
  const matchId = props.match.id
  const reason = doubleForfeitReason.value.trim()
  confirmDialog.confirm({
    title: 'Double Forfeit',
    message: 'Forfeit BOTH participants? Neither advances, and the match is closed immediately.',
    action: 'Double Forfeit',
    color: 'error',
    handler: async () => {
      await feedback.run(
        () => tournamentsStore.adminDoubleForfeit(props.tournamentId, matchId, reason),
        { success: 'Double forfeit processed', errorSource: tournamentsStore.adminDoubleForfeitState, after: afterSuccess, rethrow: true },
      )
    },
  })
}

function handleProcessProgression() {
  if (!props.match || !progressionWinnerId.value) return
  const match = props.match
  const winnerId = progressionWinnerId.value
  const loserId = match.participant1_registration_id === winnerId
    ? match.participant2_registration_id
    : match.participant1_registration_id
  if (!loserId) return
  confirmDialog.confirm({
    title: 'Process Progression',
    message: `Advance ${participantName(winnerId)} as winner over ${participantName(loserId)}?`,
    action: 'Process',
    color: 'primary',
    handler: async () => {
      await feedback.run(
        () => tournamentsStore.processProgression(match.id, winnerId, loserId),
        { success: 'Progression processed', errorSource: tournamentsStore.processProgressionState, after: afterSuccess, rethrow: true },
      )
    },
  })
}

function handleReapplyProgression() {
  if (!props.match || !reapplyWinnerId.value) return
  const matchId = props.match.id
  const winnerId = reapplyWinnerId.value
  confirmDialog.confirm({
    title: 'Reapply Progression',
    message: `Replace the advanced winner with ${participantName(winnerId)}? Downstream bracket slots are rewritten.`,
    action: 'Reapply',
    color: 'warning',
    handler: async () => {
      await feedback.run(
        () => tournamentsStore.reapplyProgression(matchId, winnerId),
        { success: 'Progression reapplied', errorSource: tournamentsStore.reapplyProgressionState, after: afterSuccess, rethrow: true },
      )
    },
  })
}

function handleRevertProgression() {
  if (!props.match) return
  const matchId = props.match.id
  confirmDialog.confirm({
    title: 'Revert Progression',
    message: 'Undo bracket advancement for this match? Downstream pairings created from it are rolled back.',
    action: 'Revert',
    color: 'error',
    handler: async () => {
      await feedback.run(
        () => tournamentsStore.revertProgression(matchId),
        { success: 'Progression reverted', errorSource: tournamentsStore.revertProgressionState, after: afterSuccess, rethrow: true },
      )
    },
  })
}
</script>
