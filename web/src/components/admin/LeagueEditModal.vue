<template>
  <v-dialog
    :fullscreen="smAndDown"
    v-model="open"
    max-width="600"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Edit League: {{ league?.league_name }}</span>
        <v-btn aria-label="Close" icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text>
        <!-- Loading state while fetching full league details -->
        <div v-if="loadingDetails" class="text-center pa-8">
          <v-progress-circular indeterminate color="primary" />
          <p class="text-medium-emphasis mt-4">Loading league details...</p>
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
          aria-label="Access Type"
                v-model="form.access_type"
                :items="accessTypes"
                item-title="label"
                item-value="value"
                label="Access Type"
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

            <!-- Entry Requirements -->
            <v-col cols="12">
              <v-expansion-panels variant="accordion">
                <v-expansion-panel title="Entry Requirements">
                  <v-expansion-panel-text>
                    <v-row dense>
                      <v-col cols="6">
                        <v-text-field
                          v-model.number="form.min_rating"
                          label="Minimum Rating"
                          type="number"
                          variant="outlined"
                          density="compact"
                          clearable
                        />
                      </v-col>
                      <v-col cols="6">
                        <v-text-field
                          v-model.number="form.max_rating"
                          label="Maximum Rating"
                          type="number"
                          variant="outlined"
                          density="compact"
                          clearable
                        />
                      </v-col>
                      <v-col cols="6">
                        <v-text-field
                          v-model.number="form.max_peak_rating"
                          label="Max Peak Rating"
                          type="number"
                          variant="outlined"
                          density="compact"
                          clearable
                        />
                      </v-col>
                      <v-col cols="6">
                        <v-text-field
                          v-model.number="form.min_matches"
                          label="Min Matches Played"
                          type="number"
                          variant="outlined"
                          density="compact"
                          clearable
                        />
                      </v-col>
                    </v-row>
                  </v-expansion-panel-text>
                </v-expansion-panel>
              </v-expansion-panels>
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
import { useDisplay } from 'vuetify'
import { ref, watch } from 'vue'
import { useLeaguesStore, type UserLeagueMembership, type LeagueResponse } from '@/stores/leagues'
import { useFormRules } from '@/composables/useFormRules'
import {
  LEAGUE_ACCESS_TYPES,
  extractEligibilityForm,
  buildEligibilitySettings,
  type LeagueAccessType,
} from '@/composables/useLeagueEligibility'

// Long scrolling forms in a small floating dialog are unusable on phones.
const { smAndDown } = useDisplay()

// Store
const leaguesStore = useLeaguesStore()

const props = defineProps<{  league: UserLeagueMembership | null
}>()

const emit = defineEmits<{  saved: []
}>()

const open = defineModel<boolean>({ required: true })

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
  min_rating: null as number | null,
  max_rating: null as number | null,
  max_peak_rating: null as number | null,
  min_matches: null as number | null,
})

const accessTypes = LEAGUE_ACCESS_TYPES

const rules = useFormRules()

// Fetch full league details when dialog opens
watch(open, async (isOpen) => {
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

    // Populate form with league details. Eligibility fields are pulled out of
    // `settings.eligibility` by the shared extractor so the shape stays in
    // lockstep with the Create modal.
    form.value = {
      name: league.name,
      slug: league.slug,
      description: league.description || '',
      logo_url: league.logo_url || '',
      access_type: league.access_type,
      ...extractEligibilityForm(league.settings),
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
  open.value = false
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
      updateData.access_type = form.value.access_type as LeagueAccessType
    }

    // Build settings via shared helper — shape stays identical to the Create
    // modal. Send even when empty so callers can clear eligibility rules.
    const newSettings = buildEligibilitySettings(form.value)
    const currentSettings = leagueDetails.value.settings as Record<string, unknown> ?? {}
    if (JSON.stringify(newSettings) !== JSON.stringify(currentSettings)) {
      updateData.settings = newSettings
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
