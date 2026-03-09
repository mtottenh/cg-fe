<template>
  <div>
    <div class="text-subtitle-2 mb-2">Map Pool</div>
    <v-row dense>
      <v-col v-for="map in maps" :key="map.map_id" cols="6" sm="4" md="3">
        <GameMapCard
          :map-id="map.map_id"
          :display-name="map.map_name"
          :image-url="map.image_url"
          :status="map.status as any"
          :game-number="map.game_number"
          :selectable="canSelect(map)"
          :disabled="!canSelect(map)"
          :status-label="statusLabel(map)"
          @select="handleSelect(map)"
        />
      </v-col>
    </v-row>

    <!-- Loading overlay for action in progress -->
    <v-overlay v-if="vetoStore.vetoActionState.loading.value" contained class="align-center justify-center">
      <v-progress-circular indeterminate color="primary" />
    </v-overlay>
  </div>
</template>

<script setup lang="ts">
import type { MapStatusResponse } from '@/stores/veto'
import { useVetoStore } from '@/stores/veto'
import type { VetoPhase } from '@/composables/useMatchLobby'
import { useSnackbar } from '@/composables/useSnackbar'
import GameMapCard from '@/components/GameMapCard.vue'

const props = defineProps<{
  maps: MapStatusResponse[]
  phase: VetoPhase
  isMyTurn: boolean
  matchId: string
  currentAction: { action_type: string; team: number } | null
  userRegistrationId: string | null | undefined
  participant1RegistrationId: string | null | undefined
  participant2RegistrationId: string | null | undefined
}>()

const vetoStore = useVetoStore()
const snackbar = useSnackbar()

function canSelect(map: MapStatusResponse): boolean {
  if (map.status !== 'available') return false
  if (!props.isMyTurn) return false
  if (props.phase !== 'banning' && props.phase !== 'picking') return false
  return true
}

function statusLabel(map: MapStatusResponse): string | undefined {
  if (map.status === 'available') return undefined
  if (map.status === 'banned') return 'Banned'
  if (map.status === 'decider') return `Map ${map.game_number ?? ''} (Decider)`
  if (map.status === 'picked') return `Map ${map.game_number ?? ''}`
  return map.status
}

async function handleSelect(map: MapStatusResponse) {
  if (!canSelect(map)) return
  try {
    await vetoStore.performVetoAction(props.matchId, { map_id: map.map_id })
    const action = props.phase === 'banning' ? 'banned' : 'picked'
    snackbar.show(`${map.map_name} ${action}!`, 'success')
  } catch {
    snackbar.show(vetoStore.vetoActionState.error.value || 'Failed to perform action', 'error')
  }
}
</script>
