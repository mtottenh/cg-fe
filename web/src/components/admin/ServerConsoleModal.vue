<template>
  <v-dialog v-model="open" max-width="880" scrollable>
    <v-card v-if="server" data-testid="server-console">
      <v-card-title class="d-flex align-center ga-2 flex-wrap">
        <v-icon>mdi-console</v-icon>
        <span class="text-truncate">
          Console — {{ server.name }}
          <span v-if="currentMap" class="text-medium-emphasis">· {{ currentMap }}</span>
        </span>
        <v-spacer />
        <v-btn
          aria-label="Refresh from the server"
          title="Refresh from the server"
          size="small"
          variant="tonal"
          prepend-icon="mdi-refresh"
          :loading="refreshing"
          :disabled="!connected"
          data-testid="console-refresh"
          @click="refresh(true)"
        >
          Refresh
        </v-btn>
        <v-btn aria-label="Close" icon variant="text" @click="open = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <div class="px-4 pt-3 pb-2 d-flex align-center ga-2 flex-wrap text-body-2" data-testid="console-header">
        <v-chip
          size="small"
          variant="tonal"
          :color="getStatusColor(serverStatusMap, serverStatus)"
          :prepend-icon="getStatusIcon(serverStatusMap, serverStatus)"
        >
          {{ getStatusLabel(serverStatusMap, serverStatus) }}
        </v-chip>
        <span v-if="snapshot">
          agent {{ snapshot.agent.version ?? 'unknown' }} · heartbeat {{ heartbeatAge }} ·
          <span :class="rconClass" data-testid="console-rcon">{{ rconLabel }}</span>
        </span>
        <span v-if="playersSummary" class="text-medium-emphasis">· {{ playersSummary }}</span>
        <span v-if="snapshot?.gamestate" class="text-medium-emphasis">
          · gamestate {{ snapshot.gamestate }}
        </span>
      </div>

      <div class="px-4 pb-3 d-flex align-center ga-2 flex-wrap text-body-2" data-testid="console-reservation">
        <template v-if="snapshot?.reservation">
          <v-icon size="small">mdi-sword-cross</v-icon>
          <span>
            {{ snapshot.reservation.kind === 'pug' ? 'PUG' : 'Match' }}
            <code>{{ snapshot.reservation.match_id.slice(0, 8) }}…</code>
            · {{ getStatusLabel(reservationStatusMap, snapshot.reservation.status) }}
          </span>
        </template>
        <span v-else-if="snapshot" class="text-medium-emphasis">No match loaded.</span>
        <v-chip
          v-for="hold in snapshot?.holds ?? []"
          :key="hold.id"
          size="x-small"
          variant="tonal"
          :color="hold.tournament_id ? 'info' : 'warning'"
          prepend-icon="mdi-calendar-lock"
          :title="hold.reason ?? ''"
        >
          {{ holdLabel(hold) }}
        </v-chip>
      </div>

      <v-alert
        v-if="snapshot && !connected"
        type="warning"
        variant="tonal"
        density="compact"
        class="mx-4 mb-3"
        data-testid="console-offline"
      >
        Agent offline{{ offlineSince }}. Showing the last heartbeat; actions are disabled.
      </v-alert>
      <v-alert
        v-else-if="snapshot?.live_error"
        type="info"
        variant="tonal"
        density="compact"
        class="mx-4 mb-3"
        data-testid="console-live-error"
      >
        The server did not answer <code>status</code> ({{ snapshot.live_error }}); showing the last heartbeat.
      </v-alert>
      <v-alert
        v-if="loadError"
        type="error"
        variant="tonal"
        density="compact"
        class="mx-4 mb-3"
        closable
        @click:close="loadError = null"
      >
        {{ loadError }}
      </v-alert>
      <v-alert
        v-if="actionError"
        type="error"
        variant="tonal"
        density="compact"
        class="mx-4 mb-3"
        closable
        data-testid="console-action-error"
        @click:close="actionError = null"
      >
        {{ actionError }}
      </v-alert>

      <v-tabs v-model="tab" density="compact" class="px-2">
        <v-tab value="now" data-testid="console-tab-now">Now</v-tab>
        <v-tab value="map" data-testid="console-tab-map">Map</v-tab>
        <v-tab value="players" data-testid="console-tab-players">
          Players
          <v-chip v-if="humanCount !== null" size="x-small" class="ml-1" variant="tonal">{{ humanCount }}</v-chip>
        </v-tab>
        <v-tab value="console" data-testid="console-tab-console">Console</v-tab>
      </v-tabs>
      <v-divider />

      <v-card-text class="console-body">
        <v-window v-model="tab">
          <!-- ============================== Now ============================== -->
          <v-window-item value="now">
            <div class="d-flex flex-wrap ga-2 mb-4">
              <v-btn size="small" variant="tonal" :disabled="disabled" data-testid="action-pause" @click="run('pause')">
                Pause
              </v-btn>
              <v-btn size="small" variant="tonal" :disabled="disabled" data-testid="action-unpause" @click="run('unpause')">
                Unpause
              </v-btn>
              <v-btn size="small" variant="tonal" :disabled="disabled" data-testid="action-force-start" @click="run('force_start')">
                Force start
              </v-btn>
              <v-btn size="small" variant="tonal" :disabled="disabled" data-testid="action-restart-warmup" @click="run('restart_warmup')">
                Restart warmup
              </v-btn>
              <v-btn size="small" variant="tonal" :disabled="disabled" data-testid="action-kick-bots" @click="run('kick_bots')">
                Kick bots
              </v-btn>
              <v-btn size="small" variant="tonal" color="error" :disabled="disabled" data-testid="action-end-match" @click="confirmEndMatch">
                End match…
              </v-btn>
            </div>

            <div class="d-flex ga-2 align-start mb-4">
              <v-text-field
                v-model="broadcastText"
                aria-label="Broadcast message"
                label="Broadcast message"
                hint="Shown in chat to everyone on the server"
                persistent-hint
                variant="outlined"
                density="compact"
                maxlength="200"
                :disabled="disabled"
                data-testid="broadcast-input"
                @keydown.enter.prevent="broadcast"
              />
              <v-btn
                size="small"
                variant="tonal"
                class="mt-1"
                :disabled="disabled || !broadcastText.trim()"
                data-testid="action-broadcast"
                @click="broadcast"
              >
                Say
              </v-btn>
            </div>

            <v-divider class="mb-3" />

            <div class="d-flex align-center ga-4 flex-wrap">
              <v-switch
                :model-value="practiceOn"
                :disabled="disabled || practiceBusy"
                color="warning"
                density="compact"
                hide-details
                label="Practice mode"
                aria-label="Practice mode"
                data-testid="action-practice"
                @update:model-value="togglePractice"
              />
              <v-select
                v-if="!practiceOn"
                v-model="practiceHours"
                :items="PRACTICE_HOURS"
                aria-label="Practice hold length"
                label="Hold for"
                variant="outlined"
                density="compact"
                hide-details
                style="max-width: 140px"
                :disabled="disabled"
                data-testid="practice-hours"
              />
              <span v-else class="text-caption text-medium-emphasis">
                Held for practice until {{ practiceUntil }}
              </span>
            </div>
            <p class="text-caption text-medium-emphasis mt-1 mb-4">
              Practice mode stops MatchZy kicking people with no match loaded, loads the practice
              config, and keeps the allocator off the server until the hold ends.
            </p>

            <div v-if="lastResult" data-testid="console-last-result">
              <div class="text-caption text-medium-emphasis mb-1">Last action</div>
              <pre class="console-output" :class="{ 'console-output--failed': !lastResult.ok }">{{ lastResult.text }}</pre>
            </div>
          </v-window-item>

          <!-- ============================== Map ============================== -->
          <v-window-item value="map">
            <p class="text-body-2 mb-3" data-testid="map-current">
              Current map: <strong>{{ currentMap ?? 'unknown' }}</strong>
              <span v-if="changing" class="text-warning">
                — changing to {{ changing.target }}…
              </span>
            </p>
            <v-alert
              v-if="mapWarning"
              type="warning"
              variant="tonal"
              density="compact"
              class="mb-3"
              data-testid="map-warning"
            >
              {{ mapWarning }}
            </v-alert>

            <v-autocomplete
              v-model="selectedMapId"
              :items="mapItems"
              item-title="display_name"
              item-value="id"
              aria-label="Catalogue map"
              label="Catalogue map"
              variant="outlined"
              density="compact"
              clearable
              :loading="mapsLoading"
              :disabled="disabled"
              data-testid="map-picker"
            >
              <template #item="{ props: itemProps, item }">
                <v-list-item v-bind="itemProps" :subtitle="mapSubtitle(item.raw)" />
              </template>
            </v-autocomplete>
            <v-text-field
              v-model="customMap"
              aria-label="Other map"
              label="Other: workshop link, workshop id or map name"
              variant="outlined"
              density="compact"
              :disabled="disabled"
              data-testid="map-custom"
              @keydown.enter.prevent="changeMap"
            />
            <div class="d-flex align-center ga-3 flex-wrap">
              <v-btn
                color="primary"
                :disabled="disabled || !mapTargetChosen"
                :loading="store.changeMapState.loading"
                data-testid="map-change"
                @click="changeMap"
              >
                Change map
              </v-btn>
              <span class="text-caption text-medium-emphasis">
                <template v-if="matchLoaded">A match is loaded — changing map ends it. </template>
                A workshop map can take minutes to download; the header updates when it lands.
              </span>
            </div>
          </v-window-item>

          <!-- ============================ Players ============================ -->
          <v-window-item value="players">
            <p v-if="!snapshot?.status" class="text-body-2 text-medium-emphasis" data-testid="players-empty">
              No <code>status</code> captured yet.
              {{ snapshot?.agent.reports_status === false ? 'This agent does not report players; use Refresh.' : '' }}
            </p>
            <p v-else-if="players.length === 0" class="text-body-2 text-medium-emphasis" data-testid="players-empty">
              Nobody is connected.
            </p>
            <div v-else class="table-scroll">
              <v-table density="compact" data-testid="console-players">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Portal player</th>
                    <th>Steam ID</th>
                    <th class="text-right">Ping</th>
                    <th class="text-right">Loss</th>
                    <th class="text-right">Connected</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="p in players"
                    :key="`${p.userid}-${p.name}`"
                    :class="{ 'text-medium-emphasis': p.bot }"
                    data-testid="console-player-row"
                  >
                    <td>{{ p.name }}<v-chip v-if="p.bot" size="x-small" class="ml-1" variant="tonal">BOT</v-chip></td>
                    <td>
                      <router-link v-if="p.player" :to="{ name: 'player-detail', params: { id: p.player.id } }">
                        {{ p.player.display_name }}
                      </router-link>
                      <span v-else class="text-medium-emphasis">—</span>
                    </td>
                    <td><code v-if="p.steam_id64">{{ p.steam_id64 }}</code><span v-else>—</span></td>
                    <td class="text-right">{{ p.ping ?? '—' }}</td>
                    <td class="text-right">{{ p.loss ?? '—' }}</td>
                    <td class="text-right">{{ connectedFor(p.connected_secs) }}</td>
                    <td class="text-right">
                      <v-btn
                        v-if="!p.bot"
                        size="x-small"
                        variant="text"
                        color="error"
                        :disabled="disabled"
                        data-testid="player-kick"
                        @click="confirmKick(p)"
                      >
                        Kick…
                      </v-btn>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </div>
            <v-text-field
              v-model="kickReason"
              class="mt-4"
              aria-label="Kick reason"
              label="Kick reason"
              hint="Shown to the player"
              persistent-hint
              variant="outlined"
              density="compact"
              maxlength="120"
              data-testid="kick-reason"
            />
          </v-window-item>

          <!-- ============================ Console ============================ -->
          <v-window-item value="console">
            <div ref="logEl" class="console-log mb-3" data-testid="console-log">
              <p v-if="logEntries.length === 0" class="text-caption text-medium-emphasis ma-2">
                Nothing sent to this server yet.
              </p>
              <div v-for="entry in logEntries" :key="entry.id" class="console-entry" :data-kind="entry.kind">
                <div class="console-entry__cmd">
                  <span class="console-entry__prompt">&gt;</span>
                  <span>{{ entry.command }}</span>
                  <span class="text-caption text-medium-emphasis ml-2">
                    {{ entry.admin ?? '' }} · {{ formatTime(entry.at) }}
                    <template v-if="entry.kind !== 'raw'"> · {{ entry.kind }}</template>
                  </span>
                </div>
                <pre v-if="entry.output" class="console-output" :class="{ 'console-output--failed': !entry.ok }">{{ entry.output }}</pre>
              </div>
            </div>
            <div class="d-flex ga-2 align-start">
              <v-text-field
                v-model="commandText"
                aria-label="Console command"
                label="Console command"
                prepend-inner-icon="mdi-chevron-right"
                variant="outlined"
                density="compact"
                hide-details
                spellcheck="false"
                autocomplete="off"
                :disabled="disabled"
                data-testid="console-input"
                @keydown.enter.prevent="send"
                @keydown.up.prevent="recall(-1)"
                @keydown.down.prevent="recall(1)"
              />
              <v-btn
                color="primary"
                :disabled="disabled || !commandText.trim()"
                :loading="store.runCommandState.loading"
                data-testid="console-send"
                @click="send"
              >
                Send
              </v-btn>
            </div>
            <p class="text-caption text-medium-emphasis mt-2">
              One command per line. The portal's own settings (RCON, webhooks, demo upload) and
              <code>exec</code> are refused here and at the agent.
            </p>
          </v-window-item>
        </v-window>
      </v-card-text>
    </v-card>
  </v-dialog>
  <ConfirmDialogHost :dialog="confirmDialog" />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import { ApiError } from '@/api'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useGamesStore } from '@/stores/games'
