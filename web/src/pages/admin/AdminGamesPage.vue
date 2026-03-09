<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-6">
      <h1 class="text-h4">Games</h1>
    </div>

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

      <v-data-table
        :headers="headers"
        :items="filteredGames"
        :loading="loading"
        :items-per-page="10"
        class="elevation-0"
      >
        <template v-slot:item.icon_url="{ item }">
          <v-avatar size="32" rounded="sm">
            <v-img v-if="item.icon_url" :src="item.icon_url" />
            <v-icon v-else>mdi-gamepad-variant</v-icon>
          </v-avatar>
        </template>

        <template v-slot:item.status="{ item }">
          <v-chip
            :color="item.status === 'active' ? 'success' : 'grey'"
            size="small"
            variant="flat"
          >
            {{ item.status }}
          </v-chip>
        </template>

        <template v-slot:item.is_featured="{ item }">
          <v-icon v-if="item.is_featured" color="warning">mdi-star</v-icon>
          <v-icon v-else color="grey-lighten-1">mdi-star-outline</v-icon>
        </template>

        <template v-slot:item.actions="{ item }">
          <v-btn
            icon
            size="small"
            variant="text"
            @click="openConfigPanel(item)"
            title="Configure"
          >
            <v-icon>mdi-cog</v-icon>
          </v-btn>
          <v-btn
            icon
            size="small"
            variant="text"
            @click="openEditModal(item)"
            title="Edit"
          >
            <v-icon>mdi-pencil</v-icon>
          </v-btn>
          <v-btn
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
          <v-btn
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
            <p class="text-grey">No games found</p>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <v-alert v-if="error" type="error" class="mt-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <GameEditModal
      v-model="editModalOpen"
      :game="selectedGame"
      @saved="onGameSaved"
    />

    <!-- Delete Map Confirm -->
    <ConfirmDialog
      :open="confirmDialog.open.value"
      :title="confirmDialog.title.value"
      :message="confirmDialog.message.value"
      :action-label="confirmDialog.actionLabel.value"
      :color="confirmDialog.color.value"
      :loading="confirmDialog.loading.value"
      :error="confirmDialog.dialogError.value"
      @clear-error="confirmDialog.dialogError.value = null"
      @confirm="confirmDialog.execute"
      @cancel="confirmDialog.cancel"
    />

    <!-- Game Config Dialog -->
    <v-dialog v-model="configDialogOpen" max-width="700">
      <v-card v-if="configGame">
        <v-card-title class="d-flex justify-space-between align-center">
          <span>Configure: {{ configGame.display_name }}</span>
          <v-btn icon variant="text" @click="configDialogOpen = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>
        <v-tabs v-model="configTab" color="primary">
          <v-tab value="maps">Maps</v-tab>
          <v-tab value="ranks">Rank Tiers</v-tab>
          <v-tab value="teamsize">Team Size</v-tab>
        </v-tabs>
        <v-divider />
        <v-card-text style="min-height: 300px">
          <v-tabs-window v-model="configTab">
            <v-tabs-window-item value="maps">
              <div v-if="loadingConfig" class="text-center pa-8">
                <v-progress-circular indeterminate />
              </div>
              <template v-else>
                <!-- Add/Edit Map Form -->
                <v-card v-if="mapFormVisible" variant="outlined" class="mb-4">
                  <v-card-title class="text-subtitle-1">
                    {{ editingMapId ? 'Edit Map' : 'Add Map' }}
                  </v-card-title>
                  <v-card-text>
                    <v-row dense>
                      <v-col cols="12" sm="6">
                        <v-text-field
                          v-model="mapForm.id"
                          label="Map ID"
                          hint="e.g. de_dust2"
                          variant="outlined"
                          density="compact"
                          :disabled="!!editingMapId"
                          :rules="[v => !!v || 'Required']"
                        />
                      </v-col>
                      <v-col cols="12" sm="6">
                        <v-text-field
                          v-model="mapForm.display_name"
                          label="Display Name"
                          variant="outlined"
                          density="compact"
                          :rules="[v => !!v || 'Required']"
                        />
                      </v-col>
                      <v-col cols="12">
                        <v-combobox
                          v-model="mapForm.game_modes"
                          label="Game Modes"
                          variant="outlined"
                          density="compact"
                          multiple
                          chips
                          closable-chips
                          :items="['competitive', 'casual', 'deathmatch', 'wingman']"
                        />
                      </v-col>
                      <v-col cols="12">
                        <v-text-field
                          v-model="mapForm.image_url"
                          label="Image URL"
                          variant="outlined"
                          density="compact"
                          prepend-inner-icon="mdi-image"
                        />
                      </v-col>
                    </v-row>
                  </v-card-text>
                  <v-card-actions>
                    <v-spacer />
                    <v-btn variant="text" @click="cancelMapForm">Cancel</v-btn>
                    <v-btn
                      color="primary"
                      variant="flat"
                      :loading="savingMap"
                      :disabled="!mapForm.id || !mapForm.display_name"
                      @click="saveMap"
                    >
                      {{ editingMapId ? 'Update' : 'Add' }}
                    </v-btn>
                  </v-card-actions>
                </v-card>

                <div v-if="!mapFormVisible" class="d-flex justify-end mb-2">
                  <v-btn
                    color="primary"
                    variant="tonal"
                    size="small"
                    prepend-icon="mdi-plus"
                    @click="openAddMapForm"
                  >
                    Add Map
                  </v-btn>
                </div>

                <v-row v-if="maps.length > 0" dense>
                  <v-col v-for="map in maps" :key="map.id" cols="6" sm="4" md="3">
                    <GameMapCard
                      :map-id="map.id"
                      :display-name="map.display_name"
                      :image-url="map.image_url"
                    />
                    <div class="d-flex justify-center mt-1">
                      <v-btn
                        icon
                        size="x-small"
                        variant="text"
                        @click="openEditMapForm(map)"
                        title="Edit"
                      >
                        <v-icon size="small">mdi-pencil</v-icon>
                      </v-btn>
                      <v-btn
                        icon
                        size="x-small"
                        variant="text"
                        color="error"
                        :loading="deletingMapId === map.id"
                        @click="confirmDeleteMap(map)"
                        title="Delete"
                      >
                        <v-icon size="small">mdi-delete</v-icon>
                      </v-btn>
                    </div>
                  </v-col>
                </v-row>
                <p v-else-if="!mapFormVisible" class="text-center text-medium-emphasis pa-8">
                  No maps configured. Click "Add Map" to get started.
                </p>

                <!-- Map Pool Section -->
                <template v-if="maps.length > 0">
                  <v-divider class="my-4" />
                  <MapPoolPicker
                    v-model="poolMapIds"
                    :maps="maps"
                    label="Active Map Pool"
                  >
                    <template #actions>
                      <v-btn
                        color="primary"
                        variant="tonal"
                        size="small"
                        prepend-icon="mdi-content-save"
                        :loading="savingPool"
                        :disabled="!poolDirty"
                        @click="savePool"
                      >
                        Save Pool
                      </v-btn>
                    </template>
                  </MapPoolPicker>
                </template>
              </template>
            </v-tabs-window-item>

            <v-tabs-window-item value="ranks">
              <div v-if="loadingConfig" class="text-center pa-8">
                <v-progress-circular indeterminate />
              </div>
              <template v-else>
                <v-list v-if="rankTiers.length > 0" density="compact">
                  <v-list-item v-for="tier in rankTiers" :key="tier.id">
                    <template v-slot:prepend>
                      <v-chip :color="tier.color || 'grey'" size="small" variant="flat" class="mr-2">
                        {{ tier.order }}
                      </v-chip>
                    </template>
                    <v-list-item-title>{{ tier.name }}</v-list-item-title>
                    <v-list-item-subtitle>
                      Rating: {{ tier.min_rating }} - {{ tier.max_rating }}
                    </v-list-item-subtitle>
                  </v-list-item>
                </v-list>
                <p v-else class="text-center text-medium-emphasis pa-8">
                  No rank tiers configured.
                </p>
              </template>
            </v-tabs-window-item>

            <v-tabs-window-item value="teamsize">
              <div class="pa-4">
                <v-row>
                  <v-col cols="4">
                    <v-text-field
                      :model-value="configGame.team_size_default"
                      label="Default"
                      type="number"
                      variant="outlined"
                      density="compact"
                      readonly
                    />
                  </v-col>
                </v-row>
                <p class="text-caption text-medium-emphasis">
                  Team size is managed via the game plugin configuration.
                </p>
              </div>
            </v-tabs-window-item>
          </v-tabs-window>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useGamesStore, type GameSummary, type MapInfo } from '@/stores/games'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import GameEditModal from '@/components/admin/GameEditModal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import GameMapCard from '@/components/GameMapCard.vue'
