<template>
  <v-dialog
    v-model="open"
    max-width="600"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Create New Season</span>
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
                hint="e.g., Season 1, Spring 2024, Open Qualifier"
                persistent-hint
                @input="generateSlug"
              />
            </v-col>

            <v-col cols="12">
              <v-text-field
                v-model="form.slug"
                label="URL Slug"
                :rules="[rules.required, rules.minLength(2), rules.maxLength(100), rules.slug]"
                variant="outlined"
                density="comfortable"
                hint="URL-friendly identifier"
                persistent-hint
              />
            </v-col>

            <v-col cols="12">
              <v-textarea
                v-model="form.description"
                label="Description (Optional)"
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
                hint="Leave empty for unlimited"
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
          Create Season
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
import {
  useLeagueSeasonsStore,
  type CreateLeagueSeasonRequest,
} from '@/stores/leagueSeasons'

const props = defineProps<{  leagueId: string
}>()

const emit = defineEmits<{  created: []
}>()

const open = defineModel<boolean>({ required: true })

const leagueSeasonsStore = useLeagueSeasonsStore()

const formRef = ref()
const formValid = ref(false)
const saving = computed(() => leagueSeasonsStore.createSeasonState.loading)
const error = ref<string | null>(null)

const form = ref({
  name: '',
  slug: '',
  description: '',
  team_size_min: 5,
  team_size_max: 5,
  max_substitutes: 2,
  max_teams: null as number | null,
  registration_start: '',
  registration_end: '',
  season_start: '',
  season_end: '',
})

/** `datetime-local` value → ISO instant, or null when blank. */
function toIso(local: string): string | null {
  return local ? new Date(local).toISOString() : null
}

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

watch(open, (isOpen) => {
  if (isOpen) {
    form.value = {
      name: '',
      slug: '',
      description: '',
      team_size_min: 5,
      team_size_max: 5,
      max_substitutes: 2,
      max_teams: null,
      registration_start: '',
      registration_end: '',
      season_start: '',
      season_end: '',
    }
    error.value = null
  }
})

function close() {
  error.value = null
  open.value = false
}

async function save() {
  if (!formValid.value || !props.leagueId) return
  error.value = null

  const body: CreateLeagueSeasonRequest = {
    league_id: props.leagueId,
    name: form.value.name,
    slug: form.value.slug,
  }

  if (form.value.description) body.description = form.value.description
  if (form.value.team_size_min) body.team_size_min = form.value.team_size_min
  if (form.value.team_size_max) body.team_size_max = form.value.team_size_max
  if (form.value.max_substitutes !== null) body.max_substitutes = form.value.max_substitutes
  if (form.value.max_teams) body.max_teams = form.value.max_teams
  for (const key of ['registration_start', 'registration_end', 'season_start', 'season_end'] as const) {
    const iso = toIso(form.value[key])
    if (iso) body[key] = iso
  }

  try {
    await leagueSeasonsStore.createSeason(body)
    emit('created')
    close()
  } catch (e) {
    error.value = e instanceof ApiError
      ? e.detail
      : (leagueSeasonsStore.createSeasonState.error ?? 'Failed to create season')
  }
}
</script>
