<template>
  <v-dialog v-model="open" max-width="900" persistent>
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
                    <!-- Workshop import: paste a URL/id, fetch prefills the form -->
                    <v-col cols="12">
                      <div class="d-flex ga-2 align-start">
                        <v-text-field
                          v-model="workshopInput"
                          label="Steam Workshop URL or ID"
                          hint="Paste a steamcommunity.com workshop link to prefill this form"
                          persistent-hint
                          variant="outlined"
                          density="compact"
                          prepend-inner-icon="mdi-steam"
                          :error-messages="gamesStore.fetchWorkshopDetailsState.error || undefined"
                          @keydown.enter.prevent="fetchWorkshop"
                        />
                        <v-btn
                          color="primary"
                          variant="tonal"
                          class="mt-1"
                          :loading="gamesStore.fetchWorkshopDetailsState.loading"
                          :disabled="!workshopInput.trim()"
                          @click="fetchWorkshop"
                        >
                          Fetch
                        </v-btn>
                      </div>
                      <v-alert
                        v-for="warning in workshopWarnings"
                        :key="warning"
                        type="warning"
                        density="compact"
                        variant="tonal"
                        class="mt-2"
                      >
                        {{ warning }}
                      </v-alert>
                      <div v-if="mapForm.external_id" class="d-flex ga-2 align-center mt-2">
                        <v-chip
                          size="small"
                          color="primary"
                          variant="tonal"
                          prepend-icon="mdi-steam"
                          :href="mapForm.external_url || undefined"
                          target="_blank"
                        >
                          Workshop {{ mapForm.external_id }}
                        </v-chip>
                        <v-btn size="x-small" variant="text" @click="unlinkWorkshop">
                          Unlink
                        </v-btn>
                      </div>
                    </v-col>
                    <v-col cols="12" sm="6">
                      <v-text-field
                        v-model="mapForm.id"
                        label="Map ID"
                        hint="Portal identifier used in map pools and veto — e.g. de_dust2"
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
                      <v-text-field
                        v-model="mapForm.engine_name"
                        label="Engine Map Name"
                        hint="What the game server and demos call this map. Leave blank when it equals the Map ID; for workshop maps it comes from inside the map's files."
                        persistent-hint
                        variant="outlined"
                        density="compact"
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
                  <div v-if="map.external_id" class="d-flex justify-center mt-1">
                    <v-chip
                      size="x-small"
                      color="primary"
                      variant="tonal"
                      prepend-icon="mdi-steam"
                      :href="map.external_url || undefined"
                      target="_blank"
                    >
                      Workshop
                    </v-chip>
                  </div>
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

          <!-- P-92: this tab was a read-only `v-list`. `games.setRankTiers` had
               existed, and worked, with zero component consumers — so a game's
               rank tiers (which gate league entry and drive seeding) could only
               be changed with SQL. It is an editor now. -->
          <v-tabs-window-item value="ranks">
            <div v-if="loadingConfig" class="text-center pa-8">
              <v-progress-circular indeterminate />
            </div>
            <template v-else>
              <v-card
                v-for="(tier, index) in tierDrafts"
                :key="index"
                variant="outlined"
                class="mb-3"
                :data-testid="`rank-tier-row-${index}`"
              >
                <v-card-text class="pb-1">
                  <v-row dense>
                    <v-col cols="12" sm="5">
                      <v-text-field
                        v-model="tier.id"
                        label="Tier ID"
                        hint="e.g. gold"
                        variant="outlined"
                        density="compact"
                      />
                    </v-col>
                    <v-col cols="12" sm="6">
                      <v-text-field
                        v-model="tier.display_name"
                        label="Tier Name"
                        variant="outlined"
                        density="compact"
                      />
                    </v-col>
                    <v-col cols="12" sm="1" class="d-flex justify-end">
                      <v-btn
                        :aria-label="`Remove tier ${tier.display_name || tier.id || index + 1}`"
                        icon
                        size="small"
                        variant="text"
                        color="error"
                        title="Remove tier"
                        @click="removeTier(index)"
                      >
                        <v-icon size="small">mdi-delete</v-icon>
                      </v-btn>
                    </v-col>
                    <v-col cols="6" sm="3">
                      <v-text-field
                        v-model.number="tier.min_rating"
                        label="Min Rating"
                        type="number"
                        variant="outlined"
                        density="compact"
                      />
                    </v-col>
                    <v-col cols="6" sm="3">
                      <v-text-field
                        v-model="tier.max_rating"
                        label="Max Rating"
                        type="number"
                        hint="Blank = no upper limit"
                        persistent-hint
                        variant="outlined"
                        density="compact"
                      />
                    </v-col>
                    <v-col cols="6" sm="3">
                      <v-text-field
                        v-model.number="tier.order"
                        label="Order"
                        type="number"
                        variant="outlined"
                        density="compact"
                      />
                    </v-col>
                    <v-col cols="6" sm="3">
                      <v-text-field
                        v-model="tier.color"
                        label="Colour"
                        hint="Hex, e.g. #FFD700"
                        variant="outlined"
                        density="compact"
                      />
                    </v-col>
                  </v-row>
                </v-card-text>
              </v-card>

              <!-- P-120: an empty list is saveable — it clears the custom
                   tiers and the game reverts to its plugin defaults. Say so,
                   because "Save" with nothing listed is otherwise alarming. -->
              <p v-if="tierDrafts.length === 0" class="text-center text-medium-emphasis pa-8">
                No custom rank tiers. Click "Add Tier" to define one — or save
                with none to use the game's built-in defaults.
              </p>

              <div class="d-flex align-center ga-2">
                <v-btn
                  color="primary"
                  variant="tonal"
                  size="small"
                  prepend-icon="mdi-plus"
                  @click="addTier"
                >
                  Add Tier
                </v-btn>
                <v-spacer />
                <v-btn variant="text" size="small" :disabled="!tiersDirty" @click="resetTiers">
                  Discard
                </v-btn>
                <v-btn
                  color="primary"
                  variant="flat"
                  size="small"
                  prepend-icon="mdi-content-save"
                  :loading="savingTiers"
                  :disabled="!tiersDirty || !tiersValid"
                  @click="saveTiers"
                >
                  Save Rank Tiers
                </v-btn>
              </div>
              <p v-if="tiersDirty && !tiersValid" class="text-caption text-error mt-2">
                Every tier needs an ID, a name and whole-number Min Rating and Order.
              </p>
            </template>
          </v-tabs-window-item>

          <!-- P-92: this tab was a `readonly` field captioned "Team size is
               managed via the game plugin configuration" — pointing at a
               plugin-config surface that does not exist anywhere in the app,
               while `PATCH /v1/games/{id}/team-size` sat live and unused. -->
          <v-tabs-window-item value="teamsize">
            <div v-if="loadingConfig" class="text-center pa-8">
              <v-progress-circular indeterminate />
            </div>
            <div v-else class="pa-4">
              <v-row>
                <v-col cols="4">
                  <v-text-field
                    v-model.number="teamSize.min"
                    label="Minimum"
                    type="number"
                    variant="outlined"
                    density="compact"
                  />
                </v-col>
                <v-col cols="4">
                  <v-text-field
                    v-model.number="teamSize.default"
                    label="Default"
                    type="number"
                    variant="outlined"
                    density="compact"
                  />
                </v-col>
                <v-col cols="4">
                  <v-text-field
                    v-model.number="teamSize.max"
                    label="Maximum"
                    type="number"
                    variant="outlined"
                    density="compact"
                  />
                </v-col>
              </v-row>
              <p class="text-caption text-medium-emphasis">
                Minimum ≤ Default ≤ Maximum, each between 1 and 100. The default is the
                roster size a new team for this game is created with.
              </p>
              <p v-if="teamSizeDirty && !teamSizeValid" class="text-caption text-error">
                {{ teamSizeError }}
              </p>
              <div class="d-flex justify-end ga-2 mt-2">
                <v-btn variant="text" size="small" :disabled="!teamSizeDirty" @click="resetTeamSize">
                  Discard
                </v-btn>
                <v-btn
                  color="primary"
                  variant="flat"
                  size="small"
                  prepend-icon="mdi-content-save"
                  :loading="savingTeamSize"
                  :disabled="!teamSizeDirty || !teamSizeValid"
                  @click="saveTeamSize"
                >
                  Save Team Size
                </v-btn>
              </div>
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
import { ref, computed, toRaw, watch } from 'vue'
import {
  useGamesStore,
  type GameSummary,
  type MapInfo,
  type WorkshopMapDetails,
} from '@/stores/games'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import GameMapCard from '@/components/GameMapCard.vue'
import MapPoolPicker from '@/components/MapPoolPicker.vue'