import type { GameServer } from '@/stores/gameServers'
import { useServerConsoleStore } from '@/stores/serverConsole'
import type {
  ConsoleAction,
  ConsoleActionArgs,
  ConsoleLogEntry,
  ConsolePlayer,
} from '@/stores/serverConsole'
import type { components } from '@/api/types'
import {
  getStatusColor,
  getStatusIcon,
  getStatusLabel,
  reservationStatusMap,
  serverStatusMap,
} from '@/utils/statusMaps'

type MapInfo = components['schemas']['MapInfoResponse']
type ConsoleHold = components['schemas']['ConsoleHold']

const props = defineProps<{
  modelValue: boolean
  server: GameServer | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  /** Something the Game Servers table shows may have changed. */
  changed: []
}>()

/** Heartbeat cadence; the stored snapshot cannot be fresher than this. */
const POLL_MS = 30_000
/** While a map change is in flight the snapshot is read more often. */
const CHANGING_POLL_MS = 5_000
/** How long a stock / workshop map change may take before the tab warns. */
const STOCK_MAP_WARN_MS = 20_000
const WORKSHOP_MAP_WARN_MS = 180_000
/** An `rcon down` heartbeat this soon after a map command is the level change. */
const RCON_GRACE_MS = 60_000
const PRACTICE_HOURS = [1, 2, 3, 4, 6, 8, 12]
const PRACTICE_PREFIX = 'Practice (console)'
const LOG_LIMIT = 50

