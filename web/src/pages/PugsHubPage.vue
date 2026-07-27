<template>
  <v-container>
    <div class="d-flex align-center flex-wrap ga-3 mb-4">
      <h1 class="text-h4">Pick-Up Games</h1>
      <v-spacer />
      <!-- Same `?game=<id>` convention the dashboard's game cards use, so a
           per-game hub is a shareable link. -->
      <v-select
        v-model="gameFilter"
        :items="gameItems"
        label="Game"
        aria-label="Filter by game"
        density="compact"
        variant="outlined"
        hide-details
        clearable
        style="max-width: 220px"
        data-testid="pug-game-filter"
      />
      <v-btn
        color="primary"
        prepend-icon="mdi-plus"
        data-testid="pug-create-open"
        @click="createOpen = true"
      >
        New PUG
      </v-btn>
    </div>

    <!-- Managed by me / joined -->
    <v-card class="mb-6">
      <v-card-title class="text-subtitle-1">My PUGs</v-card-title>
      <v-card-text>
        <v-progress-linear v-if="pugsStore.fetchMineState.loading" indeterminate />
        <v-alert
          v-else-if="pugsStore.fetchMineState.error"
          type="error"
          variant="tonal"
          density="compact"
        >
          {{ pugsStore.fetchMineState.error }}
        </v-alert>
        <div v-else-if="myPugs.length === 0" class="text-body-2 text-medium-emphasis">
          Nothing yet — create one and share the invite link.
        </div>
        <v-list v-else density="comfortable" data-testid="my-pugs-list">
          <v-list-item
            v-for="pug in myPugs"
            :key="pug.id"
            :to="{ name: 'pug-lobby', params: { id: pug.id } }"
          >
            <template #prepend>
              <v-icon :icon="pug.map_selection_mode === 'wheel' ? 'mdi-tire' : 'mdi-map'" />
            </template>
            <v-list-item-title class="d-flex align-center ga-2">
              {{ formatMatchFormat(pug.match_format) }}
              · {{ pug.team_size }}v{{ pug.team_size }}
              <v-chip size="x-small" :color="statusColor(pug.status)" variant="tonal">
                {{ statusLabel(pug.status) }}
              </v-chip>
              <v-chip
                v-if="pug.my_role === 'creator'"
                size="x-small"
                color="amber"
                variant="tonal"
              >
                Host
              </v-chip>
              <span
                v-if="pug.status === 'completed' && pug.team1_score != null"
                class="text-body-2 text-medium-emphasis"
              >
                {{ pug.team1_score }} : {{ pug.team2_score }}
              </span>
            </v-list-item-title>
            <v-list-item-subtitle>
              Created {{ new Date(pug.created_at).toLocaleString() }}
            </v-list-item-subtitle>
            <template #append>
              <v-btn
                v-if="pug.my_role === 'creator' && !isTerminal(pug.status)"
                size="small"
                variant="text"
                color="error"
                :data-testid="`pug-cancel-${pug.id}`"
                @click.prevent="confirmCancel(pug.id)"
              >
                Cancel
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <!-- Open pugs browser -->
    <v-card class="mb-6">
      <v-card-title class="text-subtitle-1">Open lobbies looking for players</v-card-title>
      <v-card-text>
        <v-progress-linear v-if="pugsStore.fetchOpenState.loading" indeterminate />
        <div v-else-if="openPugs.length === 0" class="text-body-2 text-medium-emphasis">
          {{ gameFilter ? `No public ${gameName(gameFilter)} lobbies right now.` : 'No public lobbies right now.' }}
        </div>
        <v-list v-else density="comfortable">
          <v-list-item
            v-for="pug in openPugs"
            :key="pug.id"
            :to="{ name: 'pug-lobby', params: { id: pug.id } }"
          >
            <v-list-item-title>
              {{ formatMatchFormat(pug.match_format) }} ·
              {{ pug.team_size }}v{{ pug.team_size }} ·
              {{ pug.map_selection_mode === 'wheel' ? 'Wheel' : 'Veto' }}
            </v-list-item-title>
            <v-list-item-subtitle v-if="pug.region">{{ pug.region }}</v-list-item-subtitle>
            <template v-slot:append>
              <!-- Which game a lobby is for is otherwise invisible, and with
                   two active games the list mixes them. -->
              <v-chip size="x-small" variant="tonal">{{ gameName(pug.game_id) }}</v-chip>
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <!-- Recent results -->
    <v-card>
      <v-card-title class="text-subtitle-1">Recent results</v-card-title>
      <v-card-text>
        <div v-if="recentPugs.length === 0" class="text-body-2 text-medium-emphasis">
          No finished PUGs yet.
        </div>
        <v-list v-else density="compact">
          <v-list-item
            v-for="pug in recentPugs"
            :key="pug.id"
            :to="{ name: 'pug-lobby', params: { id: pug.id } }"
          >
            <v-list-item-title>
              {{ formatMatchFormat(pug.match_format) }} —
              <strong>{{ pug.team1_score }} : {{ pug.team2_score }}</strong>
              <span class="text-medium-emphasis"> (Team {{ pug.winner_team }} won)</span>
            </v-list-item-title>
            <v-list-item-subtitle v-if="pug.completed_at">
              {{ new Date(pug.completed_at).toLocaleString() }}
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <!-- Create dialog -->
    <v-dialog v-model="createOpen" max-width="560">
      <v-card>
        <v-card-title>New pick-up game</v-card-title>
        <v-card-text>
          <v-select
            v-model="form.gameId"
            :items="gameItems"
            label="Game"
            aria-label="Game"
            item-title="title"
            item-value="value"
            data-testid="pug-create-game"
          />
          <v-btn-toggle v-model="form.matchFormat" mandatory divided class="mb-4" density="comfortable">
            <v-btn value="bo1" data-testid="pug-format-bo1">Bo1</v-btn>
            <v-btn value="bo3" data-testid="pug-format-bo3">Bo3</v-btn>
            <v-btn value="bo5" data-testid="pug-format-bo5">Bo5</v-btn>
          </v-btn-toggle>

          <v-radio-group v-model="form.mapSelectionMode" inline label="Map selection">
            <v-radio value="veto" label="Pick & ban veto" data-testid="pug-mode-veto" />
            <v-radio value="wheel" label="🎡 The wheel" data-testid="pug-mode-wheel" />
          </v-radio-group>
          <div class="text-caption text-medium-emphasis mb-3">
            <template v-if="form.mapSelectionMode === 'wheel'">
              Everyone nominates a map; a weighted wheel spins for each map of
              the series. Duplicate nominations get bigger slices.
            </template>
            <template v-else>
              Standard alternating pick/ban over the map pool.
            </template>
          </div>

          <v-select
            v-model="form.sideSelectionMode"
            :items="sideOptions"
            label="Side selection"
            aria-label="Side selection"
            item-title="title"
            item-value="value"
          />
          <v-row dense>
            <v-col cols="6">
              <v-text-field
                v-model.number="form.teamSize"
                type="number"
                label="Team size"
                min="1"
                max="16"
                data-testid="pug-team-size"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                v-model="form.region"
                label="Server region (optional)"
                placeholder="eu-west"
              />
            </v-col>
          </v-row>
          <v-switch
            v-model="form.listed"
            label="List publicly (anyone can find and join)"
            color="primary"
            density="compact"
          />
          <v-alert
            v-if="pugsStore.createState.error"
            type="error"
            variant="tonal"
            density="compact"
          >
            {{ pugsStore.createState.error }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="createOpen = false">Close</v-btn>
          <v-btn
            color="primary"
            :loading="pugsStore.createState.loading"
            :disabled="!form.gameId"
            data-testid="pug-create-submit"
            @click="create"
          >
            Create lobby
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <ConfirmDialogHost :dialog="confirmDialog" />
  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useGamesStore } from '@/stores/games'
