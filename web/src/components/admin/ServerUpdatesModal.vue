<template>
  <v-dialog v-model="open" max-width="880" scrollable>
    <v-card v-if="server" data-testid="server-updates">
      <v-card-title class="d-flex align-center ga-2 flex-wrap">
        <v-icon>mdi-update</v-icon>
        <span class="text-truncate">Updates — {{ server.name }}</span>
        <v-spacer />
        <v-btn
          v-if="supported"
          aria-label="Check for updates now"
          title="Check for updates now"
          size="small"
          variant="tonal"
          prepend-icon="mdi-magnify"
          :loading="checkState.loading || checking"
          :disabled="busy"
          data-testid="updates-check"
          @click="checkNow"
        >
          Check now
        </v-btn>
        <v-btn aria-label="Close" icon variant="text" @click="open = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>
      <v-divider />

      <v-card-text class="updates-body">
        <v-alert
          v-if="loadError"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-3"
          data-testid="updates-load-error"
        >
          {{ loadError }}
        </v-alert>

        <div v-if="!overview && fetchUpdatesState.loading" class="d-flex justify-center py-6">
          <v-progress-circular indeterminate />
        </div>

        <v-alert
          v-else-if="overview && !overview.supported"
          type="info"
          variant="tonal"
          density="compact"
          data-testid="updates-unsupported"
        >
          Updates are not available here: the agent is older than 0.3.0 or the host has no update
          helper configured<template v-if="!overview.agent_connected"> (agent offline)</template>.
        </v-alert>

        <template v-else-if="overview">
          <v-alert
            v-if="!overview.agent_connected"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-3"
            data-testid="updates-offline"
          >
            Agent offline. Showing what the portal last knew; actions are disabled.
          </v-alert>
          <v-alert
            v-if="actionError"
            type="error"
            variant="tonal"
            density="compact"
            class="mb-3"
            closable
            data-testid="updates-action-error"
            @click:close="actionError = null"
          >
            {{ actionError }}
          </v-alert>

          <v-tabs v-model="tab" density="compact" class="mb-3">
            <v-tab value="overview" data-testid="updates-tab-overview">Overview</v-tab>
            <v-tab value="jobs" data-testid="updates-tab-jobs">
              Jobs
              <v-chip size="x-small" class="ml-1" variant="tonal">{{ overview.recent_jobs.length }}</v-chip>
            </v-tab>
            <v-tab value="overrides" data-testid="updates-tab-overrides">MatchZy overrides</v-tab>
          </v-tabs>

          <v-window v-model="tab">
            <!-- ============================ Overview ============================ -->
            <v-window-item value="overview">
              <UpdateJobView v-if="job" :job="job" closable @close="closeJob" />

              <template v-else>
                <v-alert
                  v-if="overview.active_job"
                  type="info"
                  variant="tonal"
                  density="compact"
                  class="mb-3"
                  data-testid="updates-active-job"
                >
                  <div class="d-flex align-center ga-2 flex-wrap">
                    <span>
                      {{ getStatusLabel(updateOperationMap, overview.active_job.operation) }}
                      is in progress ({{ phaseLabel(overview.active_job.phase) }}).
                    </span>
                    <v-spacer />
                    <v-btn size="small" variant="tonal" data-testid="updates-active-job-view" @click="viewJob(overview.active_job.id)">
                      View progress
                    </v-btn>
                  </div>
                </v-alert>
                <v-alert
                  v-if="overview.reload_pending"
                  type="info"
                  variant="tonal"
                  density="compact"
                  class="mb-3"
                  data-testid="updates-reload-pending"
                >
                  The MatchZy config was repaired; the server re-reads it as soon as no match is loaded.
                </v-alert>

                <div class="d-flex align-center ga-2 flex-wrap mb-3">
                  <v-chip
                    size="small"
                    variant="tonal"
                    :color="wiredChip.color"
                    :prepend-icon="wiredChip.icon"
                    data-testid="updates-demo-wired"
                    :data-wired="String(overview.demo_upload_wired ?? null)"
                  >
                    {{ wiredChip.label }}
                  </v-chip>
                  <v-chip
                    size="small"
                    variant="tonal"
                    :color="overridesChip.color"
                    :prepend-icon="overridesChip.icon"
                    data-testid="updates-overrides-applied"
                  >
                    {{ overridesChip.label }}
                  </v-chip>
                  <v-spacer />
                  <span class="text-caption text-medium-emphasis" data-testid="updates-checked-at">
                    <template v-if="checking">Checking…</template>
                    <template v-else-if="overview.check?.checked_at">
                      Checked {{ formatDateTime(overview.check.checked_at) }}
                    </template>
                    <template v-else>Never checked</template>
                  </span>
                </div>

                <v-table density="compact" class="mb-3" data-testid="updates-components">
                  <tbody>
                    <tr v-for="row in componentRows" :key="row.op" :data-testid="`updates-row-${row.op}`">
                      <td class="py-2">
                        <div class="font-weight-medium">{{ row.label }}</div>
                        <div
                          v-for="sub in row.subs"
                          :key="sub.label"
                          class="text-body-2 d-flex align-center ga-2 flex-wrap mt-1"
                          :data-testid="`updates-plugin-${sub.key}`"
                        >
                          <span class="plugin-name">{{ sub.label }}</span>
                          <VersionPair :installed="sub.installed" :latest="sub.latest" :available="sub.available" />
                          <v-chip
                            size="x-small"
                            variant="tonal"
                            :color="sub.loaded === true ? 'success' : sub.loaded === false ? 'error' : 'grey'"
                            :data-testid="`updates-load-${sub.key}`"
                          >
                            {{ sub.loaded === true ? 'loaded' : sub.loaded === false ? 'not loaded' : 'load unknown' }}
                          </v-chip>
                        </div>
                        <div v-if="row.op === 'mods' && overview.load?.error" class="text-caption text-error mt-1">
                          {{ overview.load.error }}
                        </div>
                      </td>
                      <td class="py-2">
                        <VersionPair
                          v-if="!row.subs.length"
                          :installed="row.installed"
                          :latest="row.latest"
                          :available="row.available"
                        />
                        <v-chip
                          v-else-if="row.available"
                          size="x-small"
                          color="info"
                          variant="tonal"
                          prepend-icon="mdi-arrow-up-bold"
                        >
                          Update available
                        </v-chip>
                        <div class="text-caption text-medium-emphasis">
                          {{ row.op === 'lgsm' ? 'No restart' : 'Restarts CS2' }}
                        </div>
                      </td>
                      <td class="text-right py-2">
                        <v-btn
                          size="small"
                          variant="tonal"
                          :disabled="busy"
                          :data-testid="`updates-start-${row.op}`"
                          @click="askStart(row.op)"
                        >
                          Update
                        </v-btn>
                      </td>
                    </tr>
                  </tbody>
                </v-table>

                <div class="d-flex ga-2 flex-wrap">
                  <v-btn
                    color="primary"
                    variant="flat"
                    size="small"
                    prepend-icon="mdi-update"
                    :disabled="busy"
                    data-testid="updates-start-all"
                    @click="askStart('all')"
                  >
                    Update all
                  </v-btn>
                  <v-btn
                    variant="tonal"
                    size="small"
                    prepend-icon="mdi-wrench"
                    :disabled="busy"
                    data-testid="updates-repair"
                    @click="askRepair"
                  >
                    Repair config
                  </v-btn>
                </div>
              </template>
            </v-window-item>

            <!-- ============================== Jobs ============================== -->
            <v-window-item value="jobs">
              <p v-if="!overview.recent_jobs.length" class="text-body-2 text-medium-emphasis">
                No update jobs yet.
              </p>
              <v-table v-else density="compact" hover data-testid="updates-jobs">
                <thead>
                  <tr>
                    <th>Operation</th>
                    <th>Status</th>
                    <th>Trigger</th>
                    <th>By</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="j in overview.recent_jobs"
                    :key="j.id"
                    class="job-row"
                    tabindex="0"
                    data-testid="updates-job-row"
                    @click="viewJob(j.id)"
                    @keydown.enter="viewJob(j.id)"
                  >
                    <td>{{ getStatusLabel(updateOperationMap, j.operation) }}</td>
                    <td>
                      <v-chip
                        size="x-small"
                        variant="tonal"
                        :color="getStatusColor(updateJobStatusMap, j.status)"
                        :prepend-icon="getStatusIcon(updateJobStatusMap, j.status)"
                      >
                        {{ getStatusLabel(updateJobStatusMap, j.status) }}
                      </v-chip>
                    </td>
                    <td>{{ getStatusLabel(updateTriggerMap, j.trigger) }}</td>
                    <td>{{ j.requested_by_username ?? '—' }}</td>
                    <td class="text-caption">{{ formatDateTime(j.created_at) }}</td>
                  </tr>
                </tbody>
              </v-table>
            </v-window-item>

            <!-- ============================ Overrides =========================== -->
            <v-window-item value="overrides">
              <MatchzyOverridesEditor v-if="tab === 'overrides'" :server-id="server.id" @saved="onOverridesSaved" />
            </v-window-item>
          </v-window>
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>

  <UpdateConfirmDialog
    v-model="confirmOpen"
    :plan="plan"
    :loading="startState.loading"
    :error="confirmError"
    :refreshing="planLoading"
    :blocked="planFailed"
    @confirm="start"
  />
  <ConfirmDialogHost :dialog="confirmDialog" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ApiError } from '@/api'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import MatchzyOverridesEditor from '@/components/admin/server-updates/MatchzyOverridesEditor.vue'