const store = useServerConsoleStore()
const gamesStore = useGamesStore()
const { snapshot, history } = storeToRefs(store)
const confirmDialog = useConfirmDialog()

const open = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const tab = ref<'now' | 'map' | 'players' | 'console'>('now')
const refreshing = ref(false)
const loadError = ref<string | null>(null)
const actionError = ref<string | null>(null)
const lastResult = ref<{ ok: boolean; text: string } | null>(null)

// Now tab
const broadcastText = ref('')
const practiceHours = ref(2)
const practiceBusy = ref(false)

// Map tab
const maps = ref<MapInfo[]>([])
const mapsLoading = ref(false)
const selectedMapId = ref<string | null>(null)
const customMap = ref('')
const changing = ref<{ target: string; workshop: boolean; startedAt: number } | null>(null)
const mapWarning = ref<string | null>(null)

// Players tab
const kickReason = ref('Kicked by an admin')

// Console tab
const commandText = ref('')
const sent = ref<string[]>([])
const recallIndex = ref<number | null>(null)
const refusals = ref<LogEntry[]>([])
const logEl = ref<HTMLElement | null>(null)

interface LogEntry {
  id: string
  kind: string
  command: string
  output: string | null
  ok: boolean
  admin: string | null
  at: string
}

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

const connected = computed(() => snapshot.value?.agent.connected ?? false)
const disabled = computed(() => !connected.value)
const serverStatus = computed(() => snapshot.value?.server_status ?? props.server?.status ?? 'offline')
const currentMap = computed(() => lastSegment(snapshot.value?.status?.map ?? props.server?.last_map ?? null))
const players = computed<ConsolePlayer[]>(() => snapshot.value?.status?.players ?? [])
const humanCount = computed(() => {
  const s = snapshot.value?.status
  if (!s) return null
  return s.humans ?? players.value.filter((p) => !p.bot).length
})
const playersSummary = computed(() => {
  const s = snapshot.value?.status
  if (!s) return null
  const humans = s.humans ?? players.value.filter((p) => !p.bot).length
  const bots = s.bots ?? players.value.filter((p) => p.bot).length
  const max = s.max_players ? ` of ${s.max_players}` : ''
  return `${humans} player${humans === 1 ? '' : 's'}${max}${bots ? `, ${bots} bot${bots === 1 ? '' : 's'}` : ''}`
})
const matchLoaded = computed(() => {
  const gs = snapshot.value?.gamestate
  return Boolean(snapshot.value?.reservation) || (gs !== null && gs !== undefined && gs !== 'none')
})
const heartbeatAge = computed(() => {
  const at = snapshot.value?.agent.heartbeat_at
  if (!at) return 'never'
  return ageLabel(at)
})
const rconLabel = computed(() => {
  if (!snapshot.value) return ''
  const ok = snapshot.value.agent.rcon_ok
  if (ok === null || ok === undefined) return 'rcon unknown'
  if (ok) return 'rcon ok'
  if (changing.value && Date.now() - changing.value.startedAt < RCON_GRACE_MS) return 'changing map…'
  return 'rcon down'
})
const rconClass = computed(() =>
  snapshot.value?.agent.rcon_ok === false && !changing.value ? 'text-error' : 'text-medium-emphasis',
)
const offlineSince = computed(() => {
  const at = snapshot.value?.agent.heartbeat_at
  return at ? ` since ${formatTime(at)}` : ''
})
const practiceHold = computed(() =>
  (snapshot.value?.holds ?? []).find((h) => h.reason?.startsWith(PRACTICE_PREFIX)) ?? null,
)
const practiceOn = computed(() => practiceHold.value !== null)
const practiceUntil = computed(() => (practiceHold.value ? formatTime(practiceHold.value.ends_at) : ''))
const mapItems = computed(() =>
  [...maps.value].sort((a, b) => {
    const wa = a.external_id ? 1 : 0
    const wb = b.external_id ? 1 : 0
    return wa - wb || a.display_name.localeCompare(b.display_name)
  }),
)
const mapTargetChosen = computed(() => Boolean(selectedMapId.value) || customMap.value.trim().length > 0)