import { usePugsStore } from '@/stores/pugs'
import { formatMatchFormat } from '@/utils/matchStatus'
import { getStatusColor, getStatusLabel, pugStatusMap } from '@/utils/statusMaps'

const router = useRouter()
const gamesStore = useGamesStore()
const pugsStore = usePugsStore()
const { myPugs: allMyPugs, openPugs, recentPugs: allRecentPugs } = storeToRefs(pugsStore)
const confirmDialog = useConfirmDialog()

const createOpen = ref(false)

// Game scoping. `fetchOpen` filters server-side (the endpoint takes game_id);
// `mine` and `recent` have no server filter, so those are narrowed client-side
// off PugResponse.game_id — both endpoints are capped at 50 rows, so this is a
// filter over an already-bounded list, not an unbounded over-fetch.
const route = useRoute()
const gameFilter = ref<string | null>(
  typeof route.query.game === 'string' ? route.query.game : null,
)

function gameName(gameId: string | null | undefined): string {
  if (!gameId) return ''
  return gamesStore.games.find((g) => g.id === gameId)?.display_name ?? 'Unknown game'
}

function matchesFilter(pug: { game_id: string }): boolean {
  return !gameFilter.value || pug.game_id === gameFilter.value
}

const form = reactive({
  gameId: null as string | null,
  matchFormat: 'bo1' as 'bo1' | 'bo3' | 'bo5',
  mapSelectionMode: 'veto' as 'veto' | 'wheel',
  sideSelectionMode: 'knife',
  teamSize: 5,
  region: '',
  listed: false,
})

