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
            <v-col cols="12" class="pb-0">
              <div class="text-subtitle-2 text-medium-emphasis">Dates (optional)</div>
            </v-col>
            <v-col cols="6">
              <v-text-field
                v-model="form.registration_start"
                label="Registration opens"
                type="datetime-local"
                variant="outlined"
                density="comfortable"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                v-model="form.registration_end"
                label="Registration closes"
                type="datetime-local"
                variant="outlined"
                density="comfortable"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                v-model="form.season_start"
                label="Season starts"
                type="datetime-local"
                variant="outlined"
                density="comfortable"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                v-model="form.season_end"
                label="Season ends"
                type="datetime-local"
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
          aria-label="Status"
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
          aria-label="Roster Lock"
                v-model="form.roster_lock_status"
                :items="rosterLockOptions"
                item-title="label"
                item-value="value"
                label="Roster Lock"
                variant="outlined"
                density="comfortable"
                :hint="rosterLockMeaning"
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
  registration_start: '',
  registration_end: '',
  season_start: '',
  season_end: '',
})

/** ISO instant → `datetime-local` value in the browser's zone ('' when unset). */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function toIso(local: string): string | null {
  return local ? new Date(local).toISOString() : null
}

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
// P-207: the options are the season's CURRENT status plus the transitions the
// server says are legal (`allowed_status_transitions`, computed from
// `SeasonStatus::allowed_transitions` — the same list the PATCH enforces since
// P-199). Offering all six values made every chain-illegal pick a control
// that 400s (the P-82 shape); deriving them client-side would hand-copy the
// lifecycle rule (the P-15 shape). The server's answer is the option list.
const statusOptions = computed(() => {
  const current = props.season?.status
  const allowed = props.season?.allowed_status_transitions ?? []
  const values = current ? [current, ...allowed] : allowed
  return values.map((value) => ({
    value,
    label: getStatusLabel(seasonStatusMap, value),
  }))
})

// P-14 is FIXED: `LeagueSeasonService::update_season` now forwards
// `roster_lock_status` (by delegating to `update_roster_lock`, which also
// stamps the `roster_locked_by` / `roster_locked_at` audit columns), so this
// select is live. It used to be a silent no-op — the API accepted and validated
// the field and then dropped it, which left every roster-lock check downstream
// unreachable. The option list stays pinned to the three values the backend
// enum actually declares (P-17).
const ROSTER_LOCK_STATUSES = ['open', 'soft_lock', 'hard_lock'] as const

const rosterLockOptions = ROSTER_LOCK_STATUSES.map((value) => ({
  value,
  label: rosterLockLabel(value) ?? 'Open',
}))

// P-148: this control is no longer decoration. It used to be ANDed with the
// season's phase (`SeasonStatus::allows_roster_changes()` — draft/registration
// only), so once a season went live NOTHING could change a roster and the lock
// had no say. The owner ruled that the lock is an optional, per-season
// decision — "this is a casual league, so adding team members half way through
// may be okay" — so the phase no longer votes and this select is the whole
// rule. Which means an operator has to be able to read what each value does
// without going to the source, hence the persistent hint.
const ROSTER_LOCK_MEANING: Record<string, string> = {
  open: 'Rosters can change freely, including mid-season, until the season is completed or cancelled.',
  soft_lock: 'Substitutes only — captains and players are frozen.',
  hard_lock: 'Frozen — no roster changes at all, including captaincy.',
}

const rosterLockMeaning = computed(
  () => ROSTER_LOCK_MEANING[form.value.roster_lock_status] ?? '',
)

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
      registration_start: toLocalInput(props.season.registration_start),
      registration_end: toLocalInput(props.season.registration_end),
      season_start: toLocalInput(props.season.season_start),
      season_end: toLocalInput(props.season.season_end),
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
  for (const key of ['registration_start', 'registration_end', 'season_start', 'season_end'] as const) {
    if (form.value[key] !== toLocalInput(props.season[key])) body[key] = toIso(form.value[key])
  }
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
