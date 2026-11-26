<template>
  <v-card variant="outlined" class="mb-4" data-testid="server-rescue-card">
    <v-card-title class="text-subtitle-1 d-flex align-center ga-2">
      <v-icon>mdi-server-network</v-icon>
      Game server
      <v-chip
        v-if="reservation"
        :color="reservationColor"
        size="small"
        variant="tonal"
        data-testid="server-rescue-status"
      >
        {{ reservationLabel }}
      </v-chip>
      <v-chip v-else size="small" variant="tonal" data-testid="server-rescue-status">
        No reservation
      </v-chip>
    </v-card-title>

    <v-card-text>
      <p v-if="reservation" class="text-body-2 mb-2" data-testid="server-rescue-summary">
        <template v-if="reservation.server_name">
          On <strong>{{ reservation.server_name }}</strong>.
        </template>
        <template v-if="reservation.queue_position">
          Waiting for a free server: number {{ reservation.queue_position }} in the queue.
        </template>
        <template v-if="reservation.retry_count">
          Loading the match was retried {{ reservation.retry_count }} time(s).
        </template>
        Last change {{ formatDateTime(reservation.updated_at) }}.
      </p>
      <p v-else class="text-body-2 text-medium-emphasis mb-2">
        This match is not holding or waiting for a game server.
      </p>
      <v-alert
        v-if="reservation?.failure_reason"
        type="error"
        variant="tonal"
        density="compact"
        class="mb-3"
        data-testid="server-rescue-failure"
      >
        {{ reservation.failure_reason }}
      </v-alert>

      <v-alert
        v-if="serverAccessDenied"
        type="info"
        variant="tonal"
        density="compact"
        class="mb-3"
        data-testid="server-rescue-denied"
      >
        Your account cannot manage game servers, so these tools are switched
        off. They need the <code>admin.servers.manage</code> permission; the
        rest of the rescue tools only need tournament admin.
      </v-alert>

      <!-- Clear -->
      <div class="mb-4">
        <v-btn
          color="warning"
          variant="tonal"
          prepend-icon="mdi-server-remove"
          :disabled="serverAccessDenied"
          :loading="rescueStore.clearServerState.loading"
          data-testid="server-clear"
          @click="confirmClear"
        >
          Clear match from server
        </v-btn>
        <p class="text-caption text-medium-emphasis mt-1">
          Unloads the match config from the game server so anyone can connect.
          Use this when players are being kicked because the roster in the
          loaded config is wrong.
        </p>
        <v-alert
          v-if="clearResult"
          :type="clearResult.server_cleared ? 'success' : 'warning'"
          variant="tonal"
          density="compact"
          class="mt-2"
          data-testid="server-clear-result"
        >
          {{ clearSummary }}
        </v-alert>
        <v-alert
          v-if="rescueStore.clearServerState.error"
          type="error"
          variant="tonal"
          density="compact"
          class="mt-2"
          data-testid="server-clear-error"
        >
          {{ rescueStore.clearServerState.error }}
        </v-alert>
      </div>

      <!-- Reload / assign -->
      <div class="d-flex flex-wrap ga-2 mb-1">
        <v-btn
          color="primary"
          variant="tonal"
          prepend-icon="mdi-server-network"
          :disabled="serverAccessDenied"
          :loading="rescueStore.reloadServerState.loading"
          data-testid="server-reload"
          @click="confirmReload"
        >
          Reload match on server with current rosters
        </v-btn>
        <span>
          <v-btn
            color="primary"
            variant="tonal"
            prepend-icon="mdi-server-plus"
            :disabled="hasLiveReservation || serverAccessDenied"
            :loading="matchServerStore.assignState.loading"
            data-testid="server-assign"
            @click="assign"
          >
            Assign server
          </v-btn>
          <v-tooltip v-if="hasLiveReservation" activator="parent" location="top">
            This match already has a server reservation. Reload it, or clear it first.
          </v-tooltip>
        </span>
      </div>
      <p class="text-caption text-medium-emphasis mb-4">
        Reload rebuilds the match config from the teams' rosters as they are
        now, then loads it again. Fix the roster first, then reload.
      </p>
      <v-alert
        v-if="rescueStore.reloadServerState.error"
        type="error"
        variant="tonal"
        density="compact"
        class="mb-4"
        data-testid="server-reload-error"
      >
        {{ rescueStore.reloadServerState.error }}
        <div class="text-caption mt-1">
          Nothing on the server was changed. The roster check below shows who
          is stopping the config from being built.
        </div>
      </v-alert>

      <!-- Roster check -->
      <div class="d-flex align-center ga-2 mb-2">
        <v-btn
          variant="tonal"
          prepend-icon="mdi-account-search"
          :disabled="serverAccessDenied"
          :loading="rescueStore.rosterCheckState.loading"
          data-testid="roster-check-run"
          @click="runRosterCheck"
        >
          Check rosters
        </v-btn>
        <v-chip
          v-if="rosterCheck"
          :color="rosterCheck.ok ? 'success' : 'error'"
          size="small"
          variant="tonal"
          data-testid="roster-check-verdict"
        >
          {{ rosterCheck.ok ? 'Rosters can be loaded' : 'Rosters have problems' }}
        </v-chip>
      </div>
      <v-alert
        v-if="rescueStore.rosterCheckState.error"
        type="error"
        variant="tonal"
        density="compact"
        class="mb-2"
        data-testid="roster-check-error"
      >
        {{ rescueStore.rosterCheckState.error }}
      </v-alert>
      <template v-if="rosterCheck">
        <p class="text-caption text-medium-emphasis mb-2">
          {{ rosterCheck.players_per_team }} players per team;
          {{ rosterCheck.min_players_to_ready }} must ready up before the match starts.
        </p>
        <v-alert
          v-for="problem in rosterCheck.problems"
          :key="problem"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-2"
        >
          {{ problem }}
        </v-alert>
        <v-row>
          <v-col
            v-for="team in rosterCheck.teams"
            :key="team.registration_id"
            cols="12"
            md="6"
            :data-testid="`roster-team-${team.registration_id}`"
          >
            <div class="text-subtitle-2 mb-1">
              {{ team.name }}
              <span class="text-caption text-medium-emphasis">
                ({{ team.usable_players }} usable)
              </span>
            </div>
            <v-alert
              v-for="problem in team.problems"
              :key="problem"
              type="error"
              variant="tonal"
              density="compact"
              class="mb-2"
            >
              {{ problem }}
            </v-alert>
            <v-table density="compact">
              <tbody>
                <tr v-for="player in team.players" :key="player.player_id">
                  <td>
                    {{ player.display_name }}
                    <span v-if="player.source === 'substitution'" class="text-caption text-medium-emphasis">
                      (substitute)
                    </span>
                  </td>
                  <td><code>{{ player.steam_id || '—' }}</code></td>
                  <td class="text-right">
                    <v-chip :color="player.valid ? 'success' : 'error'" size="x-small" variant="tonal">
                      {{ player.valid ? 'Valid' : (player.problem || 'Invalid') }}
                    </v-chip>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </v-col>
        </v-row>
      </template>
    </v-card-text>

    <ConfirmDialogHost :dialog="confirmDialog" />
    <ReasonDialogHost :dialog="reasonDialog" />
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ApiError } from '@/api/client'
import { storeToRefs } from 'pinia'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import ReasonDialogHost from './ReasonDialogHost.vue'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useReasonDialog } from '@/composables/useReasonDialog'
import { useMatchRescueStore, type MatchDiagnostics } from '@/stores/matchRescue'
import { useMatchServerStore } from '@/stores/matchServer'
import { formatDateTime } from '@/utils/formatters'
import { isLiveReservation, type SuggestedAction } from '@/utils/matchRescue'
import { getStatusColor, getStatusLabel, reservationStatusMap } from '@/utils/statusMaps'

