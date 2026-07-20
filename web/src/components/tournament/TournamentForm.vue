<template>
  <v-form ref="formRef" v-model="formValid">
    <!-- Basic Info -->
    <h3 class="text-subtitle-1 font-weight-bold mb-3">Basic Information</h3>
    <v-row>
      <!-- Game (create-only) -->
      <v-col v-if="isCreate" cols="12" md="6">
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
                  <v-img alt="" v-if="item.raw.icon_url" :src="item.raw.icon_url" />
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
          :onInput="isCreate ? generateSlug : undefined"
        />
      </v-col>

      <!-- League / Season (create-only) -->
      <v-col v-if="isCreate && availableLeagues.length > 0" cols="12" md="6">
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

      <v-col v-if="isCreate && form.league_id && availableSeasons.length > 0" cols="12" md="6">
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
          :disabled="!canEditSlug"
        />
      </v-col>

      <!-- Format (create-only; locked after creation) -->
      <v-col v-if="isCreate" cols="12" md="6">
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
          :label="isCreate ? 'Description (Optional)' : 'Description'"
          :rules="[rules.maxLength(5000)]"
          rows="3"
          variant="outlined"
          density="comfortable"
        />
      </v-col>
    </v-row>

    <v-divider class="my-4" />

    <!-- Participant Settings -->
    <h3 class="text-subtitle-1 font-weight-bold mb-3">
      Participant Settings
      <v-chip v-if="isEdit && !canEditParticipants" size="x-small" color="warning" class="ml-2">Locked</v-chip>
    </h3>
    <v-row>
      <!-- Participant type + team size (create-only; structural) -->
      <v-col v-if="isCreate" cols="12" md="6">
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

      <v-col v-if="isCreate && form.participant_type === 'team'" cols="12" md="6">
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

      <!-- Registration type (create-only) -->
      <v-col v-if="isCreate" cols="12" md="6">
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

      <!-- Scheduling mode (create-only) -->
      <v-col v-if="isCreate" cols="12" md="6">
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
          :disabled="isCreate && (!form.game_id || loadingGameDetail)"
          :loading="loadingGameDetail"
          :hint="selectedVetoDescription || vetoFormatHint"
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
          :disabled="isCreate && !form.game_id"
          hint="How starting sides are determined for picked maps"
          persistent-hint
        />
      </v-col>
    </v-row>

    <!-- The pool is required, so a failed config load blocks creation.
         Say why instead of leaving a dead submit button. -->
    <v-alert
      v-if="gameDetailError"
      type="error"
      variant="tonal"
      density="compact"
      class="mt-4"
    >
      {{ gameDetailError }}
    </v-alert>

    <!-- A game with no map catalog cannot back a tournament: the pool is
         required, and results/vetoes are validated against it. Say so
         plainly instead of leaving a permanently disabled submit button. -->
    <v-alert
      v-if="gameDetail && (!gameDetail.maps || gameDetail.maps.length === 0)"
      type="warning"
      variant="tonal"
      density="compact"
      class="mt-4"
    >
      <strong>{{ gameDetail.display_name }}</strong> has no maps configured, so a
      tournament cannot be created for it yet. Add maps under Admin &rarr; Games
      &rarr; Configure, then come back.
    </v-alert>

    <!-- Map Pool Picker (both modes, when game detail + maps available).
         The pool is required: it is what result submissions and vetoes are
         validated against. Pre-seeded with the game's competitive default. -->
    <template v-if="gameDetail && gameDetail.maps && gameDetail.maps.length > 0">
      <v-divider class="my-4" />
      <MapPoolPicker
        v-model="selectedMapIds"
        :maps="gameDetail.maps"
        :default-pool-ids="gameDefaultPoolIds"
        label="Tournament Map Pool"
        hint="A subset of the game's map pool. Matches can only be played and reported on these maps."
      />
      <v-alert
        v-if="!mapPoolValid"
        type="warning"
        variant="tonal"
        density="compact"
        class="mt-2"
      >
        Select at least one map - a tournament cannot be created without a map pool.
      </v-alert>
    </template>

    <v-divider class="my-4" />

    <!-- Schedule -->
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

      <!-- Timezone hint (edit-only) -->
      <v-col v-if="isEdit" cols="12" md="6">
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

      <v-col v-if="form.check_in_required" cols="12" md="4">
        <v-text-field
          v-model="form.check_in_start"
          label="Check-in Opens"
          type="datetime-local"
          variant="outlined"
          density="comfortable"
        />
      </v-col>

      <v-col v-if="form.check_in_required" cols="12" md="4">
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
          :label="isCreate ? 'Rules URL (Optional)' : 'Rules URL'"
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
</template>