const logEntries = computed<LogEntry[]>(() => {
  const audited: LogEntry[] = history.value.map((row: ConsoleLogEntry) => ({
    id: row.id,
    kind: row.kind,
    command: row.command,
    output: row.output ?? null,
    ok: row.ok,
    admin: row.admin_username ?? null,
    at: row.created_at,
  }))
  return [...audited, ...refusals.value]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-LOG_LIMIT)
})

// ---------------------------------------------------------------------------
// Loading and polling
// ---------------------------------------------------------------------------

let pollTimer: ReturnType<typeof setInterval> | null = null
let ticks = 0

async function refresh(live: boolean) {
  const server = props.server
  if (!server) return
  if (live) refreshing.value = true
  try {
    const snap = await store.fetchSnapshot(server.id, live)
    loadError.value = null
    checkMapChange(snap.status?.map ?? null)
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.detail : 'Failed to load the server console'
  } finally {
    refreshing.value = false
  }
}

async function loadHistory() {
  const server = props.server
  if (!server) return
  try {
    await store.fetchHistory(server.id)
    await nextTick()
    scrollLog()
  } catch {
    // The log is a convenience; the snapshot already reported any real error.
  }
}

async function loadMaps() {
  const server = props.server
  if (!server) return
  mapsLoading.value = true
  try {
    maps.value = await gamesStore.fetchMaps(server.game_id)
  } catch {
    maps.value = []
  } finally {
    mapsLoading.value = false
  }
}

