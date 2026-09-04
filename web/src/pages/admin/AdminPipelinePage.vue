<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-6 flex-wrap ga-4">
      <div>
        <h1 class="text-h4">Ingestion Pipeline</h1>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Steam tracking tokens &rarr; discovered matches &rarr; demo catalog.
          Ingestion also supplies player ratings, which drive seeding and league entry.
        </p>
      </div>
      <div class="d-flex align-center ga-3">
        <v-select
          v-model="selectedGame"
          aria-label="Game"
          :items="gameOptions"
          label="Game"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          style="min-width: 200px"
          data-testid="pipeline-game-filter"
          @update:model-value="loadAll"
        />
        <v-btn
          color="primary"
          variant="tonal"
          prepend-icon="mdi-refresh"
          :loading="overviewLoading"
          data-testid="pipeline-refresh"
          @click="loadAll"
        >
          Refresh
        </v-btn>
      </div>
    </div>

    <ErrorAlert
      :error="fetchPipelineOverviewState.error"
      retryable
      @clear="fetchPipelineOverviewState.error = null"
      @retry="loadAll"
    />

    <!-- ================= Stage summary ================= -->
    <v-row v-if="overview" class="mb-2">
      <v-col v-for="stage in stages" :key="stage.key" cols="12" md="4">
        <v-card variant="outlined" :data-testid="`pipeline-stage-${stage.key}`">
          <v-card-text>
            <div class="d-flex align-center ga-2 mb-2">
              <v-icon :color="stage.healthy ? 'success' : 'error'" size="20">
                {{ stage.healthy ? 'mdi-check-circle' : 'mdi-alert-circle' }}
              </v-icon>
              <span class="text-subtitle-1 font-weight-medium">{{ stage.title }}</span>
              <v-chip
                size="x-small"
                :color="stage.healthy ? 'success' : 'error'"
                variant="flat"
                :data-testid="`pipeline-stage-${stage.key}-health`"
              >
                {{ stage.healthy ? 'Healthy' : 'Attention' }}
              </v-chip>
            </div>
            <div class="d-flex flex-wrap ga-4">
              <div v-for="metric in stage.metrics" :key="metric.label">
                <div
                  class="text-h6 font-weight-bold"
                  :class="metric.bad ? 'text-error' : ''"
                  :data-testid="`pipeline-metric-${stage.key}-${metric.key}`"
                >
                  {{ metric.value }}
                </div>
                <div class="text-caption text-medium-emphasis">{{ metric.label }}</div>
              </div>
            </div>
            <div class="text-caption text-medium-emphasis mt-2">{{ stage.hint }}</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- ================= Tracking tokens ================= -->
    <v-card class="mb-4">
      <v-card-title class="text-subtitle-1 d-flex align-center ga-2">
        <v-icon size="20">mdi-key-chain</v-icon>
        Steam Tracking Tokens
        <span class="text-caption text-medium-emphasis font-weight-regular">
          worst health first
        </span>
      </v-card-title>
      <v-card-text>
        <ErrorAlert
          :error="fetchTrackingHealthState.error"
          @clear="fetchTrackingHealthState.error = null"
        />
        <div v-if="trackingHealth.length === 0" class="text-medium-emphasis py-4">
          No players have enabled match tracking{{ selectedGameLabel }}. Nothing can be
          discovered until at least one player opts in from their profile.
        </div>
        <div v-else class="table-scroll">
          <v-table density="compact">
            <thead>
              <tr>
                <th>Player</th>
                <th>SteamID64</th>
                <th>Status</th>
                <th>Poll Errors</th>
                <th>Last Poll</th>
                <th>Last Error</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="entry in trackingHealth"
                :key="entry.id"
                :data-testid="`tracking-row-${entry.id}`"
              >
                <td>
                  <div class="font-weight-medium" :data-testid="`tracking-player-${entry.id}`">
                    {{ entry.player_display_name }}
                  </div>
                  <div class="text-caption text-medium-emphasis">{{ entry.game_slug }}</div>
                </td>
                <td class="text-caption">{{ entry.steam_id_64 }}</td>
                <td>
                  <v-chip
                    size="x-small"
                    :color="entry.is_active ? 'success' : 'grey'"
                    variant="flat"
                    :data-testid="`tracking-status-${entry.id}`"
                  >
                    {{ entry.is_active ? 'Active' : 'Disabled' }}
                  </v-chip>
                </td>
                <td>
                  <span
                    :class="entry.poll_errors > 0 ? 'text-error font-weight-bold' : ''"
                    :data-testid="`tracking-errors-${entry.id}`"
                  >
                    {{ entry.poll_errors }}
                  </span>
                </td>
                <td class="text-caption" :data-testid="`tracking-last-poll-${entry.id}`">
                  {{ entry.last_poll_at ? formatRelativeTime(entry.last_poll_at) : 'Never polled' }}
                </td>
                <td class="text-caption text-error">{{ entry.last_error ?? '-' }}</td>
              </tr>
            </tbody>
          </v-table>
        </div>
      </v-card-text>
    </v-card>

    <!-- ================= Discovered-match queue ================= -->
    <v-card class="mb-4">
      <v-card-title class="text-subtitle-1 d-flex align-center ga-2 flex-wrap">
        <v-icon size="20">mdi-transit-connection-variant</v-icon>
        Discovered Matches
        <v-spacer />
        <v-btn
          color="primary"
          variant="tonal"
          size="small"
          prepend-icon="mdi-restore"
          :loading="requeueDiscoveredState.loading"
          data-testid="requeue-stuck"
          @click="confirmRequeueStuck"
        >
          Requeue stuck
        </v-btn>
        <v-select
          v-model="discoveredStatus"
          aria-label="Discovered match status"
          :items="discoveredStatusOptions"
          label="Status"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          style="max-width: 200px"
          data-testid="discovered-status-filter"
          @update:model-value="loadDiscovered"
        />
      </v-card-title>
      <v-card-text>
        <ErrorAlert
          :error="fetchDiscoveredMatchesState.error"
          @clear="fetchDiscoveredMatchesState.error = null"
        />
        <div v-if="discoveredMatches.length === 0" class="text-medium-emphasis py-4">
          No discovered matches{{ discoveredStatus ? ` with status "${discoveredStatus}"` : '' }}.
          The poller writes here when a tracked player finishes a match.
        </div>
        <template v-else>
          <div class="text-caption text-medium-emphasis mb-2">
            "Requeue stuck" returns matches whose retry budget is spent to the queue with a fresh
            budget — the repair for a worker fault that was charged to the matches rather than to
            the connection.
          </div>
          <div class="table-scroll">
            <v-table density="compact">
              <thead>
                <tr>
                  <th>Share Code</th>
                  <th>Status</th>
                  <th>Retries</th>
                  <th>Discovered</th>
                  <th>Error</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="m in discoveredMatches"
                  :key="m.id"
                  :data-testid="`discovered-row-${m.id}`"
                >
                  <td class="text-caption">{{ m.share_code }}</td>
                  <td>
                    <v-chip
                      size="x-small"
                      :color="discoveredStatusColor(m.status)"
                      variant="flat"
                      :data-testid="`discovered-status-${m.id}`"
                    >
                      {{ discoveredStatusLabel(m.status) }}
                    </v-chip>
                    <v-chip
                      v-if="m.retry_exhausted"
                      size="x-small"
                      color="error"
                      variant="outlined"
                      class="ml-1"
                    >
                      Retries exhausted
                    </v-chip>
                  </td>
                  <td class="text-caption">{{ m.retry_count }} / {{ m.max_retries }}</td>
                  <td class="text-caption">{{ formatRelativeTime(m.discovered_at) }}</td>
                  <td class="text-caption text-error">{{ m.error ?? '-' }}</td>
                  <td class="text-right">
                    <v-btn
                      v-if="m.status === 'failed'"
                      size="x-small"
                      variant="text"
                      prepend-icon="mdi-restore"
                      :loading="requeueDiscoveredState.loading"
                      :data-testid="`requeue-${m.id}`"
                      @click="requeueOne(m.id)"
                    >
                      Retry
                    </v-btn>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>
        </template>
      </v-card-text>
    </v-card>

    <v-row>
      <!-- ================= P-64: auto-link backfill ================= -->
      <v-col cols="12" md="6">
        <v-card class="h-100">
          <v-card-title class="text-subtitle-1 d-flex align-center ga-2">
            <v-icon size="20">mdi-link-variant-plus</v-icon>
            Demo Auto-Link Backfill
          </v-card-title>
          <v-card-text>
            <p class="text-body-2 text-medium-emphasis">
              Re-runs the demo&rarr;match auto-linker over ready demos that have stats but no
              match link — the repair for a demo whose match was scheduled after its stats
              arrived.
            </p>

            <v-alert
              v-if="overview && !overview.auto_link_enabled"
              type="warning"
              variant="tonal"
              density="compact"
              class="mb-3"
              data-testid="backfill-disabled-warning"
            >
              Auto-linking is switched off, so the backfill will refuse to run. Re-enable it on
              the Demos page first.
            </v-alert>

            <ErrorAlert
              :error="processUnlinkedState.error"
              @clear="processUnlinkedState.error = null"
            />

            <v-btn
              color="primary"
              prepend-icon="mdi-play"
              :loading="processUnlinkedState.loading"
              data-testid="run-backfill"
              @click="runBackfill"
            >
              Run Backfill
            </v-btn>

            <v-alert
              v-if="lastBackfillResult"
              type="info"
              variant="tonal"
              density="compact"
              class="mt-3"
              data-testid="backfill-result"
            >
              Examined {{ lastBackfillResult.examined }} ·
              <strong>Linked {{ lastBackfillResult.linked }}</strong> ·
              Skipped {{ lastBackfillResult.skipped }}
            </v-alert>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- ================= P-68: rating override ================= -->
      <v-col cols="12" md="6">
        <v-card class="h-100">
          <v-card-title class="text-subtitle-1 d-flex align-center ga-2">
            <v-icon size="20">mdi-numeric</v-icon>
            Player Rating Override
          </v-card-title>
          <v-card-text>
            <p class="text-body-2 text-medium-emphasis">
              Ratings are mirrored from Valve Premier through this pipeline. A wrong extraction
              misseeds brackets and can lock a player out of a rating-gated league — correct it
              here. The override is appended to the player's rating history, it does not erase
              what the pipeline recorded.
            </p>

            <ErrorAlert
              :error="submitPlayerRatingState.error"
              @clear="submitPlayerRatingState.error = null"
            />

            <v-form ref="ratingForm" @submit.prevent="submitRating">
              <UserSearchAutocomplete
                v-model="ratingPlayer"
                label="Player"
                placeholder="Search by display name..."
                :rules="[(v: unknown) => !!v || 'Pick a player']"
              />

              <v-select
                v-model="ratingGameId"
                aria-label="Rating game"
                :items="gameOptions"
                label="Game"
                variant="outlined"
                density="compact"
                :rules="[(v: unknown) => !!v || 'Pick a game']"
                data-testid="rating-game"
              />

              <v-text-field
                v-model.number="ratingValue"
                label="Corrected Rating"
                type="number"
                variant="outlined"
                density="compact"
                :rules="ratingRules"
                data-testid="rating-value"
              />

              <v-text-field
                v-model="ratingSource"
                label="Source / reason"
                variant="outlined"
                density="compact"
                counter="64"
                :rules="sourceRules"
                hint="Stored verbatim on the rating-history row — say why you overrode it."
                persistent-hint
                data-testid="rating-source"
              />

              <v-btn
                type="submit"
                color="primary"
                class="mt-4"
                prepend-icon="mdi-content-save"
                :loading="submitPlayerRatingState.loading"
                data-testid="submit-rating-override"
              >
                Apply Override
              </v-btn>
            </v-form>

            <div v-if="ratingHistory.length > 0" class="mt-4">
              <div class="text-caption text-medium-emphasis mb-1">
                Rating history for {{ ratingHistoryPlayerName }}
              </div>
              <v-table density="compact" data-testid="rating-history">
                <thead>
                  <tr>
                    <th>Rating</th>
                    <th>Source</th>
                    <th>Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(h, i) in ratingHistory" :key="`${h.recorded_at}-${i}`">
                    <td class="font-weight-medium">{{ h.rating }}</td>
                    <td class="text-caption">{{ formatRatingSource(h.source) }}</td>
                    <td class="text-caption">{{ formatDateTime(h.recorded_at) }}</td>
                  </tr>
                </tbody>
              </v-table>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <ConfirmDialogHost :dialog="confirmDialog" />
  </div>