import UpdateConfirmDialog from '@/components/admin/server-updates/UpdateConfirmDialog.vue'
import UpdateJobView from '@/components/admin/server-updates/UpdateJobView.vue'
import VersionPair from '@/components/admin/server-updates/VersionPair.vue'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import type { GameServer } from '@/stores/gameServers'
import { useGameServerUpdatesStore } from '@/stores/gameServerUpdates'
import { formatDateTime } from '@/utils/formatters'
import {
  buildUpdatePlan,
  isTerminalStatus,
  phaseLabel,
  updateJobStatusMap,
  updateOperationMap,
  updateTriggerMap,
  type StartUpdateOperation,
} from '@/utils/gameServerUpdates'
import { getStatusColor, getStatusIcon, getStatusLabel } from '@/utils/statusMaps'

const props = defineProps<{
  modelValue: boolean
  server: GameServer | null
  /** Opened from the list's Repair action: ask to repair straight away. */
  action?: 'repair' | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const store = useGameServerUpdatesStore()
const { overviews, job, checking, checkState, startState, fetchUpdatesState } = storeToRefs(store)
const confirmDialog = useConfirmDialog()

const open = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const tab = ref<'overview' | 'jobs' | 'overrides'>('overview')
const loadError = ref<string | null>(null)
const actionError = ref<string | null>(null)
const confirmOpen = ref(false)
const confirmOperation = ref<StartUpdateOperation | null>(null)
const confirmError = ref<string | null>(null)
/** The plan's safety picture is being re-read / could not be. */
const planLoading = ref(false)
const planFailed = ref(false)

const overview = computed(() => (props.server ? (overviews.value[props.server.id] ?? null) : null))
const supported = computed(() => overview.value?.supported === true)

/** Nothing new may start: agent away, or a job in flight. */
const busy = computed(() => {
  const o = overview.value
  if (!o || !o.agent_connected) return true
  if (o.active_job) return true
  if (job.value && !isTerminalStatus(job.value.status)) return true
  return false
})

const plan = computed(() =>
  overview.value && confirmOperation.value ? buildUpdatePlan(overview.value, confirmOperation.value) : null,
)

const wiredChip = computed(() => {
  const wired = overview.value?.demo_upload_wired
  if (wired === true) return { color: 'success', icon: 'mdi-check', label: 'Demo upload wired' }
  if (wired === false) return { color: 'error', icon: 'mdi-alert', label: 'Demo upload NOT wired' }
  return { color: 'grey', icon: 'mdi-help', label: 'Demo upload: unknown' }
})

const overridesChip = computed(() => {
  const applied = overview.value?.overrides_applied
  if (applied === true) return { color: 'success', icon: 'mdi-check', label: 'Overrides applied' }
  if (applied === false) return { color: 'warning', icon: 'mdi-alert', label: 'Overrides not applied' }
  return { color: 'grey', icon: 'mdi-minus', label: 'Overrides: none or unknown' }
})

interface ComponentRow {
  op: StartUpdateOperation
  label: string
  installed: string | null
  latest: string | null
  available: boolean | null
  subs: Array<{
    key: string
    label: string
    installed: string | null
    latest: string | null
    available: boolean | null
    loaded: boolean | null
  }>
}

const componentRows = computed<ComponentRow[]>(() => {
  const o = overview.value
  const inst = o?.installed
  const latest = o?.check?.latest
  const avail = o?.check?.update_available
  const load = o?.load
  return [
    {
      op: 'lgsm',
      label: 'LinuxGSM',
      installed: inst?.lgsm ?? null,
      latest: latest?.lgsm ?? null,
      available: avail?.lgsm ?? null,
      subs: [],
    },
    {
      op: 'game',
      label: 'CS2 server',
      installed: inst?.cs2_build ?? null,
      latest: latest?.cs2_build ?? null,
      available: avail?.game ?? null,
      subs: [],
    },
    {
      op: 'mods',
      label: 'Plugins',
      installed: null,
      latest: null,
      available: avail?.mods ?? null,
      subs: [
        {
          key: 'metamod',
          label: 'Metamod',
          installed: inst?.metamod ?? null,
          latest: latest?.metamod ?? null,
          available: avail?.metamod ?? null,
          loaded: load?.metamod ?? null,
        },
        {
          key: 'cssharp',
          label: 'CounterStrikeSharp',
          installed: inst?.cssharp ?? null,
          latest: latest?.cssharp ?? null,
          available: avail?.cssharp ?? null,
          loaded: load?.cssharp ?? null,
        },
        {
          key: 'matchzy',
          label: 'MatchZy',
          installed: inst?.matchzy ?? null,
          latest: latest?.matchzy ?? null,
          available: avail?.matchzy ?? null,
          loaded: load?.matchzy ?? null,
        },
      ],
    },
  ]
})

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function errorText(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.detail : fallback
}

/**
 * Bumped on every open, close and server switch. Anything awaited checks
 * `alive()` afterwards so a response that lands late never acts on a
 * closed modal or on the next server's.
 */
let session = 0

function alive(sess: number, serverId: string): boolean {
  return sess === session && props.modelValue && props.server?.id === serverId
}

async function load(sess: number, serverId: string) {
  try {
    const o = await store.fetchUpdates(serverId)
    if (!alive(sess, serverId)) return
    loadError.value = null
    if (o.active_job && !job.value) await store.openJob(serverId, o.active_job.id)
  } catch (e) {
    if (alive(sess, serverId)) loadError.value = errorText(e, 'Failed to load the update status')
  }
}

async function onOpen() {
  const server = props.server
  session += 1
  const sess = session
  tab.value = 'overview'
  loadError.value = null
  actionError.value = null
  confirmOpen.value = false
  if (!server) {
    store.reset()
    return
  }
  store.open(server.id)
  await load(sess, server.id)
  if (alive(sess, server.id) && props.action === 'repair' && supported.value) askRepair()
}

function onClose() {
  session += 1
  confirmOpen.value = false
  store.reset()
}

watch(
  () => [props.modelValue, props.server?.id] as const,
  ([isOpen]) => {
    if (isOpen) void onOpen()
    else onClose()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  session += 1
  store.reset()
})

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function checkNow() {
  const server = props.server
  if (!server) return
  actionError.value = null
  try {
    await store.checkNow(server.id)
  } catch (e) {
    actionError.value = errorText(e, 'Failed to start the check')
  }
}

/**
 * Open the plan, re-reading the overview first: `force` skips the
 * backend's gate entirely, so the reasons an admin consents to must be
 * current, not whatever the modal loaded minutes ago.
 */
async function askStart(operation: StartUpdateOperation) {
  const server = props.server
  if (!server) return
  confirmOperation.value = operation
  confirmError.value = null
  planFailed.value = false
  planLoading.value = true
  confirmOpen.value = true
  const sess = session
  try {
    await store.fetchUpdates(server.id)
  } catch (e) {
    if (!alive(sess, server.id)) return
    planFailed.value = true
    confirmError.value = errorText(e, 'Could not re-read who is connected; try again')
  } finally {
    if (alive(sess, server.id)) planLoading.value = false
  }
}

async function start(force: boolean) {
  const server = props.server
  const operation = confirmOperation.value
  if (!server || !operation) return
  const sess = session
  confirmError.value = null
  try {
    await store.startUpdate(server.id, operation, force)
    if (!alive(sess, server.id)) return
    confirmOpen.value = false
    tab.value = 'overview'
  } catch (e) {
    if (!alive(sess, server.id)) return
    const detail = errorText(e, 'Failed to start the update')
    if (e instanceof ApiError && e.status === 502 && job.value) {
      // The agent did not answer; the store is following the queued job.
      confirmOpen.value = false
      tab.value = 'overview'
      actionError.value = detail
      return
    }
    confirmError.value = detail
    // What a restart would interrupt may have changed: refresh the plan.
    void store.fetchUpdates(server.id).catch(() => undefined)
  }
}

function askRepair() {
  const server = props.server
  if (!server) return
  confirmDialog.confirm({
    title: 'Repair the MatchZy config?',
    message:
      'Re-asserts the portal-managed blocks (demo upload and your overrides) in MatchZy\'s ' +
      'config.cfg. Nothing restarts; the server re-reads the config when no match is loaded.',
    action: 'Repair',
    handler: async () => {
      const sess = session
      actionError.value = null
      try {
        await store.repairConfig(server.id)
        if (alive(sess, server.id)) tab.value = 'overview'
      } catch (e) {
        if (!alive(sess, server.id)) return
        if (e instanceof ApiError && e.status === 502 && job.value) {
          actionError.value = e.detail
          tab.value = 'overview'
          return
        }
        throw e
      }
    },
  })
}

async function viewJob(jobId: string) {
  const server = props.server
  if (!server) return
  tab.value = 'overview'
  const sess = session
  try {
    await store.openJob(server.id, jobId)
  } catch (e) {
    if (alive(sess, server.id)) actionError.value = errorText(e, 'Failed to load the update job')
  }
}

function closeJob() {
  store.stopPolling()
  job.value = null
  const server = props.server
  if (server) void store.fetchUpdates(server.id).catch(() => undefined)
}

function onOverridesSaved() {
  const server = props.server
  if (server) void store.fetchUpdates(server.id).catch(() => undefined)
}
</script>

<style scoped>
.updates-body {
  min-height: 320px;
}
.plugin-name {
  min-width: 150px;
}
.job-row {
  cursor: pointer;
}
</style>
