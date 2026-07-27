<template>
  <v-container>
    <v-progress-linear v-if="!detail && pugsStore.fetchDetailState.loading" indeterminate />

    <v-alert
      v-else-if="!detail && pugsStore.fetchDetailState.error"
      type="error"
      variant="tonal"
      data-testid="pug-lobby-error"
    >
      {{ pugsStore.fetchDetailState.error }}
    </v-alert>

    <template v-else-if="detail">
      <!-- Header -->
      <div class="d-flex align-center flex-wrap ga-2 mb-4">
        <h1 class="text-h5">
          {{ detail.pug.map_selection_mode === 'wheel' ? '🎡' : '' }}
          {{ formatMatchFormat(detail.pug.match_format) }} PUG
        </h1>
        <v-chip :color="statusColor" variant="tonal" data-testid="pug-status-chip">
          {{ statusLabel }}
        </v-chip>
        <v-chip variant="tonal" size="small">
          {{ detail.pug.team_size }}v{{ detail.pug.team_size }}
        </v-chip>
        <v-chip v-if="detail.pug.region" variant="tonal" size="small">
          {{ detail.pug.region }}
        </v-chip>
        <v-tooltip v-if="!isTerminal" location="bottom">
          <template #activator="{ props: liveProps }">
            <v-icon
              v-bind="liveProps"
              size="x-small"
              :icon="pugSocket.connected.value ? 'mdi-circle' : 'mdi-circle-half-full'"
              :color="pugSocket.connected.value ? 'success' : 'warning'"
              :aria-label="pugSocket.connected.value ? 'Live updates connected' : 'Reconnecting — updates may lag'"
              data-testid="pug-live-indicator"
            />
          </template>
          {{ pugSocket.connected.value ? 'Live updates' : 'Reconnecting — updates may lag' }}
        </v-tooltip>
        <v-spacer />
        <v-btn
          v-if="isCreator && !isTerminal"
          color="error"
          variant="text"
          size="small"
          data-testid="pug-cancel-button"
          @click="confirmCancel"
        >
          Cancel PUG
        </v-btn>
        <v-btn
          v-if="isCreator && isTerminal"
          color="primary"
          variant="tonal"
          size="small"
          prepend-icon="mdi-restart"
          :loading="pugsStore.rematchState.loading"
          data-testid="pug-rematch-button"
          @click="rematch"
        >
          Rematch
        </v-btn>
      </div>

      <!-- ================= GATHERING ================= -->
      <template v-if="detail.pug.status === 'gathering'">
        <v-row dense class="mb-2">
          <v-col cols="12" md="6">
            <PugShareCard
              v-if="detail.pug.join_code"
              :join-code="detail.pug.join_code"
              :is-creator="isCreator"
              :rotating="pugsStore.rotateCodeState.loading"
              @rotate="rotateCode"
            />
          </v-col>
          <v-col cols="12" md="6" class="d-flex align-center">
            <div class="d-flex flex-wrap ga-2">
              <v-btn
                v-if="isCreator"
                variant="tonal"
                prepend-icon="mdi-shuffle"
                :loading="pugsStore.shuffleState.loading"
                data-testid="pug-shuffle-button"
                @click="pugsStore.shuffleTeams(pugIdRef)"
              >
                Shuffle
              </v-btn>
              <v-btn
                v-if="isCreator"
                variant="tonal"
                prepend-icon="mdi-swap-horizontal"
                :loading="pugsStore.swapState.loading"
                data-testid="pug-swap-button"
                @click="pugsStore.swapTeams(pugIdRef)"
              >
                Swap teams
              </v-btn>
              <v-btn
                v-if="!isCreator && isParticipant"
                variant="text"
                color="error"
                prepend-icon="mdi-exit-run"
                :loading="pugsStore.leaveState.loading"
                data-testid="pug-leave-button"
                @click="leave"
              >
                Leave
              </v-btn>
            </div>
          </v-col>
        </v-row>

        <PugTeamBoard
          :players="detail.players"
          :team-size="detail.pug.team_size"
          :my-player-id="myPlayerId"
          :is-creator="isCreator"
          :editable="true"
          :picking-team="detail.picking_team ?? null"
          @join-team="(team) => pugsStore.setTeam(pugIdRef, team)"
          @kick="(playerId) => pugsStore.kickPlayer(pugIdRef, playerId)"
          @toggle-captain="(playerId, isCaptain) => pugsStore.setCaptain(pugIdRef, playerId, isCaptain)"
          @move="(playerId, team) => pugsStore.setTeam(pugIdRef, team, playerId)"
          @draft="(playerId) => pugsStore.draftPick(pugIdRef, playerId)"
        />

        <!-- Wheel nominations -->
        <v-card v-if="detail.pug.map_selection_mode === 'wheel'" class="mt-4">
          <v-card-title class="text-subtitle-1">
            Nominate your map
            <span class="text-caption text-medium-emphasis ml-2">
              duplicates make bigger wheel slices
            </span>
          </v-card-title>
          <v-card-text>
            <v-row>
              <v-col cols="12" md="7">
                <v-row dense>
                  <v-col v-for="map in gameMaps" :key="map.id" cols="6" sm="4" md="6" lg="4">
                    <GameMapCard
                      :map-id="map.id"
                      :display-name="map.display_name"
                      :image-url="map.image_url"
                      :selectable="isParticipant"
                      :status-label="nominationLabel(map.id)"
                      :status="myNomination === map.id ? 'picked' : 'available'"
                      @select="nominate(map.id)"
                    />
                  </v-col>
                </v-row>
              </v-col>

              <!-- Live preview of the wheel these nominations build. Same
                   component, palette and geometry the real spin uses, so what
                   you see here is exactly what will spin — it just has no
                   `spin` prop, which leaves it static. -->
              <v-col cols="12" md="5">
                <div class="d-flex flex-column align-center" data-testid="wheel-preview">
                  <div class="text-caption text-medium-emphasis mb-2">
                    Wheel preview · {{ gatheringSegments.length }}
                    {{ gatheringSegments.length === 1 ? 'slice' : 'slices' }}
                  </div>
                  <WheelSpinner :segments="gatheringSegments" :size="260" />
                  <div class="text-caption text-medium-emphasis mt-2 text-center">
                    Un-nominated maps still get one slice each, so the wheel is
                    never empty.
                  </div>
                </div>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Lock -->
        <v-card class="mt-4">
          <v-card-text class="d-flex align-center flex-wrap ga-4">
            <v-alert
              v-if="missingSteam.length > 0"
              type="warning"
              variant="tonal"
              density="compact"
              class="flex-grow-1 mb-0"
            >
              No linked Steam account: {{ missingSteam.join(', ') }} — they can't
              enter the game server.
            </v-alert>
            <v-spacer />
            <v-checkbox
              v-if="canLock"
              v-model="forceLock"
              label="Start short-handed"
              density="compact"
              hide-details
              data-testid="pug-force-lock"
            />
            <v-btn
              v-if="canLock"
              color="success"
              size="large"
              prepend-icon="mdi-lock"
              :loading="pugsStore.lockState.loading"
              data-testid="pug-lock-button"
              @click="lock"
            >
              Lock teams &amp; start
            </v-btn>
          </v-card-text>
          <v-alert
            v-if="pugsStore.lockState.error"
            type="error"
            variant="tonal"
            density="compact"
            class="ma-4 mt-0"
          >
            {{ pugsStore.lockState.error }}
          </v-alert>
        </v-card>
      </template>

      <!-- ================= POST-LOCK ================= -->
      <template v-else>
        <LobbyPresenceBar
          v-if="lobby && !isTerminal"
          :participants="lobby.participants.value"
          :spectator-count="lobby.spectatorCount.value"
          :connected="lobby.connected.value"
          class="mb-4"
        />

        <v-row dense>
          <v-col cols="12" :md="isTerminal ? 12 : 8">
            <!-- Map selection: wheel -->
            <WheelPanel
              v-if="detail.pug.map_selection_mode === 'wheel' && detail.pug.status === 'map_selection'"
              :segments="idleSegments"
              :results="wheelResults"
              :maps-required="mapsRequired"
              :can-spin="canSpin"
              :spin-pending="pugsStore.spinState.loading"
              :playback="playback"
              @spin="spin"
              @settled="onSpinSettled"
            />

            <!-- Map selection: standard veto -->
            <VetoPanel
              v-else-if="detail.pug.map_selection_mode === 'veto' && detail.pug.status === 'map_selection' && matchId"
              :match-id="matchId"
              :match-format="detail.pug.match_format"
              :user-registration-id="detail.my_registration_id"
              :participant1-registration-id="participant1RegistrationId"
              :participant2-registration-id="participant2RegistrationId"
              :participant1-name="teamName(1)"
              :participant2-name="teamName(2)"
            />

            <!-- Server / live -->
            <MatchServerPanel v-if="matchId && !isTerminal" :match-id="matchId" class="mt-4" />

            <!-- Completed -->
            <v-card v-if="detail.pug.status === 'completed'" class="mt-4">
              <v-card-title>Final score</v-card-title>
              <v-card-text class="text-center">
                <div class="text-h3 my-4" data-testid="pug-final-score">
                  <span :class="{ 'text-success': detail.pug.winner_team === 1 }">
                    {{ detail.pug.team1_score ?? '–' }}
                  </span>
                  <span class="text-medium-emphasis mx-2">:</span>
                  <span :class="{ 'text-success': detail.pug.winner_team === 2 }">
                    {{ detail.pug.team2_score ?? '–' }}
                  </span>
                </div>
                <div class="text-body-1">
                  <strong>{{ teamName(detail.pug.winner_team ?? 1) }}</strong> wins
                </div>
                <div v-if="wheelResults.length > 0" class="text-body-2 text-medium-emphasis mt-2">
                  Maps: {{ wheelResults.map((r) => formatMapName(r.winner_map_id)).join(', ') }}
                </div>
              </v-card-text>
            </v-card>

            <v-alert
              v-if="detail.pug.status === 'cancelled' || detail.pug.status === 'expired'"
              type="info"
              variant="tonal"
              class="mt-4"
            >
              This PUG was {{ statusLabel.toLowerCase() }}.
            </v-alert>
          </v-col>

          <v-col v-if="!isTerminal" cols="12" md="4">
            <!-- Rosters (read-only post-lock) -->
            <v-card class="mb-4">
              <v-card-title class="text-subtitle-1">Teams</v-card-title>
              <v-card-text>
                <div v-for="team in [1, 2] as const" :key="team" class="mb-3">
                  <div class="text-body-2 font-weight-bold mb-1">{{ teamName(team) }}</div>
                  <div
                    v-for="player in detail.players.filter((p) => p.team === team)"
                    :key="player.player_id"
                    class="d-flex align-center ga-2 py-1"
                  >
                    <v-avatar size="22">
                      <v-img v-if="player.avatar_url" :src="player.avatar_url" />
                      <v-icon v-else icon="mdi-account" size="x-small" />
                    </v-avatar>
                    <span class="text-body-2">{{ player.display_name }}</span>
                    <v-icon v-if="player.is_captain" icon="mdi-star" size="x-small" color="amber" />
                  </div>
                </div>
              </v-card-text>
            </v-card>

            <LobbyChatPanel
              v-if="lobby"
              :messages="lobby.chatMessages.value"
              :connected="lobby.connected.value"
              @send="(chatType, content) => lobby?.sendChat(chatType, content)"
            />
          </v-col>
        </v-row>
      </template>
    </template>

    <ConfirmDialogHost :dialog="confirmDialog" />
  </v-container>