const gameItems = computed(() =>
  gamesStore.games.map((g) => ({ title: g.display_name, value: g.id }))
)

const myPugs = computed(() => allMyPugs.value.filter(matchesFilter))
const recentPugs = computed(() => allRecentPugs.value.filter(matchesFilter))

// Refetch open lobbies server-side and keep the URL shareable. `replace` so
// flipping the filter doesn't stack history entries.
watch(gameFilter, (game) => {
  void pugsStore.fetchOpen(game ?? undefined)
  void router.replace({ query: game ? { game } : {} })
  // Keep the (closed) create dialog pointed at what you're browsing.
  if (game && !createOpen.value) form.gameId = game
})

const sideOptions = computed(() => {
  const base = [
    { title: 'Knife round (in-game)', value: 'knife' },
    { title: 'Coin flip for sides', value: 'coin_flip' },
  ]
  // No picker exists in wheel mode.
  if (form.mapSelectionMode === 'veto') {
    base.push({ title: 'Picker chooses side', value: 'picker_choice' })
  }
  return base
})

watch(
  () => form.mapSelectionMode,
  (mode) => {
    if (mode === 'wheel' && form.sideSelectionMode === 'picker_choice') {
      form.sideSelectionMode = 'knife'
    }
  }
)

function isTerminal(status: string): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'expired'
}

function statusLabel(status: string): string {
  return getStatusLabel(pugStatusMap, status)
}

function statusColor(status: string): string {
  return getStatusColor(pugStatusMap, status)
}

async function create(): Promise<void> {
  if (!form.gameId) return
  try {
    const detail = await pugsStore.createPug({
      game_id: form.gameId,
      match_format: form.matchFormat,
      map_selection_mode: form.mapSelectionMode,
      side_selection_mode: form.sideSelectionMode as never,
      team_size: form.teamSize,
      region: form.region || null,
      map_pool: null,
      listed: form.listed,
    })
    createOpen.value = false
    await router.push({ name: 'pug-lobby', params: { id: detail.pug.id } })
  } catch {
    // createState.error renders inline
  }
}

function confirmCancel(pugId: string): void {
  confirmDialog.confirm({
    title: 'Cancel PUG',
    message: 'Cancel this PUG? Players in the lobby will be sent home and any reserved server released.',
    action: 'Cancel PUG',
    color: 'error',
    handler: async () => {
      await pugsStore.cancelPug(pugId)
      await pugsStore.fetchMine()
    },
  })
}

onMounted(async () => {
  await Promise.allSettled([
    gamesStore.fetchGames(),
    pugsStore.fetchMine(),
    pugsStore.fetchOpen(gameFilter.value ?? undefined),
    pugsStore.fetchRecent(),
  ])
  // Default the create dialog to the game being browsed; fall back to the
  // first active game only when no filter is set. Picking games[0] regardless
  // meant a CS2 player browsing CS2 could silently create an AoE2 PUG.
  if (!form.gameId) {
    form.gameId = gameFilter.value ?? gamesStore.games[0]?.id ?? null
  }
})
</script>