</template>

<script setup lang="ts">
/**
 * P-73 / P-64 / P-68 — the ingestion pipeline operator surface.
 *
 * Before this page the portal's view of demo ingestion started at the
 * *catalogued* demo (`AdminDemosPage`). Everything upstream — Steam tracking
 * tokens, the discovered-match queue, enrichment — only ever spoke over the
 * `X-API-Key` `/v1/internal` routes, so a poller that had stopped polling, a
 * token Valve had revoked, or an enricher stuck retrying were all invisible
 * from the portal. Since ingestion is what supplies player ratings, that
 * failure propagated silently into seeding and league entry gates.
 *
 * The three controls live together because they are one workflow: you see the
 * pipeline stall here (P-73), you re-run the link pass here (P-64), and you
 * correct the rating the broken pipeline produced here (P-68). The reads are
 * admin-authenticated equivalents of the internal routes — the `X-API-Key`
 * routes are never exposed to the browser.
 */
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useDemosStore } from '@/stores/demos'
import { usePlayersStore, type PlayerRatingHistory } from '@/stores/players'
import { useGamesStore } from '@/stores/games'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import { formatRelativeTime, formatDateTime } from '@/utils/formatters'
import UserSearchAutocomplete from '@/components/admin/UserSearchAutocomplete.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import type { components } from '@/api/types'

