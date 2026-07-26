<template>
  <v-card v-if="reservation" class="mb-4" data-testid="match-server-panel">
    <v-card-title class="d-flex align-center ga-2">
      <v-icon icon="mdi-server-network" />
      <span>Game Server</span>
      <v-chip
        :color="getStatusColor(reservationStatusMap, reservation.status)"
        :prepend-icon="getStatusIcon(reservationStatusMap, reservation.status)"
        size="small"
        variant="tonal"
      >
        {{ getStatusLabel(reservationStatusMap, reservation.status) }}
      </v-chip>
      <v-spacer />
      <template v-if="isAdmin">
        <v-btn
          v-if="reservation.status === 'failed' || reservation.status === 'cancelled'"
          size="small"
          color="primary"
          variant="tonal"
          prepend-icon="mdi-restart"
          :loading="store.assignState.loading"
          @click="store.assignServer(matchId)"
        >
          Retry
        </v-btn>
        <v-btn
          v-else-if="!isTerminal"
          aria-label="Cancel reservation"
          title="Cancel reservation"
          icon
          size="small"
          variant="text"
          color="error"
          @click="confirmCancel"
        >
          <v-icon>mdi-close-octagon</v-icon>
        </v-btn>
      </template>
    </v-card-title>

    <v-card-text>
      <!-- Setting up -->
      <div
        v-if="reservation.status === 'pending' || reservation.status === 'configuring'"
        class="d-flex align-center ga-3"
      >
        <v-progress-circular indeterminate size="20" width="2" />
        <span>
          {{
            reservation.status === 'pending'
              ? 'Waiting for a free server…'
              : 'Loading the match onto the server…'
          }}
        </span>
      </div>

      <!-- Failed / cancelled -->
      <v-alert
        v-else-if="reservation.status === 'failed'"
        type="error"
        variant="tonal"
        density="compact"
      >
        {{ reservation.failure_reason ?? 'Server setup failed' }} — admins have been notified.
      </v-alert>
      <v-alert
        v-else-if="reservation.status === 'cancelled'"
        type="info"
        variant="tonal"
        density="compact"
      >
        The server reservation was cancelled{{
          reservation.failure_reason ? `: ${reservation.failure_reason}` : ''
        }}.
      </v-alert>

      <!-- Ready / live -->
      <template v-else-if="reservation.status === 'ready' || reservation.status === 'live'">
        <template v-if="connectString">
          <p class="text-subtitle-2 mb-2">
            {{
              reservation.status === 'ready'
                ? 'Your server is ready — connect and ready up in-game:'
                : 'Connect to the live match:'
            }}
          </p>
          <div class="d-flex align-center ga-2 mb-3">
            <code class="connect-box flex-grow-1" data-testid="connect-string">{{
              connectString
            }}</code>
            <v-btn
              aria-label="Copy connect command"
              title="Copy connect command"
              icon
              size="small"
              variant="tonal"
              @click="copy(connectString)"
            >
              <v-icon>{{ copied ? 'mdi-check' : 'mdi-content-copy' }}</v-icon>
            </v-btn>
            <v-btn
              color="primary"
              size="small"
              prepend-icon="mdi-steam"
              :href="steamConnectUrl"
            >
              Join Server
            </v-btn>
          </div>
        </template>

        <!-- Live score -->
        <div
          v-if="reservation.status === 'live' && reservation.live_score"
          class="d-flex align-center ga-3 mb-3"
          data-testid="live-score"
        >
          <v-chip color="primary" variant="flat" size="small">
            Map {{ reservation.live_score.map_number + 1 }}
          </v-chip>
          <span class="text-h6">
            {{ reservation.live_score.team1_score }} :
            {{ reservation.live_score.team2_score }}
          </span>
          <span v-if="reservation.live_score.round_number != null" class="text-caption">
            round {{ reservation.live_score.round_number }}
          </span>
        </div>

        <!-- Substitutions (§6.8) -->
        <div class="d-flex align-center ga-2 mb-3">
          <v-btn
            v-if="reservation.is_participant"
            size="small"
            variant="tonal"
            prepend-icon="mdi-account-switch"
            @click="substitutionModalOpen = true"
          >
            Substitute Player
          </v-btn>
        </div>
        <div
          v-for="sub in store.substitutions"
          :key="sub.id"
          class="d-flex align-center ga-2 mb-1 text-caption"
          data-testid="substitution-row"
        >
          <v-chip
            :color="getStatusColor(substitutionStatusMap, sub.status)"
            size="x-small"
            variant="tonal"
          >
            {{ getStatusLabel(substitutionStatusMap, sub.status) }}
          </v-chip>
          <span>
            Substitution from game {{ sub.from_game_number }}
            {{ sub.failure_reason ? `— ${sub.failure_reason}` : '' }}
          </span>
          <v-btn
            v-if="sub.status === 'pending' || sub.status === 'awaiting_approval' || sub.status === 'applying'"
            aria-label="Cancel substitution"
            title="Cancel substitution"
            icon
            size="x-small"
            variant="text"
            @click="store.cancelSubstitution(matchId, sub.id)"
          >
            <v-icon size="small">mdi-close</v-icon>
          </v-btn>
        </div>

        <!-- GOTV -->
        <div v-if="gotvString" class="d-flex align-center ga-2 text-caption">
          <v-icon icon="mdi-television-play" size="small" />
          <span>Watch (GOTV, delayed):</span>
          <code>{{ gotvString }}</code>
          <v-btn
            aria-label="Copy GOTV command"
            title="Copy GOTV command"
            icon
            size="x-small"
            variant="text"
            @click="copy(gotvString)"
          >
            <v-icon size="small">mdi-content-copy</v-icon>
          </v-btn>
        </div>
      </template>

      <!-- Completed -->
      <div v-else-if="reservation.status === 'completed'" class="text-body-2">
        The series finished on the server — the result was reported automatically and is
        awaiting confirmation below.
      </div>
    </v-card-text>

    <SubstitutionModal
      v-model="substitutionModalOpen"
      :match-id="matchId"
      @requested="store.fetchSubstitutions(matchId)"
    />
    <ConfirmDialogHost :dialog="confirmDialog" />
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import SubstitutionModal from '@/components/match/SubstitutionModal.vue'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useMatchServerStore } from '@/stores/matchServer'
import {
  getStatusColor,
  getStatusIcon,
  getStatusLabel,
  reservationStatusMap,
  substitutionStatusMap,
} from '@/utils/statusMaps'

