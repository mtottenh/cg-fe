<template>
  <v-card variant="tonal" color="info" class="mt-4">
    <v-card-title class="text-subtitle-1">
      <v-icon start size="small">mdi-shield-half-full</v-icon>
      Side Selection
    </v-card-title>
    <v-card-text>
      <div v-for="action in actionsNeedingSide" :key="action.id" class="mb-3">
        <div class="text-body-2 mb-2">
          Select side for <strong>{{ mapLabel(action) }}</strong>{{ gameLabel(action) }}:
        </div>
        <v-btn-group v-if="canSelectSide(action)" density="compact">
          <v-btn
            color="blue"
            variant="outlined"
            :loading="vetoStore.sideSelectState.loading"
            @click="selectSide(action.action_number, 'ct')"
          >
            CT
          </v-btn>
          <v-btn
            color="orange"
            variant="outlined"
            :loading="vetoStore.sideSelectState.loading"
            @click="selectSide(action.action_number, 't')"
          >
            T
          </v-btn>
        </v-btn-group>
        <v-chip v-else size="small" variant="tonal" color="grey">
          {{ waitingLabel(action) }}
        </v-chip>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { useVetoStore, type VetoActionResponse, type MapStatusResponse } from '@/stores/veto'
import { useSnackbar } from '@/composables/useSnackbar'

const props = defineProps<{
  matchId: string
  actionsNeedingSide: VetoActionResponse[]
  userRegistrationId: string | null | undefined
  maps: MapStatusResponse[]
}>()

const vetoStore = useVetoStore()
const snackbar = useSnackbar()

function findMap(action: VetoActionResponse): MapStatusResponse | undefined {
  return props.maps.find((m) => m.map_id === action.map_id)
}

/** Human map name — the raw map_id is an internal identifier. */
function mapLabel(action: VetoActionResponse): string {
  return findMap(action)?.map_name ?? action.map_id
}

/** Game number comes from the picked map, NOT the veto sequence index —
 * action_number counts bans too (a Bo1 decider after 6 bans is action 7,
 * but Game 1). */
function gameLabel(action: VetoActionResponse): string {
  const gameNumber = findMap(action)?.game_number
  return gameNumber ? ` (Game ${gameNumber})` : ''
}

/**
 * In `picker_choice` mode the OPPONENT of the team that picked the map chooses
 * the side (standard CS convention).
 *
 * `userRegistrationId` is non-null only for a participant of THIS match
 * (`useMatchContext`), so "not the picker" is exactly "the opponent" here —
 * spectators are filtered out by the null guard.
 *
 * This used to compare with `===` (offering the buttons to the picker), which
 * the API rejects with 403 — `VetoService::select_side` authorizes only the
 * opponent (api/crates/portal-domain/src/services/tournament/veto.rs:507-512,
 * and the handler resolves the opponent before authorizing,
 * api/crates/portal-api/src/handlers/veto.rs:452-465). The result was that side
 * selection was unreachable: the only client with a control got a 403 and the
 * only accepted client had no control. See COVERAGE-PLAN.md §9b P-7.
 */
function canSelectSide(action: VetoActionResponse): boolean {
  if (!props.userRegistrationId || !action.performed_by_registration_id) return false
  return action.performed_by_registration_id !== props.userRegistrationId
}

/**
 * Shown to whoever is NOT choosing: the picker (whose opponent decides) and
 * spectators. The old copy ("Waiting for picker to select side...") named the
 * wrong party once `canSelectSide` was corrected.
 */
function waitingLabel(action: VetoActionResponse): string {
  const isPicker =
    !!props.userRegistrationId &&
    action.performed_by_registration_id === props.userRegistrationId
  return isPicker
    ? 'Waiting for your opponent to select a side...'
    : 'Waiting for the opponent to select a side...'
}

async function selectSide(actionNumber: number, side: string) {
  try {
    await vetoStore.selectSide(props.matchId, {
      action_number: actionNumber,
      side,
    })
    snackbar.show(`Selected ${side.toUpperCase()} side`, 'success')
  } catch {
    snackbar.show(vetoStore.sideSelectState.error || 'Failed to select side', 'error')
  }
}
</script>