function startPolling() {
  stopPolling()
  ticks = 0
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'hidden') return
    ticks += 1
    const due = changing.value ? true : ticks % (POLL_MS / CHANGING_POLL_MS) === 0
    if (due) void refresh(false)
  }, CHANGING_POLL_MS)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function onOpen() {
  tab.value = 'now'
  actionError.value = null
  loadError.value = null
  lastResult.value = null
  changing.value = null
  mapWarning.value = null
  selectedMapId.value = null
  customMap.value = ''
  refusals.value = []
  store.reset()
  void refresh(false)
  void loadHistory()
  void loadMaps()
  startPolling()
}

function onClose() {
  stopPolling()
  changing.value = null
  store.reset()
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) onOpen()
    else onClose()
  },
  { immediate: true },
)

onBeforeUnmount(stopPolling)

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** After anything ran on the server: go live once, reload the log, tell the table. */
async function afterCommand() {
  emit('changed')
  await Promise.allSettled([refresh(true), loadHistory()])
}

async function run(action: ConsoleAction, args: ConsoleActionArgs = {}, confirm = false) {
  const server = props.server
  if (!server) return
  actionError.value = null
  try {
    const result = await store.runAction(server.id, action, args, confirm)
    lastResult.value = {
      ok: result.ok,
      text: `${result.commands.map((c) => `> ${c}`).join('\n')}\n${result.output}`.trim(),
    }
    if (!result.ok) actionError.value = `The server refused ${labelFor(action)}: ${result.output}`
    await afterCommand()
  } catch (e) {
    actionError.value = e instanceof ApiError ? e.detail : `${labelFor(action)} failed`
    throw e
  }
}

