<template>
  <v-card class="mb-6">
    <v-card-title class="d-flex align-center justify-space-between">
      <div>
        <v-icon start>mdi-map-marker-multiple</v-icon>
        Map Veto
      </div>
      <div v-if="hasSession" class="d-flex align-center ga-2">
        <v-chip v-if="timeRemaining !== null && timeRemaining > 0" :color="timeRemaining <= 10 ? 'error' : 'warning'" size="small">
          <v-icon start size="small">mdi-timer-outline</v-icon>
          {{ timeRemaining }}s
        </v-chip>
        <v-chip :color="phaseColor" size="small" variant="tonal">
          {{ phaseLabel }}
        </v-chip>
        <v-icon v-if="connected" color="success" size="small" title="Live connection">mdi-circle</v-icon>
        <v-icon v-else-if="usingFallback" color="warning" size="small" title="Polling mode">mdi-circle-half-full</v-icon>
      </div>
    </v-card-title>

    <v-card-text>
      <!-- Loading state -->
      <div v-if="loading" class="text-center pa-4">
        <v-progress-circular indeterminate size="32" />
        <p class="text-caption text-medium-emphasis mt-2">Loading veto session...</p>
      </div>

      <!-- No session yet -->
      <template v-else-if="!hasSession">
        <v-alert type="info" variant="tonal" density="compact">
          Veto session is being initialized. This usually happens automatically when both players check in.
          If this persists, an admin may need to restart the match check-in process.
        </v-alert>
      </template>

      <template v-else>
      <!-- Cancelled session: nobody is on the clock and nothing is clickable. -->
      <v-alert v-if="phase === 'cancelled'" type="error" variant="tonal" density="compact" class="mb-4">
        <strong>Veto cancelled.</strong> This map veto session was cancelled — no further picks or bans can be made.
      </v-alert>

      <!-- Turn indicator -->
      <v-alert
        v-if="phase !== 'completed' && phase !== 'waiting' && phase !== 'cancelled'"
        :type="isMyTurn ? 'info' : 'warning'"
        variant="tonal"
        density="compact"
        class="mb-4"
      >
        <template v-if="isMyTurn">
          <strong>Your turn!</strong> {{ turnActionLabel }}
        </template>
        <template v-else>
          <!-- Named team: correct for spectators too, and tells participants
               exactly who is on the clock. -->
          Waiting for <strong>{{ currentTurnName ?? 'opponent' }}</strong> to
          {{ turnActionLabel.toLowerCase() }}...
        </template>
      </v-alert>

      <!-- Coin Flip Phase -->
      <VetoCoinFlip
        v-if="phase === 'coin_flip'"
        :participant1-name="participant1Name"
        :participant2-name="participant2Name"
        :coin-flip-result="coinFlipResult"
        :both-connected="bothParticipantsConnected"
      />

      <!-- Map Grid (always show map pool once session has maps) -->
      <VetoMapGrid
        v-if="maps.length > 0"
        :maps="maps"
        :phase="phase"
        :is-my-turn="isMyTurn"
        :match-id="matchId"
        :current-action="currentAction"
        :user-registration-id="userRegistrationId"
        :participant1-registration-id="participant1RegistrationId"
        :participant2-registration-id="participant2RegistrationId"
      />

      <!-- Side Selection (only in picker_choice mode during active phases) -->
      <VetoSideSelect
        v-if="sideSelectionMode === 'picker_choice' && mapsNeedingSideSelect.length > 0 && phase !== 'completed' && phase !== 'waiting' && phase !== 'coin_flip' && phase !== 'cancelled'"
        :match-id="matchId"
        :actions-needing-side="mapsNeedingSideSelect"
        :user-registration-id="userRegistrationId"
        :maps="maps"
      />

      <!-- Action Timeline -->
      <VetoTimeline
        v-if="actions.length > 0"
        :actions="actions"
        :maps="maps"
        :participant1-registration-id="participant1RegistrationId"
        :participant1-name="participant1Name"
        :participant2-registration-id="participant2RegistrationId"
        :participant2-name="participant2Name"
        class="mt-4"
      />

      <!-- Completed: Show selected maps -->
      <v-alert v-if="phase === 'completed'" type="success" variant="tonal" class="mt-4">
        <strong>Veto complete!</strong> Maps selected:
        <span v-for="(m, i) in pickedMaps" :key="m.map_id">
          {{ m.map_name }}<span v-if="i < pickedMaps.length - 1">, </span>
        </span>
      </v-alert>
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { injectMatchLobby, type VetoPhase } from '@/composables/useMatchLobby'
import VetoCoinFlip from './VetoCoinFlip.vue'
import VetoMapGrid from './VetoMapGrid.vue'
import VetoSideSelect from './VetoSideSelect.vue'
import VetoTimeline from './VetoTimeline.vue'

const props = defineProps<{
  matchId: string
  matchFormat?: string
  userRegistrationId: string | null | undefined
  participant1RegistrationId: string | null | undefined
  participant2RegistrationId: string | null | undefined
  participant1Name: string
  participant2Name: string
}>()

const loading = ref(true)

// Parent (MatchDetailPage) owns the lobby composable + websocket connection
// and provides it; we inject so there's one WS per match regardless of how
// many components consume the state.
const {
  session, hasSession, phase, isMyTurn,
  maps, pickedMaps,
  actions, currentAction, timeRemaining, mapsNeedingSideSelect,
  coinFlipResult, bothParticipantsConnected,
  connected, usingFallback,
  initialize,
} = injectMatchLobby()

const sideSelectionMode = computed(() => session.value?.side_selection_mode ?? 'knife')

/** Name of the team currently on the clock (null when unknown). */
const currentTurnName = computed(() => {
  const turnReg = session.value?.current_team_turn
  if (!turnReg) return null
  if (turnReg === props.participant1RegistrationId) return props.participant1Name
  if (turnReg === props.participant2RegistrationId) return props.participant2Name
  return null
})

const phaseColor = computed(() => {
  const colors: Record<VetoPhase, string> = {
    waiting: 'grey',
    coin_flip: 'purple',
    banning: 'error',
    picking: 'success',
    side_select: 'info',
    completed: 'success',
    cancelled: 'error',
  }
  return colors[phase.value]
})

const phaseLabel = computed(() => {
  const labels: Record<VetoPhase, string> = {
    waiting: 'Waiting',
    coin_flip: 'Coin Flip',
    banning: 'Banning',
    picking: 'Picking',
    side_select: 'Side Select',
    completed: 'Complete',
    cancelled: 'Cancelled',
  }
  return labels[phase.value]
})

const turnActionLabel = computed(() => {
  switch (phase.value) {
    case 'coin_flip': return 'Record the coin flip'
    case 'banning': return 'Ban a map'
    case 'picking': return 'Pick a map'
    case 'side_select': return 'Select a side'
    default: return ''
  }
})

async function initWithLoading() {
  loading.value = true
  await initialize()
  loading.value = false
}

onMounted(() => {
  initWithLoading()
})

watch(() => props.matchId, () => {
  initWithLoading()
})
</script>
