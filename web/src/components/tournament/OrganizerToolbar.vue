<template>
  <v-card v-if="isOrganizer" variant="outlined" class="mb-6">
    <v-card-title class="d-flex align-center justify-space-between">
      <span><v-icon start>mdi-cog</v-icon> Tournament Management</span>
      <v-chip color="warning" size="small" variant="tonal">Organizer</v-chip>
    </v-card-title>
    <v-divider />
    <v-card-text>
      <div class="d-flex flex-wrap ga-2">
        <!-- Status-based action buttons -->
        <v-btn v-if="canPublish" color="primary" prepend-icon="mdi-eye"
          :loading="tournamentsStore.publishState.loading" @click="handlePublish">
          Publish
        </v-btn>
        <v-btn v-if="canOpenRegistration" color="success" prepend-icon="mdi-account-plus"
          :loading="tournamentsStore.openRegistrationState.loading" @click="handleOpenRegistration">
          Open Registration
        </v-btn>
        <v-btn v-if="canCloseRegistration" color="warning" prepend-icon="mdi-account-cancel"
          :loading="tournamentsStore.closeRegistrationState.loading" @click="handleCloseRegistration">
          Close Registration
        </v-btn>
        <v-btn v-if="canReopenRegistration" color="warning" prepend-icon="mdi-account-plus"
          :loading="tournamentsStore.reopenRegistrationState.loading" @click="handleReopenRegistration">
          Reopen Registration
        </v-btn>
        <v-btn v-if="canStart" color="primary" prepend-icon="mdi-play"
          :loading="tournamentsStore.startTournamentState.loading" @click="handleStart">
          Start Tournament
        </v-btn>
        <v-btn v-if="canComplete" color="success" prepend-icon="mdi-flag-checkered"
          :loading="tournamentsStore.completeTournamentState.loading" @click="handleComplete">
          Complete
        </v-btn>
        <v-btn v-if="canFinalize" color="success" prepend-icon="mdi-check-all"
          :loading="tournamentsStore.finalizeTournamentState.loading" @click="handleFinalize">
          Finalize
        </v-btn>
        <!-- Swiss advance -->
        <v-btn v-if="canAdvanceRound" color="primary" prepend-icon="mdi-skip-next"
          :loading="tournamentsStore.generateNextRoundState.loading" @click="handleAdvanceRound">
          Generate Next Round
        </v-btn>
        <!-- Always available -->
        <v-btn variant="tonal" prepend-icon="mdi-pencil" @click="$emit('edit')">
          Edit
        </v-btn>
        <v-btn v-if="canCancel" color="error" variant="tonal" prepend-icon="mdi-cancel"
          @click="confirmCancel">
          Cancel
        </v-btn>
      </div>

      <!-- Pending registrations summary -->
      <div v-if="pendingRegistrationCount > 0" class="mt-3">
        <v-chip color="warning" size="small">{{ pendingRegistrationCount }} pending approvals</v-chip>
        <v-btn variant="text" size="small" @click="$emit('manage-registrations')">Manage</v-btn>
      </div>
    </v-card-text>

    <!-- Cancel Confirmation Dialog -->
    <ConfirmDialogHost :dialog="confirmDialog" />
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTournamentsStore, type TournamentResponse } from '@/stores/tournaments'
import { useTournamentContext } from '@/composables/useTournamentContext'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import type { Ref } from 'vue'

const props = defineProps<{
  tournament: TournamentResponse
}>()

const emit = defineEmits<{
  edit: []
  'manage-registrations': []
  'action-complete': []
}>()

const tournamentsStore = useTournamentsStore()

const tournamentRef = computed(() => props.tournament) as Ref<TournamentResponse | null>

const {
  isOrganizer, canPublish, canOpenRegistration, canCloseRegistration,
  canReopenRegistration, canStart, canCancel, canComplete, canFinalize,
  canAdvanceRound, pendingRegistrationCount,
} = useTournamentContext(tournamentRef)

const confirmDialog = useConfirmDialog()

async function handlePublish() {
  await tournamentsStore.publishTournament(props.tournament.id)
  emit('action-complete')
}

async function handleOpenRegistration() {
  await tournamentsStore.openRegistration(props.tournament.id)
  emit('action-complete')
}

async function handleCloseRegistration() {
  await tournamentsStore.closeRegistration(props.tournament.id)
  emit('action-complete')
}

async function handleReopenRegistration() {
  await tournamentsStore.reopenRegistration(props.tournament.id)
  emit('action-complete')
}

async function handleStart() {
  await tournamentsStore.startTournament(props.tournament.id)
  emit('action-complete')
}

async function handleComplete() {
  await tournamentsStore.completeTournament(props.tournament.id)
  emit('action-complete')
}

async function handleFinalize() {
  await tournamentsStore.finalizeTournament(props.tournament.id)
  emit('action-complete')
}

function confirmCancel() {
  confirmDialog.confirm({
    title: 'Cancel Tournament',
    message: 'Are you sure you want to cancel this tournament? This action cannot be undone.',
    action: 'Cancel Tournament',
    color: 'error',
    handler: async () => {
      await tournamentsStore.cancelTournament(props.tournament.id)
      emit('action-complete')
    },
  })
}

async function handleAdvanceRound() {
  await tournamentsStore.generateNextRound(props.tournament.id)
  emit('action-complete')
}
</script>