const props = defineProps<{
  game: GameSummary | null
}>()

/**
 * Emitted after a write that changes something the games table renders (team
 * size), so the page can refetch instead of showing a stale row.
 */
const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>({ required: true })

const gamesStore = useGamesStore()
const snackbar = useSnackbar()
const confirmDialog = useConfirmDialog()

const configTab = ref('maps')
const loadingConfig = ref(false)
const maps = ref<MapInfo[]>([])

/**
 * One editable rank-tier row.
 *
 * The numeric fields are `number | string` rather than `number` because that is
 * what `v-model.number` actually produces: Vue leaves a value it cannot parse
 * as the raw string, so a cleared field is `''`. Typing them as `number` would
 * be a lie the compiler could not catch and would send `""` to an `i32`.
 * `max_rating` is genuinely optional — blank means "no upper limit" (`null`).
 */
interface TierDraft {
  id: string
  display_name: string
  min_rating: number | string
  max_rating: number | string
  color: string
  icon_url: string
  order: number | string
}

const tierDrafts = ref<TierDraft[]>([])
const tierOriginals = ref<TierDraft[]>([])
const savingTiers = ref(false)

const tiersDirty = computed(
  () => JSON.stringify(tierDrafts.value) !== JSON.stringify(tierOriginals.value),
)

