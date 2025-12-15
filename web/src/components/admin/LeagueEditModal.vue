<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="600"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Edit League: {{ league?.league_name }}</span>
        <v-btn icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text>
        <!-- Loading state while fetching full league details -->
        <div v-if="loadingDetails" class="text-center pa-8">
          <v-progress-circular indeterminate color="primary" />
          <p class="text-grey mt-4">Loading league details...</p>
        </div>

        <v-form v-else ref="formRef" v-model="formValid">
          <v-row>
            <v-col cols="12">
              <v-text-field
                v-model="form.name"
                label="League Name"
                :rules="[rules.required, rules.minLength(3), rules.maxLength(100)]"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12">
              <v-text-field
                v-model="form.slug"
                label="URL Slug"
                :rules="[rules.required, rules.minLength(3), rules.maxLength(100), rules.slug]"
                variant="outlined"
                density="comfortable"
                hint="URL-friendly identifier (lowercase letters, numbers, hyphens)"
                persistent-hint
              />
            </v-col>

            <v-col cols="12">
              <v-textarea
                v-model="form.description"
                label="Description"
                :rules="[rules.maxLength(2000)]"
                rows="3"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12">
              <v-text-field
                v-model="form.logo_url"
                label="Logo URL"
                :rules="[rules.url]"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="mdi-image"
              />
            </v-col>

            <v-col cols="12">
              <v-select
                v-model="form.access_type"
                :items="accessTypes"
                item-title="label"
                item-value="value"
                label="Access Type"
                :rules="[rules.required]"
                variant="outlined"
                density="comfortable"
              >
                <template v-slot:item="{ item, props }">
                  <v-list-item v-bind="props">
                    <v-list-item-subtitle>{{ item.raw.description }}</v-list-item-subtitle>
                  </v-list-item>
                </template>
              </v-select>
            </v-col>

            <v-col cols="12">
              <v-text-field
                :model-value="leagueDetails?.status || 'N/A'"
                label="Status"
                variant="outlined"
                density="comfortable"
                readonly
                disabled
                hint="Status can only be changed through specific actions"
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
          :disabled="!formValid || loadingDetails"
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
import { ref, watch } from 'vue'
import { useLeaguesStore, type UserLeagueMembership, type LeagueResponse } from '@/stores/leagues'

// Store
const leaguesStore = useLeaguesStore()

const props = defineProps<{
  modelValue: boolean
  league: UserLeagueMembership | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

const formRef = ref()
const formValid = ref(false)
const saving = ref(false)
const loadingDetails = ref(false)
const error = ref<string | null>(null)
const leagueDetails = ref<LeagueResponse | null>(null)

const form = ref({
  name: '',
  slug: '',
  description: '',
  logo_url: '',
  access_type: 'open',
})

const accessTypes = [
  { value: 'open', label: 'Open', description: 'Anyone can join immediately' },
  { value: 'invite_only', label: 'Invite Only', description: 'Members can only join via invitation' },
  { value: 'application', label: 'Application', description: 'Users apply, admins approve/reject' },
]

const rules = {
  required: (v: string) => !!v || 'Required',
  minLength: (min: number) => (v: string) => !v || v.length >= min || `Minimum ${min} characters`,
  maxLength: (max: number) => (v: string) => !v || v.length <= max || `Maximum ${max} characters`,
  slug: (v: string) => {
    if (!v) return true
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(v)) {
      return 'Must be lowercase letters, numbers, and hyphens. Must start and end with letter or number.'
    }
    return true
  },
  url: (v: string) => {
    if (!v) return true
    try {
      new URL(v)
      return true
    } catch {
      return 'Must be a valid URL'
    }
  },
}

// Fetch full league details when dialog opens
watch(() => props.modelValue, async (isOpen) => {
  if (isOpen && props.league) {
    await fetchLeagueDetails()
  }
})

async function fetchLeagueDetails() {
  if (!props.league) return

  loadingDetails.value = true
  error.value = null

  try {
    const league = await leaguesStore.fetchLeague(props.league.league_id)
    leagueDetails.value = league

    // Populate form with league details
    form.value = {
      name: league.name,
      slug: league.slug,
      description: league.description || '',
      logo_url: league.logo_url || '',
      access_type: league.access_type,
    }
  } catch {
    error.value = leaguesStore.error || 'Failed to load league details'
  } finally {
    loadingDetails.value = false
  }
}

function close() {
  error.value = null
  leagueDetails.value = null
  emit('update:modelValue', false)
}

async function save() {
  if (!props.league || !formValid.value || !leagueDetails.value) return

  saving.value = true
  error.value = null

  try {
    // Build request body with only changed fields
    const updateData: Record<string, unknown> = {}

    if (form.value.name !== leagueDetails.value.name) {
      updateData.name = form.value.name
    }
    if (form.value.slug !== leagueDetails.value.slug) {
      updateData.slug = form.value.slug
    }
    if (form.value.description !== (leagueDetails.value.description || '')) {
      updateData.description = form.value.description || null
    }
    if (form.value.logo_url !== (leagueDetails.value.logo_url || '')) {
      updateData.logo_url = form.value.logo_url || null
    }
    if (form.value.access_type !== leagueDetails.value.access_type) {
      updateData.access_type = form.value.access_type as 'open' | 'invite_only' | 'application'
    }

    // Skip if nothing changed
    if (Object.keys(updateData).length === 0) {
      close()
      return
    }

    await leaguesStore.updateLeague(props.league.league_id, updateData)

    emit('saved')
    close()
  } catch {
    error.value = leaguesStore.error || 'Failed to update league'
  } finally {
    saving.value = false
  }
}
</script>