type PlayerSummary = components['schemas']['PlayerSearchResponse']

/**
 * P-176: rating-history sources rendered raw ("demo_rank_update").
 * `player_rating_history.source` is genuinely unconstrained (VARCHAR, and the
 * admin override form accepts free text), so this humanizes machine tokens —
 * snake_case becomes spaced words — and passes anything else through
 * unchanged rather than pretending to know a vocabulary the column doesn't
 * have.
 */
function formatRatingSource(source: string): string {
  return /^[a-z0-9_]+$/.test(source)
    ? source.replace(/_/g, ' ').replace(/^\w/, (c: string) => c.toUpperCase())
    : source
}

const demosStore = useDemosStore()
const playersStore = usePlayersStore()
const gamesStore = useGamesStore()
const snackbar = useSnackbar()
const confirmDialog = useConfirmDialog()

const {
  pipelineOverview: overview,
  trackingHealth,
  discoveredMatches,
  lastBackfillResult,
  fetchPipelineOverviewState,
  fetchTrackingHealthState,
  fetchDiscoveredMatchesState,
  requeueDiscoveredState,
  processUnlinkedState,
} = storeToRefs(demosStore)

const { submitPlayerRatingState } = storeToRefs(playersStore)

const selectedGame = ref<string | undefined>(undefined)
const discoveredStatus = ref<string | undefined>(undefined)