function isWholeNumber(v: number | string): boolean {
  return v !== '' && Number.isInteger(Number(v))
}

const tiersValid = computed(
  () =>
    // P-120: an EMPTY list is now valid — it clears the stored override and
    // the game falls back to its plugin's default tiers (`SetRankTiersRequest`
    // accepts 0-20; with the old `min = 1` a custom tier set could be
    // installed but never removed again).
    tierDrafts.value.length <= 20 &&
    tierDrafts.value.every(
      (t) =>
        t.id.trim() !== '' &&
        t.display_name.trim() !== '' &&
        isWholeNumber(t.min_rating) &&
        isWholeNumber(t.order) &&
        (t.max_rating === '' || isWholeNumber(t.max_rating)),
    ),
)

// Team size state
const teamSize = ref({ min: 1 as number | string, default: 1 as number | string, max: 1 as number | string })
const teamSizeOriginal = ref({ min: 1 as number | string, default: 1 as number | string, max: 1 as number | string })
const savingTeamSize = ref(false)

const teamSizeDirty = computed(
  () => JSON.stringify(teamSize.value) !== JSON.stringify(teamSizeOriginal.value),
)

/**
 * Mirrors the server's own checks (`update_team_size`, `UpdateTeamSizeRequest`)
 * so the operator gets the reason before the round trip rather than a snackbar
 * after it. The server stays the authority — a save that slips through still
 * surfaces its 400.
 */
const teamSizeError = computed(() => {
  const { min, default: def, max } = teamSize.value
  if (![min, def, max].every(isWholeNumber)) return 'Every team size must be a whole number.'
  const [n, d, x] = [Number(min), Number(def), Number(max)]
  if ([n, d, x].some((v) => v < 1 || v > 100)) return 'Team sizes must be between 1 and 100.'
  if (n > d) return `Minimum (${n}) must be at most the default (${d}).`
  if (d > x) return `Default (${d}) must be at most the maximum (${x}).`
  return ''
})
const teamSizeValid = computed(() => teamSizeError.value === '')

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
  engine_name: '',
  external_id: '',
  external_url: '',
})

// Workshop import state
const workshopInput = ref('')
const workshopDetails = ref<WorkshopMapDetails | null>(null)

/**
 * Sanity signals from the Steam lookup. These warn rather than block — the
 * server is the authority and a determined admin may know better (e.g. an
 * unlisted map that IS downloadable).
 */
