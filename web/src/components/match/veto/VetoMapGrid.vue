<template>
  <div>
    <div class="text-subtitle-2 mb-2">Map Pool</div>
    <v-row dense>
      <v-col v-for="map in maps" :key="map.map_id" cols="6" sm="4" md="3">
        <div :class="{ 'veto-pending': pendingMap?.map_id === map.map_id }">
          <GameMapCard
            :map-id="map.map_id"
            :display-name="map.map_name"
            :image-url="map.image_url"
            :status="map.status as 'available' | 'banned' | 'picked' | 'decider'"
            :game-number="map.game_number"
            :selectable="canSelect(map)"
            :disabled="!canSelect(map)"
            :status-label="statusLabel(map)"
            @select="handleSelect(map)"
          />
        </div>
      </v-col>
    </v-row>

    <!-- Two-step confirmation: bans/picks are irreversible and timed, so a
         single misclick must not commit an action. -->
    <v-slide-y-transition>
      <v-alert
        v-if="pendingMap"
        :type="phase === 'banning' ? 'error' : 'success'"
        variant="tonal"
        density="compact"
        class="mt-3 d-flex align-center"
      >
        <div class="d-flex align-center justify-space-between flex-wrap w-100">
          <span>
            {{ phase === 'banning' ? 'Ban' : 'Pick' }}
            <strong>{{ pendingMap.map_name }}</strong>?
          </span>
          <span>
            <v-btn
              size="small"
              variant="text"
              class="mr-1"
              :disabled="vetoStore.vetoActionState.loading"
              @click="pendingMap = null"
            >
              Cancel
            </v-btn>
            <v-btn
              size="small"
              :color="phase === 'banning' ? 'error' : 'success'"
              variant="flat"
              :loading="vetoStore.vetoActionState.loading"
              data-testid="veto-confirm-action"
              @click="confirmSelect"
            >
              Confirm {{ phase === 'banning' ? 'Ban' : 'Pick' }}
            </v-btn>
          </span>
        </div>
      </v-alert>
    </v-slide-y-transition>

    <!-- Loading overlay for action in progress -->
    <v-overlay v-if="vetoStore.vetoActionState.loading" contained class="align-center justify-center">
      <v-progress-circular indeterminate color="primary" />
    </v-overlay>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
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

/** Map armed by the first tap, awaiting explicit confirmation. */
const pendingMap = ref<MapStatusResponse | null>(null)

// Turn or phase moved on (timeout auto-action, opponent acted): drop the
// armed selection — it may no longer be valid.
watch([() => props.isMyTurn, () => props.phase], () => {
  pendingMap.value = null
})

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

function handleSelect(map: MapStatusResponse) {
  if (!canSelect(map)) return
  // First tap arms (or re-arms on a different map); confirm commits.
  pendingMap.value = pendingMap.value?.map_id === map.map_id ? null : map
}

async function confirmSelect() {
  const map = pendingMap.value
  if (!map || !canSelect(map)) {
    pendingMap.value = null
    return
  }
  try {
    await vetoStore.performVetoAction(props.matchId, { map_id: map.map_id })
    const action = props.phase === 'banning' ? 'banned' : 'picked'
    snackbar.show(`${map.map_name} ${action}!`, 'success')
  } catch {
    snackbar.show(vetoStore.vetoActionState.error || 'Failed to perform action', 'error')
  } finally {
    pendingMap.value = null
  }
}
</script>

<style scoped>
.veto-pending {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
  border-radius: 4px;
}
</style>
