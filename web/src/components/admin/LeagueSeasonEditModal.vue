<template>
  <v-dialog
    v-model="open"
    max-width="600"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Edit Season: {{ season?.name }}</span>
        <v-btn aria-label="Close" icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text>
        <v-form ref="formRef" v-model="formValid">
          <v-row>
            <v-col cols="12">
              <v-text-field
                v-model="form.name"
                label="Season Name"
                :rules="[rules.required, rules.minLength(2), rules.maxLength(100)]"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12">
              <v-text-field
                v-model="form.slug"
                label="URL Slug"
                :rules="[rules.required, rules.minLength(2), rules.maxLength(100), rules.slug]"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12">
              <v-textarea
                v-model="form.description"
                label="Description"
                :rules="[rules.maxLength(2000)]"
                rows="2"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="6">
              <v-text-field
                v-model.number="form.team_size_min"
                label="Min Team Size"
                type="number"
                min="1"
                :rules="[rules.positiveNumber]"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="6">
              <v-text-field
                v-model.number="form.team_size_max"
                label="Max Team Size"
                type="number"
                min="1"
                :rules="[rules.positiveNumber, rules.maxGreaterThanMin]"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="6">
              <v-text-field
                v-model.number="form.max_substitutes"
                label="Max Substitutes"
                type="number"
                min="0"
                :rules="[rules.nonNegativeNumber]"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="6">
              <v-text-field
                v-model.number="form.max_teams"
                label="Max Teams"
                type="number"
                min="1"
                :rules="[rules.positiveNumber]"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="6">
              <v-select
                v-model="form.status"
                :items="statusOptions"
                item-title="label"
                item-value="value"
                label="Status"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="6">
              <v-select
                v-model="form.roster_lock_status"
                :items="rosterLockOptions"
                item-title="label"
                item-value="value"
                label="Roster Lock"
                variant="outlined"
                density="comfortable"
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
import { computed, ref, watch } from 'vue'
import { ApiError } from '@/api'
import { useFormRules } from '@/composables/useFormRules'
import { getStatusLabel, seasonStatusMap } from '@/utils/statusMaps'
import { rosterLockLabel } from '@/utils/rosterLock'
import {
  useLeagueSeasonsStore,
  type LeagueSeasonResponse,
  type UpdateLeagueSeasonRequest,
} from '@/stores/leagueSeasons'

type LeagueSeason = LeagueSeasonResponse
const leagueSeasonsStore = useLeagueSeasonsStore()

const props = defineProps<{  season: LeagueSeason | null
}>()

const emit = defineEmits<{  saved: []
}>()

const open = defineModel<boolean>({ required: true })

const formRef = ref()
const formValid = ref(false)
const saving = computed(() => leagueSeasonsStore.updateSeasonState.loading)
const error = ref<string | null>(null)

const form = ref({
  name: '',
  slug: '',
  description: '',
  team_size_min: null as number | null,
  team_size_max: null as number | null,
  max_substitutes: null as number | null,
  max_teams: null as number | null,
  status: 'draft',
  roster_lock_status: 'open',
})

// ---------------------------------------------------------------------------
// Option lists (COVERAGE-PLAN §9b P-17)
//
// Both lists offered values the API rejects with 400. `registration_open`,
// `registration_closed` and `in_progress` are not season statuses — the CHECK
// constraint and `SeasonStatus` permit draft / registration / active /
// playoffs / completed / cancelled
// (api/migrations/0025_league_teams_and_seasons.sql:61) — and `'locked'` is not
// a `RosterLockStatus` (`:69`), so picking it produced
// 400 "Invalid roster lock status" (portal-api/src/dto/requests/league_team.rs:211-217).
//
// Labels are pulled from the shared maps rather than re-typed, so this control
// and the Seasons table speak with one voice.
// ---------------------------------------------------------------------------
const SEASON_STATUSES = [
  'draft',
  'registration',
  'active',
  'playoffs',
  'completed',
  'cancelled',
] as const

const statusOptions = SEASON_STATUSES.map((value) => ({
  value,
  label: getStatusLabel(seasonStatusMap, value),
}))

// NOTE (P-14): the API accepts and validates `roster_lock_status` but
// `LeagueSeasonService::update_season` never forwards it to the repository, so
// changing this select is a silent no-op today. The option list is still fixed
// here so it stops offering a value that 400s, and so it is correct the moment
// the backend is plumbed through.
const ROSTER_LOCK_STATUSES = ['open', 'soft_lock', 'hard_lock'] as const

const rosterLockOptions = ROSTER_LOCK_STATUSES.map((value) => ({
  value,
  label: rosterLockLabel(value) ?? 'Open',
}))

const rules = {
  ...useFormRules(),
  nonNegativeNumber: (v: number | null) => {
    if (v === null || v === undefined) return true
    return v >= 0 || 'Must be non-negative'
  },
  maxGreaterThanMin: (v: number | null) => {
    if (!v || !form.value.team_size_min) return true
    return v >= form.value.team_size_min || 'Max must be >= min'
  },
}

watch(open, (isOpen) => {
  if (isOpen && props.season) {
    form.value = {
      name: props.season.name,
      slug: props.season.slug,
      description: props.season.description || '',
      team_size_min: props.season.team_size_min ?? null,
      team_size_max: props.season.team_size_max ?? null,
      max_substitutes: props.season.max_substitutes ?? null,
      max_teams: props.season.max_teams ?? null,
      status: props.season.status,
      roster_lock_status: props.season.roster_lock_status,
    }
    error.value = null
  }
})

function close() {
  error.value = null
  open.value = false
}

async function save() {
  if (!formValid.value || !props.season) return
  error.value = null

  const body: UpdateLeagueSeasonRequest = {}

  if (form.value.name !== props.season.name) body.name = form.value.name
  if (form.value.slug !== props.season.slug) body.slug = form.value.slug
  if (form.value.description !== (props.season.description || '')) {
    body.description = form.value.description || null
  }
  if (form.value.team_size_min !== props.season.team_size_min) {
    body.team_size_min = form.value.team_size_min
  }
  if (form.value.team_size_max !== props.season.team_size_max) {
    body.team_size_max = form.value.team_size_max
  }
  if (form.value.max_substitutes !== props.season.max_substitutes) {
    body.max_substitutes = form.value.max_substitutes
  }
  if (form.value.max_teams !== props.season.max_teams) {
    body.max_teams = form.value.max_teams
  }
  if (form.value.status !== props.season.status) body.status = form.value.status
  if (form.value.roster_lock_status !== props.season.roster_lock_status) {
    body.roster_lock_status = form.value.roster_lock_status
  }

  if (Object.keys(body).length === 0) {
    close()
    return
  }

  try {
    await leagueSeasonsStore.updateSeason(props.season.id, body)
    emit('saved')
    close()
  } catch (e) {
    error.value = e instanceof ApiError
      ? e.detail
      : (leagueSeasonsStore.updateSeasonState.error ?? 'Failed to update season')
  }
}
</script>
