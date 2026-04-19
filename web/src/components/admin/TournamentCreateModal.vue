<template>
  <v-dialog
    v-model="open"
    max-width="800"
    persistent
    scrollable
  >
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Create New Tournament</span>
        <v-btn icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text style="max-height: 70vh">
        <v-form ref="formRef" v-model="formValid">
          <!-- Basic Info -->
          <h3 class="text-subtitle-1 font-weight-bold mb-3">Basic Information</h3>
          <v-row>
            <v-col cols="12" md="6">
              <v-select
                v-model="form.game_id"
                :items="activeGames"
                item-title="display_name"
                item-value="id"
                label="Game"
                :rules="[rules.required]"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="mdi-gamepad-variant"
              >
                <template v-slot:item="{ item, props: itemProps }">
                  <v-list-item v-bind="itemProps">
                    <template v-slot:prepend>
                      <v-avatar size="24" rounded="sm">
                        <v-img v-if="item.raw.icon_url" :src="item.raw.icon_url" />
                        <v-icon v-else size="16">mdi-gamepad-variant</v-icon>
                      </v-avatar>
                    </template>
                  </v-list-item>
                </template>
              </v-select>
            </v-col>

            <v-col cols="12" md="6">
              <v-text-field
                v-model="form.name"
                label="Tournament Name"
                :rules="[rules.required, rules.minLength(3), rules.maxLength(100)]"
                variant="outlined"
                density="comfortable"
                @input="generateSlug"
              />
            </v-col>

            <!-- League Selection (Optional) -->
            <v-col cols="12" md="6" v-if="availableLeagues.length > 0">
              <v-select
                v-model="form.league_id"
                :items="availableLeagues"
                item-title="name"
                item-value="id"
                label="Link to League (Optional)"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="mdi-trophy"
                clearable
                hint="Associate this tournament with a league"
                persistent-hint
              />
            </v-col>

            <!-- Season Selection (Optional, shown when league selected) -->
            <v-col cols="12" md="6" v-if="form.league_id && availableSeasons.length > 0">
              <v-select
                v-model="form.season_id"
                :items="availableSeasons"
                item-title="name"
                item-value="id"
                label="Link to Season (Optional)"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="mdi-calendar-range"
                clearable
                hint="Associate with a specific season"
                persistent-hint
              />
            </v-col>

            <v-col cols="12" md="6">
              <v-text-field
                v-model="form.slug"
                label="URL Slug"
                :rules="[rules.required, rules.minLength(3), rules.maxLength(100), rules.slug]"
                variant="outlined"
                density="comfortable"
                hint="URL-friendly identifier (lowercase, numbers, hyphens)"
                persistent-hint
              />
            </v-col>

            <v-col cols="12" md="6">
              <v-select
                v-model="form.format"
                :items="formatOptions"
                item-title="label"
                item-value="value"
                label="Tournament Format"
                :rules="[rules.required]"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12">
              <v-textarea
                v-model="form.description"
                label="Description (Optional)"
                :rules="[rules.maxLength(5000)]"
                rows="3"
                variant="outlined"
                density="comfortable"
              />
            </v-col>
          </v-row>

          <v-divider class="my-4" />

          <!-- Participant Settings -->
          <h3 class="text-subtitle-1 font-weight-bold mb-3">Participant Settings</h3>
          <v-row>
            <v-col cols="12" md="6">
              <v-select
                v-model="form.participant_type"
                :items="participantTypeOptions"
                item-title="label"
                item-value="value"
                label="Participant Type"
                :rules="[rules.required]"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12" md="6" v-if="form.participant_type === 'team'">
              <v-text-field
                v-model.number="form.team_size"
                label="Team Size"
                type="number"
                :rules="[rules.required, rules.minValue(2), rules.maxValue(20)]"
                variant="outlined"
                density="comfortable"
                hint="Number of players per team"
                persistent-hint
              />
            </v-col>

            <v-col cols="12" md="6">
              <v-text-field
                v-model.number="form.min_participants"
                label="Minimum Participants"
                type="number"
                :rules="[rules.required, rules.minValue(2)]"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12" md="6">
              <v-text-field
                v-model.number="form.max_participants"
                label="Maximum Participants"
                type="number"
                :rules="[rules.required, rules.minValue(form.min_participants), rules.maxValue(256)]"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12" md="6">
              <v-select
                v-model="form.registration_type"
                :items="registrationTypeOptions"
                item-title="label"
                item-value="value"
                label="Registration Type"
                :rules="[rules.required]"
                variant="outlined"
                density="comfortable"
              >
                <template v-slot:item="{ item, props: itemProps }">
                  <v-list-item v-bind="itemProps">
                    <v-list-item-subtitle>{{ item.raw.description }}</v-list-item-subtitle>
                  </v-list-item>
                </template>
              </v-select>
            </v-col>

            <v-col cols="12" md="6">
              <v-select
                v-model="form.withdrawal_policy"
                :items="withdrawalPolicyOptions"
                item-title="label"
                item-value="value"
                label="Withdrawal Policy"
                variant="outlined"
                density="comfortable"
              >
                <template v-slot:item="{ item, props: itemProps }">
                  <v-list-item v-bind="itemProps">
                    <v-list-item-subtitle>{{ item.raw.description }}</v-list-item-subtitle>
                  </v-list-item>
                </template>
              </v-select>
            </v-col>
          </v-row>

          <v-divider class="my-4" />

          <!-- Match Settings -->
          <h3 class="text-subtitle-1 font-weight-bold mb-3">Match Settings</h3>
          <v-row>
            <v-col cols="12" md="6">
              <v-select
                v-model="form.default_match_format"
                :items="matchFormatOptions"
                item-title="label"
                item-value="value"
                label="Default Match Format"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12" md="6">
              <v-select
                v-model="form.scheduling_mode"
                :items="schedulingModeOptions"
                item-title="label"
                item-value="value"
                label="Scheduling Mode"
                variant="outlined"
                density="comfortable"
              >
                <template v-slot:item="{ item, props: itemProps }">
                  <v-list-item v-bind="itemProps">
                    <v-list-item-subtitle>{{ item.raw.description }}</v-list-item-subtitle>
                  </v-list-item>
                </template>
              </v-select>
            </v-col>

            <v-col cols="12" md="6">
              <v-select
                v-model="form.default_map_veto_format"
                :items="vetoFormatOptions"
                item-title="title"
                item-value="value"
                label="Map Veto Format"
                variant="outlined"
                density="comfortable"
                clearable
                :disabled="!form.game_id || loadingGameDetail"
                :loading="loadingGameDetail"
                :hint="selectedVetoDescription || 'Select a game first to see available formats'"
                persistent-hint
                no-data-text="No veto formats available for this game"
              >
                <template v-slot:item="{ item, props: itemProps }">
                  <v-list-item v-bind="itemProps">
                    <v-list-item-subtitle>{{ item.raw.description }}</v-list-item-subtitle>
                  </v-list-item>
                </template>
              </v-select>
            </v-col>

            <v-col cols="12" md="6">
              <v-select
                v-model="form.side_selection_mode"
                :items="sideSelectionModeOptions"
                item-title="title"
                item-value="value"
                label="Side Selection Mode"
                variant="outlined"
                density="comfortable"
                :disabled="!form.game_id"
                hint="How starting sides are determined for picked maps"
                persistent-hint
              />
            </v-col>
          </v-row>

          <!-- Map Pool Picker -->
          <template v-if="gameDetail && gameDetail.maps && gameDetail.maps.length > 0">
            <v-divider class="my-4" />
            <MapPoolPicker
              v-model="selectedMapIds"
              :maps="gameDetail.maps"
              :default-pool-ids="gameDefaultPoolIds"
            />
          </template>

          <v-divider class="my-4" />

          <!-- Schedule Settings -->
          <h3 class="text-subtitle-1 font-weight-bold mb-3">Schedule</h3>
          <v-row>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="form.registration_start"
                label="Registration Opens"
                type="datetime-local"
                variant="outlined"
                density="comfortable"
                hint="When participants can start registering"
                persistent-hint
              />
            </v-col>

            <v-col cols="12" md="6">
              <v-text-field
                v-model="form.registration_end"
                label="Registration Closes"
                type="datetime-local"
                variant="outlined"
                density="comfortable"
                hint="Deadline for registration"
                persistent-hint
              />
            </v-col>

            <v-col cols="12" md="6">
              <v-text-field
                v-model="form.starts_at"
                label="Tournament Starts"
                type="datetime-local"
                variant="outlined"
                density="comfortable"
                hint="When matches begin"
                persistent-hint
              />
            </v-col>
          </v-row>

          <v-divider class="my-4" />

          <!-- Check-in Settings -->
          <h3 class="text-subtitle-1 font-weight-bold mb-3">Check-in Settings</h3>
          <v-row>
            <v-col cols="12" md="4">
              <v-switch
                v-model="form.check_in_required"
                label="Require Check-in"
                color="primary"
                hide-details
              />
            </v-col>

            <v-col cols="12" md="4" v-if="form.check_in_required">
              <v-text-field
                v-model="form.check_in_start"
                label="Check-in Opens"
                type="datetime-local"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12" md="4" v-if="form.check_in_required">
              <v-text-field
                v-model="form.check_in_end"
                label="Check-in Closes"
                type="datetime-local"
                variant="outlined"
                density="comfortable"
              />
            </v-col>
          </v-row>

          <v-divider class="my-4" />

          <!-- Additional Settings -->
          <h3 class="text-subtitle-1 font-weight-bold mb-3">Additional Settings</h3>
          <v-row>
            <v-col cols="12">
              <v-text-field
                v-model="form.rules_url"
                label="Rules URL (Optional)"
                :rules="[rules.url]"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="mdi-file-document"
                hint="Link to external rules document"
                persistent-hint
              />
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          :disabled="!formValid"
          @click="save"
        >
          Create Tournament
        </v-btn>
      </v-card-actions>

      <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
        {{ error }}
      </v-alert>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useTournamentsStore, TOURNAMENT_FORMATS, PARTICIPANT_TYPES, REGISTRATION_TYPES, SCHEDULING_MODES, MATCH_FORMATS, WITHDRAWAL_POLICIES } from '@/stores/tournaments'