import MapPoolPicker from '@/components/MapPoolPicker.vue'

const gamesStore = useGamesStore()
const snackbar = useSnackbar()
const confirmDialog = useConfirmDialog()

const search = ref('')
const toggleLoading = ref<string | null>(null)
const editModalOpen = ref(false)
const selectedGame = ref<GameSummary | null>(null)

// Config dialog state
const configDialogOpen = ref(false)
const configGame = ref<GameSummary | null>(null)
const configTab = ref('maps')
const loadingConfig = ref(false)
const maps = ref<MapInfo[]>([])
const rankTiers = ref<Array<{ id: string; name: string; min_rating: number; max_rating: number; color?: string; order: number }>>([])

// Map pool state
const poolMapIds = ref<string[]>([])
const poolOriginalIds = ref<string[]>([])
const savingPool = ref(false)
const poolDirty = computed(() =>
  JSON.stringify([...poolMapIds.value].sort()) !== JSON.stringify([...poolOriginalIds.value].sort())
)

// Map CRUD state
const mapFormVisible = ref(false)
const editingMapId = ref<string | null>(null)
const savingMap = ref(false)
const deletingMapId = ref<string | null>(null)
const mapForm = ref({
  id: '',
  display_name: '',
  game_modes: ['competitive'] as string[],
  image_url: '',
})