const ratingPlayer = ref<PlayerSummary | null>(null)
const ratingGameId = ref<string | undefined>(undefined)
const ratingValue = ref<number | null>(null)
const ratingSource = ref('')
const ratingForm = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
const ratingHistory = ref<PlayerRatingHistory[]>([])
const ratingHistoryPlayerName = ref('')

const overviewLoading = computed(() => fetchPipelineOverviewState.value.loading)

const gameOptions = computed(() =>
  gamesStore.games.map((g) => ({ title: g.display_name, value: g.slug })),
)

const selectedGameLabel = computed(() => {
  const match = gameOptions.value.find((g) => g.value === selectedGame.value)
  return match ? ` for ${match.title}` : ''
})

const discoveredStatusOptions = [
  { title: 'Pending', value: 'pending' },
  { title: 'Enriching', value: 'enriching' },
  { title: 'Enriched', value: 'enriched' },
  { title: 'Failed', value: 'failed' },
]

/**
 * The discovered-match status is one of four backend values that has never
 * been declared as an OpenAPI enum, so it arrives as a bare string. These two
 * helpers keep the raw wire value off the screen (P-10/P-44 family) and fall
 * back to the raw value only for a status the backend adds later.
 */
function discoveredStatusLabel(status: string): string {
  return discoveredStatusOptions.find((o) => o.value === status)?.title ?? status
}

function discoveredStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'warning'
    case 'enriching':
      return 'info'
    case 'enriched':
      return 'success'
    case 'failed':
      return 'error'
    default:
      return 'grey'
  }
}

/**
 * One card per pipeline stage, each with an explicit healthy/attention verdict
 * — the operator question is "is ingestion running", not "what are the raw
 * numbers".
 */
const stages = computed(() => {
  const o = overview.value
  if (!o) return []
  const t = o.tracking
  const d = o.discovered_matches
  const demos = o.demos
  return [
    {
      key: 'tracking',
      title: '1. Tracking Tokens',
      healthy: t.with_errors === 0 && t.stale === 0,
      metrics: [
        { key: 'active', label: 'Active', value: t.active, bad: false },
        { key: 'errors', label: 'With errors', value: t.with_errors, bad: t.with_errors > 0 },
        { key: 'stale', label: `Stale (>${t.stale_after_hours}h)`, value: t.stale, bad: t.stale > 0 },
        { key: 'never', label: 'Never polled', value: t.never_polled, bad: false },
      ],
      hint: t.last_poll_at
        ? `Last poll ${formatRelativeTime(t.last_poll_at)}`
        : 'The poller has never reported a result.',
    },
    {
      key: 'discovered',
      title: '2. Discovered Matches',
      healthy: d.failed === 0 && d.retry_exhausted === 0,
      metrics: [
        { key: 'pending', label: 'Pending', value: d.pending, bad: false },
        { key: 'enriching', label: 'Enriching', value: d.enriching, bad: false },
        { key: 'enriched', label: 'Enriched', value: d.enriched, bad: false },
        { key: 'failed', label: 'Failed', value: d.failed, bad: d.failed > 0 },
        {
          key: 'exhausted',
          label: 'Retries spent',
          value: d.retry_exhausted,
          bad: d.retry_exhausted > 0,
        },
      ],
      hint: 'Pending grows and enriched stays flat when the enricher is down.',
    },
    {
      key: 'demos',
      title: '3. Demo Catalog',
      healthy: demos.failed === 0,
      metrics: [
        { key: 'pending', label: 'Pending', value: demos.pending, bad: false },
        { key: 'processing', label: 'Processing', value: demos.processing, bad: false },
        { key: 'ready', label: 'Ready', value: demos.ready, bad: false },
        { key: 'failed', label: 'Failed', value: demos.failed, bad: demos.failed > 0 },
      ],
      hint: 'Counts are global; the game filter above applies to the two stages before this.',
    },
  ]
})