import { useGamesStore, type GameSummary, type GameDetail } from '@/stores/games'
import { useFormRules } from '@/composables/useFormRules'
import MapPoolPicker from '@/components/MapPoolPicker.vue'

// League and season types for selection
interface LeagueSummary {
  id: string
  name: string
  game_id: string
  status: string
}

interface SeasonSummary {
  id: string
  name: string
  league_id: string
  status: string
}

const tournamentsStore = useTournamentsStore()
const gamesStore = useGamesStore()

const props = defineProps<{  games: GameSummary[]
  leagues?: LeagueSummary[]
  seasons?: SeasonSummary[]
}>()

const emit = defineEmits<{  created: []
}>()

const open = defineModel<boolean>({ required: true })

const formRef = ref()
const formValid = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

// Options
const formatOptions = TOURNAMENT_FORMATS
const participantTypeOptions = PARTICIPANT_TYPES
const registrationTypeOptions = REGISTRATION_TYPES
const schedulingModeOptions = SCHEDULING_MODES
const matchFormatOptions = MATCH_FORMATS
const withdrawalPolicyOptions = WITHDRAWAL_POLICIES

// Filter to active games only
const activeGames = computed(() => {
  return props.games.filter(g => g.status === 'active')
})

// Game detail for veto formats
const gameDetail = ref<GameDetail | null>(null)
const loadingGameDetail = ref(false)