const loading = computed(() => gamesStore.loading)
const error = computed({
  get: () => gamesStore.error,
  set: (val: string | null) => { gamesStore.error = val },
})

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

async function openConfigPanel(game: GameSummary) {
  configGame.value = game
  configTab.value = 'maps'
  configDialogOpen.value = true
  loadingConfig.value = true
  cancelMapForm()
  try {
    const [mapsResult, tiersResult, gameDetail] = await Promise.all([
      gamesStore.fetchMaps(game.id).catch(() => []),
      gamesStore.fetchRankTiers(game.id).catch(() => []),
      gamesStore.fetchGame(game.id).catch(() => null),
    ])
    maps.value = (mapsResult as MapInfo[]) || []
    rankTiers.value = (tiersResult as any[]) || []
    // Initialize pool from game detail
    const pool = (gameDetail as any)?.map_pool || []
    poolMapIds.value = [...pool]
    poolOriginalIds.value = [...pool]
  } finally {
    loadingConfig.value = false
  }
}

// Map CRUD
function openAddMapForm() {
  editingMapId.value = null
  mapForm.value = { id: '', display_name: '', game_modes: ['competitive'], image_url: '' }
  mapFormVisible.value = true
}

function openEditMapForm(map: MapInfo) {
  editingMapId.value = map.id
  mapForm.value = {
    id: map.id,
    display_name: map.display_name,
    game_modes: [...map.game_modes],
    image_url: map.image_url || '',
  }
  mapFormVisible.value = true
}

function cancelMapForm() {
  mapFormVisible.value = false
  editingMapId.value = null
}

async function saveMap() {
  if (!configGame.value) return
  savingMap.value = true
  try {
    if (editingMapId.value) {
      await gamesStore.updateCatalogMap(configGame.value.id, editingMapId.value, {
        display_name: mapForm.value.display_name,
        game_modes: mapForm.value.game_modes,
        image_url: mapForm.value.image_url || null,
      })
      snackbar.show('Map updated', 'success')
    } else {
      await gamesStore.catalogMap(configGame.value.id, {
        id: mapForm.value.id,
        display_name: mapForm.value.display_name,
        game_modes: mapForm.value.game_modes,
        image_url: mapForm.value.image_url || null,
      })
      snackbar.show('Map added', 'success')
    }
    cancelMapForm()
    // Refresh maps list
    const result = await gamesStore.fetchMaps(configGame.value.id).catch(() => [])
    maps.value = (result as MapInfo[]) || []
  } catch {
    snackbar.show(gamesStore.catalogMapState.error || gamesStore.updateCatalogMapState.error || 'Failed to save map', 'error')
  } finally {
    savingMap.value = false
  }
}

function confirmDeleteMap(map: MapInfo) {
  confirmDialog.confirm({
    title: 'Delete Map',
    message: `Are you sure you want to remove ${map.display_name} (${map.id}) from the catalog?`,
    action: 'Delete',
    color: 'error',
    handler: async () => {
      if (!configGame.value) return
      deletingMapId.value = map.id
      try {
        await gamesStore.deleteCatalogMap(configGame.value.id, map.id)
        maps.value = maps.value.filter(m => m.id !== map.id)
        snackbar.show('Map deleted', 'success')
      } catch {
        snackbar.show(gamesStore.deleteCatalogMapState.error || 'Failed to delete map', 'error')
      } finally {
        deletingMapId.value = null
      }
    },
  })
}

async function savePool() {
  if (!configGame.value || poolMapIds.value.length === 0) return
  savingPool.value = true
  try {
    await gamesStore.setMapPool(configGame.value.id, poolMapIds.value)
    poolOriginalIds.value = [...poolMapIds.value]
    snackbar.show('Map pool saved', 'success')
  } catch {
    snackbar.show(gamesStore.setMapPoolState.error || 'Failed to save map pool', 'error')
  } finally {
    savingPool.value = false
  }
}

function onGameSaved() {
  snackbar.show('Game updated', 'success')
  fetchGames()
}

onMounted(() => {
  fetchGames()
})
</script>