const workshopWarnings = computed<string[]>(() => {
  const details = workshopDetails.value
  if (!details) return []
  const warnings: string[] = []
  if (details.banned) {
    warnings.push('Steam has banned this workshop item.')
  }
  if (
    details.consumer_app_id != null &&
    props.game?.slug === 'cs2' &&
    details.consumer_app_id !== 730
  ) {
    warnings.push(`This item belongs to Steam app ${details.consumer_app_id}, not CS2 (730).`)
  }
  // 0 = public, 3 = unlisted — both downloadable by servers.
  if (details.visibility != null && details.visibility !== 0 && details.visibility !== 3) {
    warnings.push('This item is not public — game servers will likely fail to download it.')
  }
  return warnings
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
    // Explicit mapping from the API shape to the editable draft shape — the
    // generated type is authoritative, no casts. `max_rating: null` ("no upper
    // limit") becomes '' so the field renders blank rather than as a literal 0,
    // which would be a different tier definition.
    const drafts: TierDraft[] = (tiersResult ?? []).map((tier) => ({
      id: tier.id,
      display_name: tier.display_name,
      min_rating: tier.min_rating,
      max_rating: tier.max_rating ?? '',
      color: tier.color ?? '',
      icon_url: tier.icon_url ?? '',
      order: tier.order,
    }))
    tierDrafts.value = drafts
    tierOriginals.value = structuredClone(drafts)
    // Initialize pool from game detail
    const pool = gameDetail?.map_pool ?? []
    poolMapIds.value = [...pool]
    poolOriginalIds.value = [...pool]
    // Team size comes from the detail response; the summary row only has the
    // default, and the min/max are what the editor needs to keep consistent.
    const size = {
      min: gameDetail?.team_size.min ?? game.team_size_default,
      default: gameDetail?.team_size.default ?? game.team_size_default,
      max: gameDetail?.team_size.max ?? game.team_size_default,
    }
    teamSize.value = { ...size }
    teamSizeOriginal.value = { ...size }
  } finally {
    loadingConfig.value = false
  }
}

// ==================== Rank tiers ====================

function addTier() {
  const highestMax = tierDrafts.value.reduce((acc, t) => {
    const max = t.max_rating === '' ? Number(t.min_rating) : Number(t.max_rating)
    return Number.isFinite(max) && max > acc ? max : acc
  }, -1)
  tierDrafts.value.push({
    id: '',
    display_name: '',
    // Tiers must not overlap (`set_rank_tiers` rejects `min_rating <= previous
    // max_rating`), so a new row starts just above the highest one so far.
    min_rating: highestMax + 1,
    max_rating: '',
    color: '',
    icon_url: '',
    order: tierDrafts.value.length + 1,
  })
}

function removeTier(index: number) {
  tierDrafts.value.splice(index, 1)
}

function resetTiers() {
  tierDrafts.value = structuredClone(toRaw(tierOriginals.value))
}

async function saveTiers() {
  if (!props.game || !tiersValid.value) return
  savingTiers.value = true
  try {
    const saved = await gamesStore.setRankTiers(
      props.game.id,
      tierDrafts.value.map((t) => ({
        id: t.id.trim(),
        display_name: t.display_name.trim(),
        min_rating: Number(t.min_rating),
        max_rating: t.max_rating === '' ? null : Number(t.max_rating),
        color: t.color.trim() || null,
        icon_url: t.icon_url.trim() || null,
        order: Number(t.order),
      })),
    )
    // Re-seed from the server's answer rather than from the draft: the response
    // is what was actually stored.
    const drafts: TierDraft[] = saved.map((tier) => ({
      id: tier.id,
      display_name: tier.display_name,
      min_rating: tier.min_rating,
      max_rating: tier.max_rating ?? '',
      color: tier.color ?? '',
      icon_url: tier.icon_url ?? '',
      order: tier.order,
    }))
    tierDrafts.value = drafts
    tierOriginals.value = structuredClone(drafts)
    snackbar.show('Rank tiers saved', 'success')
  } catch {
    snackbar.show(gamesStore.setRankTiersState.error || 'Failed to save rank tiers', 'error')
  } finally {
    savingTiers.value = false
  }
}

// ==================== Team size ====================

function resetTeamSize() {
  teamSize.value = { ...teamSizeOriginal.value }
}

