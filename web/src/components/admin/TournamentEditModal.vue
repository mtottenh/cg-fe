<template>
  <v-dialog
    v-model="open"
    max-width="800"
    persistent
    scrollable
  >
    <v-card v-if="tournament">
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Edit Tournament</span>
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
              <v-text-field
                v-model="form.name"
                label="Tournament Name"
                :rules="[rules.required, rules.minLength(3), rules.maxLength(100)]"
                variant="outlined"
                density="comfortable"
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
                :disabled="!canEditSlug"
              />
            </v-col>

            <v-col cols="12">
              <v-textarea
                v-model="form.description"
                label="Description"
                :rules="[rules.maxLength(5000)]"
                rows="3"
                variant="outlined"
                density="comfortable"
              />
            </v-col>
          </v-row>

          <v-divider class="my-4" />

          <!-- Participant Settings - only editable before tournament starts -->
          <h3 class="text-subtitle-1 font-weight-bold mb-3">
            Participant Settings
            <v-chip v-if="!canEditParticipants" size="x-small" color="warning" class="ml-2">Locked</v-chip>
          </h3>
          <v-row>
            <v-col cols="12" md="6">
              <v-text-field
                v-model.number="form.min_participants"
                label="Minimum Participants"
                type="number"
                :rules="[rules.required, rules.minValue(2)]"
                variant="outlined"
                density="comfortable"
                :disabled="!canEditParticipants"
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
                :disabled="!canEditParticipants"
              />
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
                v-model="form.default_map_veto_format"
                :items="vetoFormatOptions"
                item-title="title"
                item-value="value"
                label="Map Veto Format"
                variant="outlined"
                density="comfortable"
                clearable
                :loading="loadingGameDetail"
                :hint="selectedVetoDescription || 'No veto format selected'"
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
                :disabled="!canEditRegistrationDates"
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
                :disabled="!canEditStartDate"
              />
            </v-col>

            <v-col cols="12" md="6">
              <v-text-field
                v-model="form.timezone_hint"
                label="Timezone Hint"
                variant="outlined"
                density="comfortable"
                hint="E.g., America/New_York"
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
                :disabled="!canEditParticipants"
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
                label="Rules URL"
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
        <v-chip :color="statusColor" size="small" variant="flat">
          {{ statusLabel }}
        </v-chip>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          :disabled="!formValid || !hasChanges"
          @click="save"
        >
          Save Changes
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
import { useTournamentsStore, MATCH_FORMATS, WITHDRAWAL_POLICIES, getStatusColor, getStatusLabel, type TournamentResponse } from '@/stores/tournaments'
import { useGamesStore, type GameDetail } from '@/stores/games'
import type { TournamentSettings, GameDetailWithMapPool } from '@/api/overrides'
import { useFormRules } from '@/composables/useFormRules'
import MapPoolPicker from '@/components/MapPoolPicker.vue'

const tournamentsStore = useTournamentsStore()
const gamesStore = useGamesStore()

const props = defineProps<{  tournament: TournamentResponse | null
}>()

const emit = defineEmits<{  saved: []
}>()

const open = defineModel<boolean>({ required: true })

const formRef = ref()
const formValid = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

// Options
const matchFormatOptions = MATCH_FORMATS
const withdrawalPolicyOptions = WITHDRAWAL_POLICIES

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
const originalMapPoolIds = ref<string[]>([])

const mapPoolIsCustom = computed(() => {
  const sorted = (ids: string[]) => JSON.stringify([...ids].sort())
  return sorted(selectedMapIds.value) !== sorted(gameDefaultPoolIds.value)
})

const form = ref({
  name: '',
  slug: '',
  description: '',
  min_participants: 4,
  max_participants: 16,
  withdrawal_policy: 'forfeit',
  default_match_format: 'bo3',
  default_map_veto_format: null as string | null,
  side_selection_mode: 'picker_choice',
  registration_start: '',
  registration_end: '',
  starts_at: '',
  timezone_hint: '',
  check_in_required: false,
  check_in_start: '',
  check_in_end: '',
  rules_url: '',
})

// Original values for change detection
const originalForm = ref<typeof form.value | null>(null)

// Computed permissions based on tournament status
const canEditSlug = computed(() => {
  if (!props.tournament) return false
  return ['draft', 'published'].includes(props.tournament.status)
})

const canEditParticipants = computed(() => {
  if (!props.tournament) return false
  return ['draft', 'published', 'registration_open', 'registration_closed'].includes(props.tournament.status)
})

const canEditRegistrationDates = computed(() => {
  if (!props.tournament) return false
  return ['draft', 'published'].includes(props.tournament.status)
})

const canEditStartDate = computed(() => {
  if (!props.tournament) return false
  return ['draft', 'published', 'registration_open', 'registration_closed', 'ready'].includes(props.tournament.status)
})

const statusColor = computed(() => props.tournament ? getStatusColor(props.tournament.status) : 'grey')
const statusLabel = computed(() => props.tournament ? getStatusLabel(props.tournament.status) : '')

const hasChanges = computed(() => {
  if (!originalForm.value) return false
  const formChanged = JSON.stringify(form.value) !== JSON.stringify(originalForm.value)
  const sorted = (ids: string[]) => JSON.stringify([...ids].sort())
  const poolChanged = sorted(selectedMapIds.value) !== sorted(originalMapPoolIds.value)
  return formChanged || poolChanged
})

