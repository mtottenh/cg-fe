<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-6">
      <h1 class="text-h4">Games</h1>
    </div>

    <ErrorAlert :error="error" retryable @clear="error = null" @retry="fetchGames" />

    <v-card>
      <v-card-title class="d-flex align-center">
        <v-text-field
          v-model="search"
          prepend-inner-icon="mdi-magnify"
          label="Search games..."
          single-line
          hide-details
          density="compact"
          variant="outlined"
          class="mr-4"
          style="max-width: 300px"
        />
        <v-spacer />
        <v-btn
          color="primary"
          variant="tonal"
          prepend-icon="mdi-refresh"
          :loading="loading"
          @click="fetchGames"
        >
          Refresh
        </v-btn>
      </v-card-title>

      <div class="table-scroll">
        <v-data-table
          :headers="headers"
          :items="filteredGames"
          :loading="loading"
          :items-per-page="10"
          class="elevation-0"
        >
          <template v-slot:item.icon_url="{ item }">
            <v-avatar size="32" rounded="sm">
              <v-img alt="" v-if="item.icon_url" :src="item.icon_url" />
              <v-icon v-else>mdi-gamepad-variant</v-icon>
            </v-avatar>
          </template>

          <template v-slot:item.status="{ item }">
            <v-chip
              :color="item.status === 'active' ? 'success' : 'grey'"
              size="small"
              variant="flat"
            >
              {{ getStatusLabel(gameStatusMap, item.status) }}
            </v-chip>
          </template>

          <template v-slot:item.is_featured="{ item }">
            <v-icon v-if="item.is_featured" color="warning">mdi-star</v-icon>
            <v-icon v-else color="grey-lighten-1">mdi-star-outline</v-icon>
          </template>

          <!-- P-89: these four aria-labels were each rotated one position off the
               handler they fire — the control announced as "Enable game" called
               handleDisableGame, so a screen-reader user activating "Enable"
               DISABLED the game. Identical defect to P-45 (RBAC role rows, fixed
               fbe1500), which was point-fixed and never swept, so it came back
               here. Each aria-label now names what its @click does. -->
          <template v-slot:item.actions="{ item }">
            <v-btn aria-label="Configure game"
              icon
              size="small"
              variant="text"
              @click="openConfigPanel(item)"
              title="Configure"
            >
              <v-icon>mdi-cog</v-icon>
            </v-btn>
            <v-btn aria-label="Edit game"
              icon
              size="small"
              variant="text"
              @click="openEditModal(item)"
              title="Edit"
            >
              <v-icon>mdi-pencil</v-icon>
            </v-btn>
            <v-btn aria-label="Disable game"
              v-if="item.status === 'active'"
              icon
              size="small"
              variant="text"
              color="error"
              :loading="toggleLoading === item.id"
              @click="handleDisableGame(item)"
              title="Disable"
            >
              <v-icon>mdi-eye-off</v-icon>
            </v-btn>
            <v-btn aria-label="Enable game"
              v-else
              icon
              size="small"
              variant="text"
              color="success"
              :loading="toggleLoading === item.id"
              @click="handleEnableGame(item)"
              title="Enable"
            >
              <v-icon>mdi-eye</v-icon>
            </v-btn>
          </template>

          <template v-slot:no-data>
            <div class="text-center pa-4">
              <v-icon size="64" color="grey-lighten-1" class="mb-2">mdi-gamepad-variant-outline</v-icon>
              <p class="text-medium-emphasis">No games found</p>
            </div>
          </template>
        </v-data-table>
      </div>
    </v-card>

    <GameEditModal
      v-model="editModalOpen"
      :game="selectedGame"
      @saved="onGameSaved"
    />

    <!-- Game Config Dialog (maps CRUD, map pool, rank tiers, team size) -->
    <GameConfigDialog
      v-model="configDialogOpen"
      :game="configGame"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useGamesStore, type GameSummary } from '@/stores/games'
import { useSnackbar } from '@/composables/useSnackbar'
import GameEditModal from '@/components/admin/GameEditModal.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import GameConfigDialog from '@/components/admin/GameConfigDialog.vue'
import { gameStatusMap, getStatusLabel } from '@/utils/statusMaps'

const gamesStore = useGamesStore()
const snackbar = useSnackbar()

const search = ref('')
const toggleLoading = ref<string | null>(null)
const editModalOpen = ref(false)
const selectedGame = ref<GameSummary | null>(null)

// Config dialog state (all config UI lives in GameConfigDialog)
const configDialogOpen = ref(false)
const configGame = ref<GameSummary | null>(null)

// `loading` aggregates every games-action state; `error` is a WritableComputedRef
// (see `aggregateActionStates`) that storeToRefs exposes with get/set intact.
const { loading, error } = storeToRefs(gamesStore)

const headers = [
  { title: '', key: 'icon_url', width: '50px', sortable: false },
  { title: 'ID', key: 'id', width: '100px' },
  { title: 'Name', key: 'display_name' },
  { title: 'Short Name', key: 'short_name', width: '120px' },
  { title: 'Team Size', key: 'team_size_default', width: '100px', align: 'center' as const },
  { title: 'Status', key: 'status', width: '100px' },
  { title: 'Featured', key: 'is_featured', width: '90px', align: 'center' as const },
  { title: 'Actions', key: 'actions', width: '150px', sortable: false, align: 'center' as const },
]

const filteredGames = computed(() => {
  if (!search.value) return gamesStore.games
  const q = search.value.toLowerCase()
  return gamesStore.games.filter(g =>
    g.id.toLowerCase().includes(q) ||
    g.display_name.toLowerCase().includes(q) ||
    (g.short_name?.toLowerCase().includes(q))
  )
})

async function fetchGames() {
  try {
    await gamesStore.fetchGames()
  } catch {
    // Error captured in store
  }
}

async function handleEnableGame(game: GameSummary) {
  toggleLoading.value = game.id
  try {
    await gamesStore.enableGame(game.id)
    snackbar.show('Game enabled', 'success')
  } catch {
    snackbar.show(gamesStore.enableGameState.error || 'Failed to enable game', 'error')
  } finally {
    toggleLoading.value = null
  }
}

async function handleDisableGame(game: GameSummary) {
  toggleLoading.value = game.id
  try {
    await gamesStore.disableGame(game.id)
    snackbar.show('Game disabled', 'success')
  } catch {
    snackbar.show(gamesStore.disableGameState.error || 'Failed to disable game', 'error')
  } finally {
    toggleLoading.value = null
  }
}

function openEditModal(game: GameSummary) {
  selectedGame.value = game
  editModalOpen.value = true
}

function openConfigPanel(game: GameSummary) {
  configGame.value = game
  configDialogOpen.value = true
}

function onGameSaved() {
  snackbar.show('Game updated', 'success')
  fetchGames()
}

onMounted(() => {
  fetchGames()
})
</script>

<style scoped>
/* Wide tables scroll within themselves; the page never scrolls sideways. */
.table-scroll {
  overflow-x: auto;
}
</style>
