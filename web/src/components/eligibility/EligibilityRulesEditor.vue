<template>
  <div>
    <p class="text-caption text-medium-emphasis mb-3">
      Leave any field empty for no restriction. Ratings use the game's own
      scale (CS Rating for CS2).
    </p>

    <div class="text-subtitle-2 font-weight-bold mb-2">
      <v-icon start size="small">mdi-account</v-icon>
      Player requirements
    </div>
    <v-row dense>
      <v-col cols="12" sm="6">
        <v-text-field
          v-model.number="minRating"
          label="Minimum Rating"
          type="number"
          min="0"
          density="compact"
          clearable
          :disabled="disabled"
          :error-messages="boundErrors.min_rating_per_player"
          hint="Players below this rating cannot join"
          persistent-hint
          data-testid="rule-min-rating"
        />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field
          v-model.number="maxRating"
          label="Maximum Rating"
          type="number"
          min="0"
          density="compact"
          clearable
          :disabled="disabled"
          hint="Players above this rating cannot join"
          persistent-hint
          data-testid="rule-max-rating"
        />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field
          v-model.number="maxPeakRating"
          label="Max Peak Rating"
          type="number"
          min="0"
          density="compact"
          clearable
          :disabled="disabled"
          hint="Anti-smurf: max all-time peak rating"
          persistent-hint
          data-testid="rule-max-peak"
        />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field
          v-model.number="maxAvgRating"
          label="Max Average Rating"
          type="number"
          min="0"
          density="compact"
          clearable
          :disabled="disabled"
          hint="Anti-smurf: max historical average rating"
          persistent-hint
          data-testid="rule-max-avg"
        />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field
          v-model.number="minMatches"
          label="Minimum Matches Played"
          type="number"
          min="0"
          density="compact"
          clearable
          :disabled="disabled"
          hint="Require players to have played N matches"
          persistent-hint
          data-testid="rule-min-matches"
        />
      </v-col>
    </v-row>

    <template v-if="showTeamRules">
      <div class="text-subtitle-2 font-weight-bold mb-2 mt-4">
        <v-icon start size="small">mdi-account-group</v-icon>
        Team requirements
      </div>
      <p class="text-caption text-medium-emphasis mb-2">
        Checked against the full roster when a team registers. The team-total
        cap also blocks roster additions that would exceed it.
      </p>
      <v-row dense>
        <v-col cols="12" sm="6">
          <v-text-field
            v-model.number="minTeamAvg"
            label="Min Team Average Rating"
            type="number"
            min="0"
            density="compact"
            clearable
            :disabled="disabled"
            :error-messages="boundErrors.min_team_average_rating"
            hint="Roster's average rating must be at least this"
            persistent-hint
            data-testid="rule-min-team-avg"
          />
        </v-col>
        <v-col cols="12" sm="6">
          <v-text-field
            v-model.number="maxTeamAvg"
            label="Max Team Average Rating"
            type="number"
            min="0"
            density="compact"
            clearable
            :disabled="disabled"
            hint="Roster's average rating must not exceed this"
            persistent-hint
            data-testid="rule-max-team-avg"
          />
        </v-col>
        <v-col cols="12" sm="6">
          <v-text-field
            v-model.number="minTeamTotal"
            label="Min Team Total Rating"
            type="number"
            min="0"
            density="compact"
            clearable
            :disabled="disabled"
            :error-messages="boundErrors.min_team_total_rating"
            hint="Sum of roster ratings must be at least this"
            persistent-hint
            data-testid="rule-min-team-total"
          />
        </v-col>
        <v-col cols="12" sm="6">
          <v-text-field
            v-model.number="maxTeamTotal"
            label="Max Team Total Rating"
            type="number"
            min="0"
            density="compact"
            clearable
            :disabled="disabled"
            hint="Sum of roster ratings must not exceed this"
            persistent-hint
            data-testid="rule-max-team-total"
          />
        </v-col>
      </v-row>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  ruleBoundErrors,
  type EligibilityRules,
  type RuleKey,
} from '@/composables/useEligibilityRules'

const props = withDefaults(
  defineProps<{
    modelValue: EligibilityRules
    /** Show the team-aggregate fields (leagues always; tournaments only for
     * team participant types). */
    showTeamRules?: boolean
    disabled?: boolean
  }>(),
  { showTeamRules: true, disabled: false },
)

const emit = defineEmits<{
  'update:modelValue': [rules: EligibilityRules]
}>()

/** Unsatisfiable min/max pairs, surfaced on the min field while typing. */
const boundErrors = computed(() => ruleBoundErrors(props.modelValue))

function bind(key: RuleKey) {
  return computed<number | null>({
    get: () => props.modelValue[key],
    set: (value) => {
      // v-model.number yields '' for a cleared field and NaN for garbage —
      // both mean "no rule".
      const normalized =
        typeof value === 'number' && Number.isFinite(value) ? value : null
      emit('update:modelValue', { ...props.modelValue, [key]: normalized })
    },
  })
}

const minRating = bind('min_rating_per_player')
const maxRating = bind('max_rating_per_player')
const maxPeakRating = bind('max_peak_rating_per_player')
const maxAvgRating = bind('max_avg_rating_per_player')
const minMatches = bind('min_matches_played')
const minTeamAvg = bind('min_team_average_rating')
const maxTeamAvg = bind('max_team_average_rating')
const minTeamTotal = bind('min_team_total_rating')
const maxTeamTotal = bind('max_team_total_rating')
</script>
