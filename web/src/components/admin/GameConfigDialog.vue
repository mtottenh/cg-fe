<template>
  <v-dialog v-model="open" max-width="700" persistent>
    <v-card v-if="game">
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Configure: {{ game.display_name }}</span>
        <v-btn aria-label="Close" icon variant="text" @click="open = false">
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
                    <v-btn aria-label="Edit map"
                      icon
                      size="x-small"
                      variant="text"
                      @click="openEditMapForm(map)"
                      title="Edit"
                    >
                      <v-icon size="small">mdi-pencil</v-icon>
                    </v-btn>
                    <v-btn aria-label="Delete map"
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
                No maps in this game's catalog. Click "Add Map" to get started.
              </p>

              <!-- Map Pool Section -->
              <template v-if="maps.length > 0">
                <v-divider class="my-4" />
                <MapPoolPicker
                  v-model="poolMapIds"
                  :maps="maps"
                  label="Default Competitive Pool"
                  hint="Pre-selected when a tournament is created. Organisers pick their tournament pool from the maps above."
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
                    :model-value="game.team_size_default"
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

  <!-- Delete Map Confirm -->
  <ConfirmDialogHost :dialog="confirmDialog" />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useGamesStore, type GameSummary, type MapInfo } from '@/stores/games'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import GameMapCard from '@/components/GameMapCard.vue'
import MapPoolPicker from '@/components/MapPoolPicker.vue'

const props = defineProps<{
  game: GameSummary | null
}>()

const open = defineModel<boolean>({ required: true })

const gamesStore = useGamesStore()
const snackbar = useSnackbar()
const confirmDialog = useConfirmDialog()

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

// Reload config whenever the dialog opens for a game
watch(open, (isOpen) => {
  if (isOpen && props.game) {
    loadConfig(props.game)
  }
})

async function loadConfig(game: GameSummary) {
  configTab.value = 'maps'
  loadingConfig.value = true
  cancelMapForm()
  try {
    const [mapsResult, tiersResult, gameDetail] = await Promise.all([
      gamesStore.fetchMaps(game.id).catch(() => []),
      gamesStore.fetchRankTiers(game.id).catch(() => []),
      gamesStore.fetchGame(game.id).catch(() => null),
    ])
    maps.value = (mapsResult as MapInfo[]) || []
    // Explicit mapping from the API shape (display_name) to the UI's local
    // shape (name) — the generated type is authoritative, no casts.
    rankTiers.value = (tiersResult ?? []).map((tier) => ({
      id: tier.id,
      name: tier.display_name,
      min_rating: tier.min_rating ?? 0,
      max_rating: tier.max_rating ?? 0,
      color: tier.color ?? undefined,
      order: tier.order,
    }))
    // Initialize pool from game detail
    const pool = gameDetail?.map_pool ?? []
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
  if (!props.game) return
  savingMap.value = true
  try {
    if (editingMapId.value) {
      await gamesStore.updateCatalogMap(props.game.id, editingMapId.value, {
        display_name: mapForm.value.display_name,
        game_modes: mapForm.value.game_modes,
        image_url: mapForm.value.image_url || null,
      })
      snackbar.show('Map updated', 'success')
    } else {
      await gamesStore.catalogMap(props.game.id, {
        id: mapForm.value.id,
        display_name: mapForm.value.display_name,
        game_modes: mapForm.value.game_modes,
        image_url: mapForm.value.image_url || null,
      })
      snackbar.show('Map added', 'success')
    }
    cancelMapForm()
    // Refresh maps list
    const result = await gamesStore.fetchMaps(props.game.id).catch(() => [])
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
      if (!props.game) return
      deletingMapId.value = map.id
      try {
        await gamesStore.deleteCatalogMap(props.game.id, map.id)
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
  if (!props.game || poolMapIds.value.length === 0) return
  savingPool.value = true
  try {
    await gamesStore.setMapPool(props.game.id, poolMapIds.value)
    poolOriginalIds.value = [...poolMapIds.value]
    snackbar.show('Map pool saved', 'success')
  } catch {
    snackbar.show(gamesStore.setMapPoolState.error || 'Failed to save map pool', 'error')
  } finally {
    savingPool.value = false
  }
}
</script>