<script setup lang="ts">
import { computed, toRef, watch } from 'vue'
import {
  TOURNAMENT_FORMATS,
  PARTICIPANT_TYPES,
  REGISTRATION_TYPES,
  SCHEDULING_MODES,
  MATCH_FORMATS,
  WITHDRAWAL_POLICIES,
  type TournamentResponse,
} from '@/stores/tournaments'
import type { GameSummary } from '@/stores/games'
import { useFormRules } from '@/composables/useFormRules'
import {
  useTournamentForm,
  type TournamentFormMode,
} from '@/composables/useTournamentForm'
import MapPoolPicker from '@/components/MapPoolPicker.vue'

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

const props = defineProps<{
  mode: TournamentFormMode
  /** The tournament being edited. Required for `mode='edit'`, ignored otherwise. */
  tournament?: TournamentResponse | null
  /** Game list — required for `mode='create'` (for the game select); unused in edit. */
  games?: GameSummary[]
  /** Optional league/season options for the create-mode linking selects. */
  leagues?: LeagueSummary[]
  seasons?: SeasonSummary[]
}>()

const isCreate = computed(() => props.mode === 'create')
const isEdit = computed(() => props.mode === 'edit')

// Wire the form composable. Pass the tournament as a reactive ref so edit
// mode picks up changes to props.tournament (modals swap tournaments without
// unmounting).
const tournamentRef = toRef(props, 'tournament')
const formBundle = useTournamentForm({
  mode: props.mode,
  initial: tournamentRef,
})

const {
  form,
  formRef,
  formValid,
  canEditSlug,
  canEditParticipants,
  canEditRegistrationDates,
  canEditStartDate,
  hasChanges,
  generateSlug,
  reset,
  buildCreatePayload,
  buildUpdatePatch,
  gameDetail,
  loadingGameDetail,
  gameDetailError,
  vetoFormatOptions,
  selectedVetoDescription,
  selectedMapIds,
  mapPoolValid,
  gameDefaultPoolIds,
  mapPoolIsCustom,
  mapPoolChangedFromOriginal,
  sideSelectionModeOptions,
} = formBundle

const rules = useFormRules()

// --- Options (static) ---
const formatOptions = TOURNAMENT_FORMATS
const participantTypeOptions = PARTICIPANT_TYPES
const registrationTypeOptions = REGISTRATION_TYPES
const schedulingModeOptions = SCHEDULING_MODES
const matchFormatOptions = MATCH_FORMATS
const withdrawalPolicyOptions = WITHDRAWAL_POLICIES

// --- Create-mode league/season filtering ---
const activeGames = computed(() => (props.games ?? []).filter((g) => g.status === 'active'))

const availableLeagues = computed(() => {
  if (!isCreate.value || !form.game_id || !props.leagues) return []
  return props.leagues.filter((l) => l.game_id === form.game_id && l.status === 'active')
})

const availableSeasons = computed(() => {
  if (!isCreate.value || !form.league_id || !props.seasons) return []
  return props.seasons.filter((s) => s.league_id === form.league_id && s.status === 'active')
})

const vetoFormatHint = computed(() =>
  isCreate.value ? 'Select a game first to see available formats' : 'No veto format selected',
)

// Reset league/season + veto when game changes (the gameDetail composable
// handles the map-pool reset itself).
watch(() => form.game_id, () => {
  if (!isCreate.value) return
  form.league_id = null
  form.season_id = null
  form.default_map_veto_format = null
})

// Reset season when league cleared
watch(() => form.league_id, () => {
  if (!isCreate.value) return
  form.season_id = null
})

// Expose the form surface to the parent (modal). Parent reads `form.valid`
// before submitting, calls `buildCreatePayload()` / `buildUpdatePatch()` to
// get a ready-to-send body, and reads map-pool refs to persist pool changes.
defineExpose({
  form,
  formValid,
  hasChanges,
  buildCreatePayload,
  buildUpdatePatch,
  selectedMapIds,
  mapPoolValid,
  mapPoolIsCustom,
  mapPoolChangedFromOriginal,
  reset,
})
</script>