</template>

<script setup lang="ts">
/**
 * The PUG lobby, phase by phase:
 *  - gathering: share link, team board, wheel nominations, lock
 *  - map_selection: veto panel (veto mode) or the wheel (wheel mode), on
 *    the same match-lobby websocket tournament matches use
 *  - awaiting_server / live: connect info + live score via MatchServerPanel
 *  - completed: final score + rematch
 *
 * Gathering state polls (no websocket exists pre-materialization); once the
 * match exists the websocket takes over and polling backs off to the
 * pug-detail refresh on status changes.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import GameMapCard from '@/components/GameMapCard.vue'
import LobbyChatPanel from '@/components/match/LobbyChatPanel.vue'
import LobbyPresenceBar from '@/components/match/LobbyPresenceBar.vue'
import MatchServerPanel from '@/components/match/MatchServerPanel.vue'
import VetoPanel from '@/components/match/veto/VetoPanel.vue'
import PugShareCard from '@/components/pug/PugShareCard.vue'
import PugTeamBoard from '@/components/pug/PugTeamBoard.vue'
import WheelPanel from '@/components/pug/WheelPanel.vue'
import WheelSpinner from '@/components/pug/WheelSpinner.vue'
import type { WheelResult, WheelSpinPlayback } from '@/components/pug/WheelPanel.vue'
import { provideMatchLobby, useMatchLobby } from '@/composables/useMatchLobby'
import { usePugLobbySocket } from '@/composables/usePugLobbySocket'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useAuthStore } from '@/stores/auth'
import { useGamesStore } from '@/stores/games'
import { useMatchServerStore } from '@/stores/matchServer'
import { usePugsStore } from '@/stores/pugs'
import { useVetoStore } from '@/stores/veto'
import { formatMapName } from '@/utils/maps'
import { formatMatchFormat } from '@/utils/matchStatus'
import { getStatusColor, getStatusLabel, pugStatusMap } from '@/utils/statusMaps'
import { buildSegments } from '@/utils/wheel'



const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const gamesStore = useGamesStore()
const pugsStore = usePugsStore()
const vetoStore = useVetoStore()
const matchServerStore = useMatchServerStore()
const confirmDialog = useConfirmDialog()

const { detail } = storeToRefs(pugsStore)

const pugIdRef = computed(() => String(route.params.id ?? ''))
const shareCode = computed(() =>
  typeof route.query.code === 'string' ? route.query.code : undefined
)

const myPlayerId = computed(() => authStore.playerId)
const isCreator = computed(() => detail.value?.pug.my_role === 'creator')
const isParticipant = computed(() =>
  detail.value?.players.some((p) => p.player_id === myPlayerId.value) ?? false
)
const isTerminal = computed(() =>
  ['completed', 'cancelled', 'expired'].includes(detail.value?.pug.status ?? '')
)
const matchId = computed(() => detail.value?.pug.match_id ?? null)
const mapsRequired = computed(() => {
  const format = detail.value?.pug.match_format
  return format === 'bo5' ? 5 : format === 'bo3' ? 3 : 1
})

// ── Match lobby socket (post-materialization) ──
const myRegistrationId = computed(() => detail.value?.my_registration_id ?? null)
const lobby = useMatchLobby(matchId, myRegistrationId)
provideMatchLobby(lobby)

const participant1RegistrationId = ref<string | null>(null)
const participant2RegistrationId = ref<string | null>(null)

// Participant registration ids come from the lobby auth payload; fall back
// to the veto session's coin-flip fields when connected as a spectator.
watch(
  () => lobby.participants.value,
  (participants) => {
    if (participants.length >= 1) participant1RegistrationId.value = participants[0]?.registration_id ?? null
    if (participants.length >= 2) participant2RegistrationId.value = participants[1]?.registration_id ?? null
  }
)

const isCaptain = computed(() =>
  detail.value?.players.some((p) => p.player_id === myPlayerId.value && p.is_captain) ?? false
)
const canSpin = computed(() => isCreator.value || isCaptain.value)
const canLock = computed(() => isCreator.value || isCaptain.value)

// ── Wheel state ──
const playback = ref<WheelSpinPlayback | null>(null)

const idleSegments = computed(() => {
  if (!detail.value) return []
  const remaining = vetoStore.session?.remaining_maps ?? []
  const entries = detail.value.wheel_entries.map((e) => ({
    map_id: e.map_id,
    player_name: e.player_name,
  }))
  return buildSegments(entries, remaining)
})

// Pre-lock preview. `idleSegments` (below/above) reads the veto session's
// remaining maps, which does not exist until the pug materialises, so the
// allowed pool here is the pug's configured pool falling back to the game's
// catalog. buildSegments mirrors the server's own weighting exactly.
const gatheringSegments = computed(() => {
  if (!detail.value) return []
  const allowed =
    detail.value.pug.map_pool && detail.value.pug.map_pool.length > 0
      ? detail.value.pug.map_pool
      : gameMaps.value.map((m) => m.id)
  const entries = detail.value.wheel_entries.map((e) => ({
    map_id: e.map_id,
    player_name: e.player_name,
  }))
  return buildSegments(entries, allowed)
})

const wheelResults = computed<WheelResult[]>(() =>
  (detail.value?.spins ?? []).map((s) => ({
    game_number: s.game_number,
    winner_map_id: s.winner_map_id,
  }))
)

lobby.onMessage({
  wheel_spin: (msg) => {
    playback.value = {
      game_number: msg.game_number,
      segments: msg.segments,
      winner_map_id: msg.winner_map_id,
      spin_seed: msg.spin_seed,
      duration_ms: msg.duration_ms,
    }
  },
})

async function spin(): Promise<void> {
  try {
    const result = await pugsStore.spinWheel(pugIdRef.value)
    // Fallback for degraded (polling) connections: play the REST response
    // if the broadcast can't reach us.
    if (!lobby.connected.value) {
      playback.value = {
        game_number: result.game_number,
        segments: result.segments as WheelSpinPlayback['segments'],
        winner_map_id: result.winner_map_id,
        spin_seed: result.spin_seed,
        duration_ms: result.duration_ms,
      }
    }
  } catch {
    // spinState.error shown via panel button loading reset; refetch to resync
    await refresh()
  }
}

async function onSpinSettled(): Promise<void> {
  playback.value = null
  await refresh()
}

// ── Gathering state ──
const forceLock = ref(false)

// Map catalog for the nomination grid (fetchMaps returns without storing).
const gameMaps = ref<Awaited<ReturnType<typeof gamesStore.fetchMaps>>>([])

const myNomination = computed(
  () =>
    detail.value?.wheel_entries.find(
      (e) => e.player_id === myPlayerId.value
    )?.map_id ?? null
)

function nominationLabel(mapId: string): string | undefined {
  const count = detail.value?.wheel_entries.filter((e) => e.map_id === mapId).length ?? 0
  return count > 0 ? `×${count}` : undefined
}

const missingSteam = computed(
  () =>
    detail.value?.players
      .filter((p) => p.team != null && !p.has_steam_id)
      .map((p) => p.display_name) ?? []
)

async function nominate(mapId: string): Promise<void> {
  if (!isParticipant.value) return
  await pugsStore.nominateMap(pugIdRef.value, mapId)
}

async function lock(): Promise<void> {
  try {
    await pugsStore.lockPug(pugIdRef.value, forceLock.value)
    await afterMaterialized()
  } catch {
    // lockState.error renders inline
  }
}

async function leave(): Promise<void> {
  await pugsStore.leavePug(pugIdRef.value)
  await router.push({ name: 'pugs' })
}

async function rotateCode(): Promise<void> {
  await pugsStore.rotateCode(pugIdRef.value)
}

function confirmCancel(): void {
  confirmDialog.confirm({
    title: 'Cancel PUG',
    message:
      'Cancel this PUG? Players will be sent home and any reserved server released.',
    action: 'Cancel PUG',
    color: 'error',
    handler: async () => {
      await pugsStore.cancelPug(pugIdRef.value)
      await refresh()
    },
  })
}

async function rematch(): Promise<void> {
  try {
    const next = await pugsStore.rematch(pugIdRef.value)
    await router.push({ name: 'pug-lobby', params: { id: next.pug.id } })
  } catch {
    // rematchState.error via store
  }
}

// ── Status presentation ──
const statusLabel = computed(() => {
  const status = detail.value?.pug.status ?? ''
  if (status === 'map_selection' && detail.value?.pug.map_selection_mode === 'wheel') {
    return 'Spinning for maps'
  }
  return getStatusLabel(pugStatusMap, status)
})

const statusColor = computed(() => getStatusColor(pugStatusMap, detail.value?.pug.status ?? ''))

function teamName(team: number): string {
  const captain = detail.value?.players.find((p) => p.team === team && p.is_captain)
  const first = detail.value?.players.find((p) => p.team === team)
  const anchor = captain ?? first
  return anchor ? `team_${anchor.display_name}` : `Team ${team}`
}

// ── Fetch: socket-driven, no polling ──
//
// The pug websocket rings a doorbell on every server-side change (joins,
// team moves, nominations, lock, status transitions) and we refetch the
// viewer-specific detail. The composable falls back to slow polling by
// itself if the socket can't stay up.
let disposed = false

async function refresh(): Promise<void> {
  if (disposed) return
  try {
    await pugsStore.fetchPug(pugIdRef.value, shareCode.value)
  } catch {
    // fetchDetailState.error renders inline
  }
}

const pugSocket = usePugLobbySocket(() => pugIdRef.value || null, {
  code: shareCode.value,
  onChanged: () => {
    void refresh()
  },
  onRematch: (newPugId) => {
    // The creator copied this roster into a fresh lobby — follow it.
    void router.push({ name: 'pug-lobby', params: { id: newPugId } })
  },
})

async function afterMaterialized(): Promise<void> {
  if (!matchId.value) return
  await lobby.initialize()
  await matchServerStore.fetchMatchServer(matchId.value)
}

watch(matchId, async (id, old) => {
  if (id && !old) await afterMaterialized()
})

async function init(): Promise<void> {
  vetoStore.clear()
  playback.value = null
  await refresh()
  if (detail.value?.pug.game_id) {
    gameMaps.value = await gamesStore.fetchMaps(detail.value.pug.game_id).catch(() => [])
  }
  if (matchId.value) await afterMaterialized()
  if (!isTerminal.value) pugSocket.connect()
}

onMounted(init)

// vue-router reuses this component when only the :id param changes
// (e.g. rematch navigates straight to the new lobby) — re-init.
watch(pugIdRef, async (next, prev) => {
  if (next && next !== prev) {
    pugSocket.disconnect()
    lobby.disconnect()
    await init()
  }
})

onUnmounted(() => {
  disposed = true
  pugSocket.disconnect()
  lobby.disconnect()
  pugsStore.clear()
})
</script>