function labelFor(action: ConsoleAction): string {
  return action.split('_').join(' ')
}

function confirmEndMatch() {
  const reservation = snapshot.value?.reservation
  confirmDialog.confirm({
    title: 'End the match?',
    message: reservation
      ? 'The live reservation is cancelled, both teams are told, and MatchZy resets the server.'
      : 'MatchZy ends whatever is loaded and resets the server.',
    action: 'End match',
    color: 'error',
    handler: () => run('end_match', {}, true).catch(() => undefined),
  })
}

async function broadcast() {
  const message = broadcastText.value.trim()
  if (!message) return
  await run('broadcast', { message }).catch(() => undefined)
  broadcastText.value = ''
}

async function togglePractice(value: boolean | null) {
  practiceBusy.value = true
  try {
    if (value) {
      const until = new Date(Date.now() + practiceHours.value * 3_600_000).toISOString()
      await run('practice_start', { until })
    } else {
      await run('practice_stop')
    }
  } catch {
    // Reported through actionError; the switch follows the snapshot.
  } finally {
    practiceBusy.value = false
  }
}

function confirmKick(p: ConsolePlayer) {
  confirmDialog.confirm({
    title: `Kick ${p.name}?`,
    message: `They are disconnected with the reason "${kickReason.value.trim() || 'Kicked by an admin'}". They can reconnect unless the server password changes.`,
    action: 'Kick',
    color: 'error',
    handler: () =>
      run('kick_player', { userid: p.userid, reason: kickReason.value.trim() || null }, true).catch(
        () => undefined,
      ),
  })
}

// ---------------------------------------------------------------------------
// Map change
// ---------------------------------------------------------------------------

function mapSubtitle(map: MapInfo): string {
  if (map.external_id) return `Workshop ${map.external_id}`
  const engine = map.engine_name ?? map.id
  return engine !== map.display_name ? engine : 'Stock map'
}