const vetoFormatOptions = computed(() => {
  if (!gameDetail.value) return []
  return gameDetail.value.map_pick_ban_formats.map(f => ({
    title: f.display_name,
    value: f.id,
    description: f.description,
  }))
})

const sideSelectionModeOptions = [
  { title: 'Picker Chooses Side', value: 'picker_choice' },
  { title: 'Coin Flip for Sides', value: 'coin_flip' },
  { title: 'Knife Round (In-Game)', value: 'knife' },
]

const selectedVetoDescription = computed(() => {
  if (!form.value.default_map_veto_format || !gameDetail.value) return null
  const fmt = gameDetail.value.map_pick_ban_formats.find(f => f.id === form.value.default_map_veto_format)
  return fmt?.description ?? null
})

// Map pool state
const selectedMapIds = ref<string[]>([])
const gameDefaultPoolIds = ref<string[]>([])

const mapPoolIsCustom = computed(() => {
  const sorted = (ids: string[]) => JSON.stringify([...ids].sort())
  return sorted(selectedMapIds.value) !== sorted(gameDefaultPoolIds.value)
})

const form = ref({
  game_id: '',
  league_id: '' as string | null,
  season_id: '' as string | null,
  name: '',
  slug: '',
  description: '',
  format: 'single_elimination',
  participant_type: 'individual',
  team_size: 5,
  min_participants: 4,
  max_participants: 16,
  registration_type: 'open',
  withdrawal_policy: 'forfeit',
  default_match_format: 'bo3',
  default_map_veto_format: null as string | null,
  side_selection_mode: 'picker_choice',
  scheduling_mode: 'live',
  registration_start: '',
  registration_end: '',
  starts_at: '',
  check_in_required: false,
  check_in_start: '',
  check_in_end: '',
  rules_url: '',
})