const ratingRules = [
  (v: unknown) => (v !== null && v !== '' && v !== undefined) || 'Rating is required',
  (v: unknown) => Number.isInteger(Number(v)) || 'Rating must be a whole number',
  (v: unknown) => Number(v) >= 0 || 'Rating cannot be negative',
  (v: unknown) => Number(v) <= 1_000_000 || 'Rating must be 1,000,000 or less',
]

const sourceRules = [
  (v: unknown) => (typeof v === 'string' && v.trim().length > 0) || 'Say why you overrode it',
  (v: unknown) => (typeof v === 'string' && v.length <= 64) || 'Keep it to 64 characters',
]

async function loadDiscovered() {
  await demosStore.fetchDiscoveredMatches({
    game: selectedGame.value,
    status: discoveredStatus.value,
    limit: 25,
  })
}

async function loadAll() {
  await Promise.all([
    demosStore.fetchPipelineOverview(selectedGame.value),
    demosStore.fetchTrackingHealth({ game: selectedGame.value, limit: 25 }),
    loadDiscovered(),
  ])
}

/** Bulk requeue. Gated because it rewrites the retry state of every stuck
 *  row for the selected game at once. */
function confirmRequeueStuck() {
  confirmDialog.confirm({
    title: 'Requeue stuck matches',
    message:
      'Matches whose retry budget is spent will be returned to the enrichment queue with a ' +
      'fresh budget, staggered over the next few minutes. Matches that are still retrying are ' +
      'left alone.',
    action: 'Requeue',
    handler: async () => {
      const requeued = await demosStore.requeueDiscoveredMatches({
        game: selectedGame.value,
        onlyExhausted: true,
      })
      snackbar.success(
        requeued === 0
          ? 'No matches were stuck — nothing to requeue'
          : `Requeued ${requeued} ${requeued === 1 ? 'match' : 'matches'}`,
      )
      await loadAll()
    },
  })
}

async function requeueOne(id: string) {
  try {
    await demosStore.requeueDiscoveredMatch(id)
    snackbar.success('Match requeued')
    await demosStore.fetchPipelineOverview(selectedGame.value)
  } catch {
    snackbar.error(requeueDiscoveredState.value.error ?? 'Failed to requeue the match')
  }
}

async function runBackfill() {
  try {
    const result = await demosStore.processUnlinkedDemos(500)
    snackbar.success(
      `Backfill complete: linked ${result.linked} of ${result.examined} examined`,
    )
    // The pass can move demos between stages; re-read rather than guess.
    await demosStore.fetchPipelineOverview(selectedGame.value)
  } catch {
    snackbar.error(processUnlinkedState.value.error ?? 'Failed to run the auto-link backfill')
  }
}

async function loadRatingHistory(playerId: string, gameSlug: string, playerName: string) {
  try {
    ratingHistory.value = await playersStore.fetchRatingHistory(playerId, gameSlug, 10)
    ratingHistoryPlayerName.value = playerName
  } catch {
    ratingHistory.value = []
  }
}

async function submitRating() {
  const validation = await ratingForm.value?.validate()
  if (validation && !validation.valid) return

  const player = ratingPlayer.value
  const gameSlug = ratingGameId.value
  if (!player || !gameSlug || ratingValue.value === null) return

  try {
    await playersStore.submitPlayerRating(player.id, gameSlug, {
      rating: Number(ratingValue.value),
      source: ratingSource.value.trim(),
      recorded_at: new Date().toISOString(),
    })
    snackbar.success(`Rating for ${player.display_name} set to ${ratingValue.value}`)
    await loadRatingHistory(player.id, gameSlug, player.display_name)
  } catch {
    snackbar.error(submitPlayerRatingState.value.error ?? 'Failed to submit rating')
  }
}

onMounted(async () => {
  if (gamesStore.games.length === 0) await gamesStore.fetchGames()
  await loadAll()
})
</script>

<style scoped>
/* Wide tables scroll within themselves; the page never scrolls sideways. */
.table-scroll {
  overflow-x: auto;
}
</style>