const rules = useFormRules()

// Format datetime for API (ISO 8601)
function formatDateTimeForApi(datetime: string): string | null {
  if (!datetime) return null
  return new Date(datetime).toISOString()
}

// Format datetime for form input
function formatDateTimeForInput(datetime: string | null | undefined): string {
  if (!datetime) return ''
  const d = new Date(datetime)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Populate form when tournament changes
watch(() => props.tournament, async (t) => {
  if (t) {
    form.value = {
      name: t.name,
      slug: t.slug,
      description: t.description || '',
      min_participants: t.min_participants,
      max_participants: t.max_participants,
      withdrawal_policy: t.withdrawal_policy,
      default_match_format: t.default_match_format,
      default_map_veto_format: t.default_map_veto_format ?? null,
      side_selection_mode: (t.settings as TournamentSettings | undefined)?.side_selection_mode
        ?? (t as unknown as { side_selection_mode?: string }).side_selection_mode
        ?? 'picker_choice',
      registration_start: formatDateTimeForInput(t.registration_start),
      registration_end: formatDateTimeForInput(t.registration_end),
      starts_at: formatDateTimeForInput(t.starts_at),
      timezone_hint: t.timezone_hint || '',
      check_in_required: t.check_in_required,
      check_in_start: formatDateTimeForInput(t.check_in_start),
      check_in_end: formatDateTimeForInput(t.check_in_end),
      rules_url: t.rules_url || '',
    }
    originalForm.value = { ...form.value }
    error.value = null

    // Fetch game detail and tournament map pool
    gameDetail.value = null
    selectedMapIds.value = []
    gameDefaultPoolIds.value = []
    originalMapPoolIds.value = []
    loadingGameDetail.value = true
    try {
      const [gd, poolResult] = await Promise.all([
        gamesStore.fetchGame(t.game_id),
        tournamentsStore.getTournamentMapPool(t.id).catch(() => null),
      ])
      gameDetail.value = gd
      // Set game default pool
      gameDefaultPoolIds.value = (gd as GameDetailWithMapPool | null | undefined)?.map_pool ?? []
      // Set selected from tournament pool (or game default)
      if (poolResult && poolResult.source === 'tournament') {
        selectedMapIds.value = [...poolResult.maps]
        originalMapPoolIds.value = [...poolResult.maps]
      } else {
        selectedMapIds.value = [...gameDefaultPoolIds.value]
        originalMapPoolIds.value = [...gameDefaultPoolIds.value]
      }
    } catch {
      // Non-critical
    } finally {
      loadingGameDetail.value = false
    }
  }
}, { immediate: true })

function close() {
  error.value = null
  open.value = false
}

async function save() {
  if (!formValid.value || !props.tournament) return

  saving.value = true
  error.value = null

  try {
    await tournamentsStore.updateTournament(props.tournament.id, {
      name: form.value.name !== props.tournament.name ? form.value.name : undefined,
      slug: form.value.slug !== props.tournament.slug ? form.value.slug : undefined,
      description: form.value.description !== (props.tournament.description || '') ? form.value.description : undefined,
      min_participants: form.value.min_participants !== props.tournament.min_participants ? form.value.min_participants : undefined,
      max_participants: form.value.max_participants !== props.tournament.max_participants ? form.value.max_participants : undefined,
      withdrawal_policy: form.value.withdrawal_policy !== props.tournament.withdrawal_policy ? form.value.withdrawal_policy : undefined,
      default_match_format: form.value.default_match_format !== props.tournament.default_match_format ? form.value.default_match_format : undefined,
      default_map_veto_format: form.value.default_map_veto_format !== (props.tournament.default_map_veto_format ?? null) ? (form.value.default_map_veto_format || null) : undefined,
      registration_start: formatDateTimeForApi(form.value.registration_start),
      registration_end: formatDateTimeForApi(form.value.registration_end),
      starts_at: formatDateTimeForApi(form.value.starts_at),
      timezone_hint: form.value.timezone_hint || undefined,
      check_in_required: form.value.check_in_required !== props.tournament.check_in_required ? form.value.check_in_required : undefined,
      check_in_start: form.value.check_in_required ? formatDateTimeForApi(form.value.check_in_start) : undefined,
      check_in_end: form.value.check_in_required ? formatDateTimeForApi(form.value.check_in_end) : undefined,
      rules_url: form.value.rules_url || undefined,
      settings: {
        side_selection_mode: form.value.side_selection_mode,
      },
    })

    // Save map pool changes
    const sorted = (ids: string[]) => JSON.stringify([...ids].sort())
    if (sorted(selectedMapIds.value) !== sorted(originalMapPoolIds.value)) {
      if (!mapPoolIsCustom.value) {
        // Revert to game default — delete tournament override
        await tournamentsStore.deleteTournamentMapPool(props.tournament.id).catch(() => {})
      } else if (selectedMapIds.value.length > 0) {
        await tournamentsStore.setTournamentMapPool(props.tournament.id, selectedMapIds.value)
      }
    }

    emit('saved')
    close()
  } catch {
    error.value = tournamentsStore.error || 'Failed to update tournament'
  } finally {
    saving.value = false
  }
}
</script>