async function saveTeamSize() {
  if (!props.game || !teamSizeValid.value) return
  savingTeamSize.value = true
  try {
    const saved = await gamesStore.updateTeamSize(props.game.id, {
      min: Number(teamSize.value.min),
      default: Number(teamSize.value.default),
      max: Number(teamSize.value.max),
    })
    const size = { min: saved.min, default: saved.default, max: saved.max }
    teamSize.value = { ...size }
    teamSizeOriginal.value = { ...size }
    snackbar.show('Team size saved', 'success')
    // The games table renders `team_size_default`, so it is now stale.
    emit('saved')
  } catch {
    snackbar.show(gamesStore.updateTeamSizeState.error || 'Failed to save team size', 'error')
  } finally {
    savingTeamSize.value = false
  }
}

// Map CRUD
function openAddMapForm() {
  editingMapId.value = null
  mapForm.value = {
    id: '',
    display_name: '',
    game_modes: ['competitive'],
    image_url: '',
    engine_name: '',
    external_id: '',
    external_url: '',
  }
  workshopInput.value = ''
  workshopDetails.value = null
  mapFormVisible.value = true
}

function openEditMapForm(map: MapInfo) {
  editingMapId.value = map.id
  mapForm.value = {
    id: map.id,
    display_name: map.display_name,
    game_modes: [...map.game_modes],
    image_url: map.image_url || '',
    engine_name: map.engine_name || '',
    external_id: map.external_id || '',
    external_url: map.external_url || '',
  }
  workshopInput.value = ''
  workshopDetails.value = null
  mapFormVisible.value = true
}

function cancelMapForm() {
  mapFormVisible.value = false
  editingMapId.value = null
}

/** Pull the numeric item id out of a pasted workshop URL (or bare digits). */
function extractWorkshopId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d+$/.test(trimmed)) return trimmed
  return trimmed.match(/[?&]id=(\d+)/)?.[1] ?? null
}

/** Turn workshop metadata into a portal map id suggestion. */
function suggestPortalId(details: WorkshopMapDetails): string {
  const base = details.engine_name_hint || details.title || `workshop_${details.workshop_id}`
  return base
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
}

async function fetchWorkshop() {
  if (!props.game) return
  const workshopId = extractWorkshopId(workshopInput.value)
  if (!workshopId) {
    snackbar.show('Enter a Steam Workshop URL or numeric item id', 'error')
    return
  }
  try {
    const details = await gamesStore.fetchWorkshopMapDetails(props.game.id, workshopId)
    workshopDetails.value = details
    // Prefill, never clobber what the admin already typed.
    const form = mapForm.value
    form.external_id = details.workshop_id
    form.external_url = details.workshop_url
    if (details.engine_name_hint && !form.engine_name) form.engine_name = details.engine_name_hint
    if (details.title && !form.display_name) form.display_name = details.title
    if (details.preview_url && !form.image_url) form.image_url = details.preview_url
    if (!editingMapId.value && !form.id) form.id = suggestPortalId(details)
  } catch {
    // The lookup error renders inline under the workshop field.
  }
}

function unlinkWorkshop() {
  mapForm.value.external_id = ''
  mapForm.value.external_url = ''
  workshopDetails.value = null
}

async function saveMap() {
  if (!props.game) return
  savingMap.value = true
  try {
    if (editingMapId.value) {
      // Empty strings clear engine_name/external_* server-side.
      await gamesStore.updateCatalogMap(props.game.id, editingMapId.value, {
        display_name: mapForm.value.display_name,
        game_modes: mapForm.value.game_modes,
        image_url: mapForm.value.image_url || null,
        engine_name: mapForm.value.engine_name,
        external_id: mapForm.value.external_id,
        external_url: mapForm.value.external_url,
      })
      snackbar.show('Map updated', 'success')
    } else {
      await gamesStore.catalogMap(props.game.id, {
        id: mapForm.value.id,
        display_name: mapForm.value.display_name,
        game_modes: mapForm.value.game_modes,
        image_url: mapForm.value.image_url || null,
        engine_name: mapForm.value.engine_name || null,
        external_id: mapForm.value.external_id || null,
        external_url: mapForm.value.external_url || null,
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