const props = defineProps<{
  matchId: string
  /** The reservation as the diagnostics endpoint reports it; null when there is none. */
  reservation: MatchDiagnostics['reservation']
}>()

const emit = defineEmits<{
  /** Something on the server side changed: refresh diagnostics and the match. */
  changed: []
}>()

const rescueStore = useMatchRescueStore()
const matchServerStore = useMatchServerStore()
const { rosterCheck, clearResult, serverAccessDenied } = storeToRefs(rescueStore)
const feedback = useActionFeedback()
const confirmDialog = useConfirmDialog()
const reasonDialog = useReasonDialog()

const reservationLabel = computed(() =>
  props.reservation ? getStatusLabel(reservationStatusMap, props.reservation.status) : '',
)
const reservationColor = computed(() =>
  props.reservation ? getStatusColor(reservationStatusMap, props.reservation.status) : 'grey',
)
const hasLiveReservation = computed(() => isLiveReservation(props.reservation?.status))

/** What clearing actually did, without claiming more than the server confirmed. */
const clearSummary = computed(() => {
  const result = clearResult.value
  if (!result) return ''
  const where = result.server_name ? ` from ${result.server_name}` : ''
  const reservation = result.released_reservation
    ? 'The server reservation was released.'
    : 'There was no live reservation to release.'
  if (result.server_cleared) {
    return `${reservation} The match was unloaded${where}: anyone can connect now.`
  }
  // The backend says why in `detail`; show it as it came.
  const why = result.detail ? ` ${sentence(result.detail)}` : ''
  return (
    `${reservation} The match was not confirmed as unloaded${where}.${why} ` +
    'If players are still being kicked, end the match from the server console.'
  )
})