const props = defineProps<{
  matchId: string
  isAdmin?: boolean
}>()

const store = useMatchServerStore()
const { reservation } = storeToRefs(store)
const confirmDialog = useConfirmDialog()
const copied = ref(false)
const substitutionModalOpen = ref(false)

const isTerminal = computed(() =>
  ['completed', 'failed', 'cancelled'].includes(reservation.value?.status ?? ''),
)

const connectString = computed(() => {
  const r = reservation.value
  if (!r?.ip_address || !r.port || !r.connect_password) return null
  return `connect ${r.ip_address}:${r.port}; password ${r.connect_password}`
})

// Built exclusively from typed API fields — never from user-supplied
// strings — so the custom scheme is safe to bind as href.
const steamConnectUrl = computed(() => {
  const r = reservation.value
  if (!r?.ip_address || !r.port || !r.connect_password) return undefined
  return `steam://connect/${r.ip_address}:${r.port}/${r.connect_password}`
})

const gotvString = computed(() => {
  const r = reservation.value
  if (!r?.ip_address || !r.gotv_port) return null
  const password = r.gotv_password ? `; password ${r.gotv_password}` : ''
  return `connect ${r.ip_address}:${r.gotv_port}${password}`
})

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

function confirmCancel() {
  confirmDialog.confirm({
    title: 'Cancel server reservation?',
    message:
      'The match will be unloaded from the server and players disconnected. ' +
      'The match itself is not cancelled.',
    action: 'Cancel Reservation',
    color: 'error',
    handler: async () => {
      await store.cancelServer(props.matchId)
    },
  })
}
</script>

<style scoped>
.connect-box {
  display: block;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 0.85rem;
  overflow-x: auto;
  white-space: nowrap;
}
</style>