async function changeMap() {
  const server = props.server
  if (!server || !mapTargetChosen.value) return
  const body = selectedMapId.value
    ? { map_id: selectedMapId.value, force: false }
    : { custom: customMap.value.trim(), force: false }
  const doChange = async (force: boolean) => {
    actionError.value = null
    try {
      const result = await store.changeMap(server.id, { ...body, force })
      changing.value = {
        target: lastSegment(result.target.engine_name) ?? result.target.engine_name,
        workshop: result.target.workshop,
        startedAt: Date.now(),
      }
      mapWarning.value = null
      lastResult.value = { ok: result.ok, text: `> ${result.command}\n${result.output}`.trim() }
      if (!result.ok) {
        changing.value = null
        actionError.value = `The server refused the map change: ${result.output}`
      }
      await afterCommand()
    } catch (e) {
      actionError.value = e instanceof ApiError ? e.detail : 'Map change failed'
    }
  }
  if (matchLoaded.value) {
    confirmDialog.confirm({
      title: 'Change map and end the match?',
      message: snapshot.value?.reservation
        ? 'A match is loaded. Its reservation is cancelled, both teams are told, and the server changes level.'
        : 'Something is loaded on the server. It is ended and the server changes level.',
      action: 'Change map',
      color: 'error',
      handler: () => doChange(true),
    })
    return
  }
  await doChange(false)
}

/** Called with every snapshot: settle or time out an in-flight map change. */
function checkMapChange(map: string | null) {
  const inFlight = changing.value
  if (!inFlight) return
  if (lastSegment(map) === inFlight.target) {
    changing.value = null
    mapWarning.value = null
    return
  }
  const waited = Date.now() - inFlight.startedAt
  if (!inFlight.workshop && waited > STOCK_MAP_WARN_MS) {
    mapWarning.value = `The server did not change to ${inFlight.target} — is the map installed?`
    changing.value = null
  } else if (inFlight.workshop && waited > WORKSHOP_MAP_WARN_MS) {
    mapWarning.value = `Still no sign of ${inFlight.target} after three minutes. The download may have failed; check the server.`
    changing.value = null
  }
}

// ---------------------------------------------------------------------------
// Raw console
// ---------------------------------------------------------------------------

async function send() {
  const server = props.server
  const command = commandText.value.trim()
  if (!server || !command) return
  sent.value.push(command)
  recallIndex.value = null
  commandText.value = ''
  actionError.value = null
  try {
    await store.runCommand(server.id, command)
    await afterCommand()
  } catch (e) {
    // A refusal is part of the conversation, not a page error.
    const detail = e instanceof ApiError ? e.detail : 'Command failed'
    refusals.value.push({
      id: `local-${Date.now()}-${refusals.value.length}`,
      kind: 'refused',
      command,
      output: detail,
      ok: false,
      admin: null,
      at: new Date().toISOString(),
    })
    await nextTick()
    scrollLog()
  }
}

/** Walk the commands sent this session with the arrow keys. */
function recall(direction: -1 | 1) {
  if (sent.value.length === 0) return
  const last = sent.value.length - 1
  let index = recallIndex.value ?? sent.value.length
  index += direction
  if (index < 0) index = 0
  if (index > last) {
    recallIndex.value = null
    commandText.value = ''
    return
  }
  recallIndex.value = index
  commandText.value = sent.value[index] ?? ''
}

function scrollLog() {
  const el = logEl.value
  if (el) el.scrollTop = el.scrollHeight
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function lastSegment(map: string | null | undefined): string | null {
  if (!map) return null
  const parts = map.split('/')
  return parts[parts.length - 1] || map
}

function ageLabel(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 90) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
}

function connectedFor(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function holdLabel(hold: ConsoleHold): string {
  const what = hold.reason?.startsWith(PRACTICE_PREFIX)
    ? 'Practice'
    : hold.tournament_id
      ? 'Event hold'
      : 'Held'
  return `${what} until ${formatTime(hold.ends_at)}`
}
</script>

<style scoped>
.console-body {
  min-height: 360px;
}

.table-scroll {
  overflow-x: auto;
}

.console-log {
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  padding: 4px 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
}

.console-entry {
  padding: 4px 10px;
}

.console-entry__cmd {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}

.console-entry__prompt {
  color: rgb(var(--v-theme-primary));
}

.console-output {
  margin: 2px 0 0 14px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.console-output--failed {
  color: rgb(var(--v-theme-error));
}
</style>
