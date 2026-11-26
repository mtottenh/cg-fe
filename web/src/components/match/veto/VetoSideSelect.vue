<template>
  <!-- The side choice has no clock of its own and is lost for good when the
       veto finishes, so for the team that owes one this card is styled as
       the most urgent thing on the page, independent of the turn countdown. -->
  <v-card
    :variant="urgency === 'none' ? 'tonal' : 'flat'"
    :color="urgency === 'none' ? 'info' : 'warning'"
    :class="['mb-4', { 'side-select-urgent': urgency !== 'none' }]"
    :data-urgency="urgency"
    data-testid="side-select-card"
  >
    <v-card-title class="text-subtitle-1">
      <v-icon start size="small">
        {{ urgency === 'none' ? 'mdi-shield-half-full' : 'mdi-alert' }}
      </v-icon>
      Side Selection
      <v-chip v-if="urgency !== 'none'" color="error" variant="flat" size="small" class="ml-2">
        Needed now
      </v-chip>
    </v-card-title>
    <v-card-text>
      <p
        v-if="urgency === 'choose'"
        class="text-body-1 font-weight-bold mb-3"
        role="alert"
        data-testid="side-select-callout"
      >
        Choose your starting side for {{ owedMapNames }} now — it becomes a knife round if the
        veto finishes first.
      </p>
      <p
        v-else-if="urgency === 'captain'"
        class="text-body-1 font-weight-bold mb-3"
        role="alert"
        data-testid="side-select-callout"
      >
        Your captain must choose your team's starting side for {{ owedMapNames }} now — it
        becomes a knife round if the veto finishes first.
      </p>
      <p v-else class="text-caption mb-3" data-testid="side-select-deadline-note">
        Choose before the veto finishes — a picked map with no side chosen is
        decided by a knife round.
      </p>
      <div v-for="action in actionsNeedingSide" :key="action.id" class="mb-3">
        <div class="text-body-2 mb-2">
          Select side for <strong>{{ mapLabel(action) }}</strong>{{ gameLabel(action) }}:
        </div>
        <v-btn-group v-if="canSelectSide(action)" density="comfortable">
          <v-btn
            color="blue"
            variant="flat"
            :loading="vetoStore.sideSelectState.loading"
            @click="selectSide(action.action_number, 'ct')"
          >
            CT
          </v-btn>
          <v-btn
            color="orange"
            variant="flat"
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
import { computed } from 'vue'
import { useVetoStore, type VetoActionResponse, type MapStatusResponse } from '@/stores/veto'
import { useSnackbar } from '@/composables/useSnackbar'

const props = defineProps<{
  matchId: string
  actionsNeedingSide: VetoActionResponse[]
  userRegistrationId: string | null | undefined
  maps: MapStatusResponse[]
  /**
   * Whether the viewer may act for their team at all (captain / owner /
   * delegate). A plain roster member shares the registration id but the API
   * refuses their choice, so they get the waiting chip instead of buttons.
   */
  canAct?: boolean
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
  if (props.canAct === false) return false
  return action.performed_by_registration_id !== props.userRegistrationId
}

/** The viewer's team owes the side choice for this pick (opponent of the picker). */
function teamOwesSide(action: VetoActionResponse): boolean {
  return (
    !!props.userRegistrationId &&
    !!action.performed_by_registration_id &&
    action.performed_by_registration_id !== props.userRegistrationId
  )
}

/** The picks the viewer's team still owes a side for. */
const owedActions = computed(() => props.actionsNeedingSide.filter(teamOwesSide))

/**
 * `choose`: the viewer can and must pick a side. `captain`: their team must,
 * but only the captain / owner / delegate may. `none`: nothing is owed by
 * the viewer's side (the picker, or a spectator).
 */
const urgency = computed<'choose' | 'captain' | 'none'>(() => {
  if (owedActions.value.length === 0) return 'none'
  return props.canAct === false ? 'captain' : 'choose'
})

const owedMapNames = computed(() => {
  const names = owedActions.value.map(mapLabel)
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
})

/**
 * Shown to whoever is NOT choosing: the picker (whose opponent decides) and
 * spectators. The old copy ("Waiting for picker to select side...") named the
 * wrong party once `canSelectSide` was corrected.
 */
function waitingLabel(action: VetoActionResponse): string {
  const isPicker =
    !!props.userRegistrationId &&
    action.performed_by_registration_id === props.userRegistrationId
  if (isPicker) return 'Waiting for your opponent to select a side...'
  // On the choosing team, but not someone who may choose.
  if (props.userRegistrationId && props.canAct === false) {
    return 'Waiting for your captain to select a side...'
  }
  return 'Waiting for the opponent to select a side...'
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
    // A refused choice usually means the board moved on; show the real one.
    void vetoStore.getVetoSession(props.matchId).catch(() => null)
  }
}
</script>

<style scoped>
/* Urgency that does not depend on a countdown: there is none for this choice. */
.side-select-urgent {
  border: 2px solid rgb(var(--v-theme-error));
  animation: side-select-pulse 1.6s ease-in-out infinite;
}

@keyframes side-select-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-error), 0.45);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(var(--v-theme-error), 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .side-select-urgent {
    animation: none;
  }
}
</style>