/** Capitalised, with a full stop: backend details arrive as lower-case fragments. */
function sentence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const capitalised = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`
}

function changed() {
  emit('changed')
}

function confirmClear() {
  confirmDialog.confirm({
    title: 'Clear match from server',
    message:
      'Unload the match config from the game server and release its reservation? ' +
      'Anyone will be able to connect, and a match in progress on the server is ended.',
    action: 'Clear match',
    color: 'warning',
    handler: async () => {
      // No success toast: the alert under the button says what the server
      // actually confirmed, which is not always that the match was unloaded.
      await feedback.run(
        () => rescueStore.clearServer(props.matchId),
        { errorSource: rescueStore.clearServerState, after: changed, rethrow: true },
      )
    },
  })
}

function confirmReload() {
  reasonDialog.confirm({
    title: 'Reload match on server',
    message:
      'Rebuild the match config from the current rosters and load it onto a server again.',
    effects: [
      'The match loaded on the server now is ended',
      'The server reservation is replaced by a new one',
      'Players must reconnect and ready up again',
    ],
    action: 'Reload match',
    color: 'primary',
    defaultReason: 'Reloading the match with corrected rosters',
    handler: async (reason) => {
      try {
        await feedback.run(
          () => rescueStore.reloadServer(props.matchId, reason),
          {
            success: 'Match reloaded on the server',
            errorSource: rescueStore.reloadServerState,
            after: changed,
            rethrow: true,
          },
        )
      } catch (e) {
        // A refused reload is nearly always a roster problem: show which.
        if (!serverAccessDenied.value) void runRosterCheck()
        throw e
      }
    },
  })
}

async function assign() {
  await feedback.run(
    async () => {
      try {
        await matchServerStore.assignServer(props.matchId)
      } catch (e) {
        // Assign lives in another store; it needs the same permission.
        if (e instanceof ApiError && e.status === 403) serverAccessDenied.value = true
        throw e
      }
    },
    {
      success: 'Server requested for this match',
      errorSource: matchServerStore.assignState,
      after: changed,
    },
  )
}

async function runRosterCheck() {
  // Failure is shown inline next to the button, not as a snackbar.
  await rescueStore.fetchRosterCheck(props.matchId).catch(() => null)
}

/** Run the tool a diagnosed problem points at. */
function runSuggested(action: SuggestedAction) {
  if (action === 'clear_server') confirmClear()
  else if (action === 'reload_server') confirmReload()
  else if (action === 'assign_server') void assign()
  else if (action === 'roster_check') void runRosterCheck()
}

defineExpose({ runSuggested })
</script>