// Filtered leagues based on selected game
const availableLeagues = computed(() => {
  if (!form.value.game_id || !props.leagues) return []
  return props.leagues.filter(l => l.game_id === form.value.game_id && l.status === 'active')
})

// Filtered seasons based on selected league
const availableSeasons = computed(() => {
  if (!form.value.league_id || !props.seasons) return []
  return props.seasons.filter(s => s.league_id === form.value.league_id && s.status === 'active')
})

// Reset league/season and fetch game detail when game changes
watch(() => form.value.game_id, async (gameId) => {
  form.value.league_id = null
  form.value.season_id = null
  form.value.default_map_veto_format = null
  gameDetail.value = null
  selectedMapIds.value = []
  gameDefaultPoolIds.value = []
  if (gameId) {
    loadingGameDetail.value = true
    try {
      gameDetail.value = await gamesStore.fetchGame(gameId)
      // Initialize map pool from game default
      const pool = (gameDetail.value as any)?.map_pool || []
      selectedMapIds.value = [...pool]
      gameDefaultPoolIds.value = [...pool]
    } catch {
      // Non-critical — veto format select will just be empty
    } finally {
      loadingGameDetail.value = false
    }
  }
})

// Reset season when league changes
watch(() => form.value.league_id, () => {
  form.value.season_id = null
})

const rules = useFormRules()

// Auto-generate slug from name
function generateSlug() {
  if (form.value.name) {
    form.value.slug = form.value.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }
}

// Format datetime for API (ISO 8601)
function formatDateTimeForApi(datetime: string): string | null {
  if (!datetime) return null
  return new Date(datetime).toISOString()
}

// Reset form when dialog opens
watch(open, (isOpen) => {
  if (isOpen) {
    form.value = {
      game_id: '',
      league_id: null,
      season_id: null,
      name: '',
      slug: '',
      description: '',
      format: 'single_elimination',
      participant_type: 'individual',
      team_size: 5,
      min_participants: 4,
      max_participants: 16,
      registration_type: 'open',
      withdrawal_policy: 'forfeit',
      default_match_format: 'bo3',
      default_map_veto_format: null,
      scheduling_mode: 'live',
      registration_start: '',
      registration_end: '',
      starts_at: '',
      check_in_required: false,
      check_in_start: '',
      check_in_end: '',
      rules_url: '',
    }
    gameDetail.value = null
    selectedMapIds.value = []
    gameDefaultPoolIds.value = []
    error.value = null
  }
})

function close() {
  error.value = null
  open.value = false
}

async function save() {
  if (!formValid.value) return

  saving.value = true
  error.value = null

  try {
    const created = await tournamentsStore.createTournament({
      game_id: form.value.game_id,
      league_id: form.value.league_id || undefined,
      season_id: form.value.season_id || undefined,
      name: form.value.name,
      slug: form.value.slug,
      description: form.value.description || null,
      format: form.value.format,
      participant_type: form.value.participant_type,
      team_size: form.value.participant_type === 'team' ? form.value.team_size : null,
      min_participants: form.value.min_participants,
      max_participants: form.value.max_participants,
      registration_type: form.value.registration_type,
      withdrawal_policy: form.value.withdrawal_policy,
      default_match_format: form.value.default_match_format,
      default_map_veto_format: form.value.default_map_veto_format || null,
      scheduling_mode: form.value.scheduling_mode,
      registration_start: formatDateTimeForApi(form.value.registration_start),
      registration_end: formatDateTimeForApi(form.value.registration_end),
      starts_at: formatDateTimeForApi(form.value.starts_at),
      check_in_required: form.value.check_in_required,
      check_in_start: form.value.check_in_required ? formatDateTimeForApi(form.value.check_in_start) : null,
      check_in_end: form.value.check_in_required ? formatDateTimeForApi(form.value.check_in_end) : null,
      rules_url: form.value.rules_url || null,
      settings: {
        side_selection_mode: form.value.side_selection_mode,
      },
    })

    // Save custom map pool if different from game default
    if (created && mapPoolIsCustom.value && selectedMapIds.value.length > 0) {
      try {
        await tournamentsStore.setTournamentMapPool(created.id, selectedMapIds.value)
      } catch {
        // Non-critical — tournament was created, pool can be set later
      }
    }

    emit('created')
    close()
  } catch {
    error.value = tournamentsStore.error || 'Failed to create tournament'
  } finally {
    saving.value = false
  }
}
</script>
