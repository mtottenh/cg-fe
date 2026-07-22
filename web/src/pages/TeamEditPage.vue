<template>
  <v-container>
    <v-btn variant="text" :to="`/teams/${teamId}`" class="mb-4">
      <v-icon start>mdi-arrow-left</v-icon>
      Back to Team
    </v-btn>

    <v-progress-linear v-if="loading" indeterminate class="mb-4" />

    <v-alert v-if="error" type="error" class="mb-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <v-alert v-if="isNewTeam" type="info" class="mb-4" closable>
      Team created! Now you can add a logo, banner, and customize your team's appearance.
    </v-alert>

    <!--
      Non-owners get this notice INSTEAD of the form (COVERAGE-PLAN §9b P-13).
      `onMounted` bails before populating `form` for a non-owner, so gating the
      form on `team` alone rendered a full, blank, editable form next to the
      "not the owner" message. Ownership is the render gate, and it is a
      computed rather than a one-shot flag so it stays correct if the store's
      `currentTeam` changes underneath us (e.g. ownership transferred in
      another tab, or a route change reusing this component).
    -->
    <v-alert v-if="!loading && team && !isOwner" type="warning" class="mb-4">
      Only the team owner can edit team settings
    </v-alert>

    <template v-if="team && isOwner">
      <v-row>
        <v-col cols="12" md="8">
          <v-card class="mb-4">
            <v-card-title class="text-h5">
              <v-icon start>mdi-pencil</v-icon>
              Edit Team Settings
            </v-card-title>
            <v-divider />
            <v-card-text>
              <v-form @submit.prevent="handleSubmit">
                <!-- Basic Info Section -->
                <div class="text-subtitle-1 font-weight-bold mb-4">Basic Information</div>

                <v-text-field
                  v-model="form.name"
                  label="Team Name"
                  prepend-inner-icon="mdi-account-group"
                  :rules="[rules.required, rules.minLength(2), rules.maxLength(64)]"
                  class="mb-2"
                />

                <v-text-field
                  v-model="form.tag"
                  label="Team Tag"
                  prepend-inner-icon="mdi-tag"
                  :rules="[rules.required, rules.minLength(2), rules.maxLength(8)]"
                  class="mb-2"
                  @input="form.tag = form.tag.toUpperCase()"
                />

                <v-textarea
                  v-model="form.description"
                  label="Description"
                  prepend-inner-icon="mdi-text"
                  rows="3"
                  class="mb-4"
                  hint="Tell others about your team"
                />

                <v-divider class="my-6" />

                <!-- Branding Section -->
                <div class="text-subtitle-1 font-weight-bold mb-4">Team Branding</div>

                <v-row>
                  <v-col cols="12" sm="6">
                    <div class="text-caption text-medium-emphasis mb-2">Team Logo</div>
                    <ImageUpload
                      v-model="form.logo_url"
                      placeholder="Upload logo"
                      placeholder-icon="mdi-image"
                      shape="square"
                      :aspect-ratio="1"
                      path="/v1/league-teams/{team_id}/logo"
                      :path-params="{ team_id: teamId }"
                      response-field="logo_url"
                      @upload-complete="onLogoUploaded"
                      @upload-error="onUploadError"
                    />
                  </v-col>
                  <v-col cols="12" sm="6">
                    <div class="text-caption text-medium-emphasis mb-2">Team Banner</div>
                    <ImageUpload
                      v-model="form.banner_url"
                      placeholder="Upload banner"
                      placeholder-icon="mdi-panorama-wide-angle"
                      shape="banner"
                      :aspect-ratio="3"
                      path="/v1/league-teams/{team_id}/banner"
                      :path-params="{ team_id: teamId }"
                      response-field="banner_url"
                      @upload-complete="onBannerUploaded"
                      @upload-error="onUploadError"
                    />
                  </v-col>
                </v-row>

                <v-divider class="my-6" />

                <!-- Colors Section -->
                <div class="text-subtitle-1 font-weight-bold mb-4">Team Colors</div>

                <v-row>
                  <v-col cols="12" sm="6">
                    <ColorPicker
                      v-model="form.primary_color"
                      label="Primary Color"
                      hint="Main team color"
                    />
                  </v-col>
                  <v-col cols="12" sm="6">
                    <ColorPicker
                      v-model="form.secondary_color"
                      label="Secondary Color"
                      hint="Accent color"
                    />
                  </v-col>
                </v-row>

                <v-divider class="my-6" />

                <!-- Links Section -->
                <div class="text-subtitle-1 font-weight-bold mb-4">Links</div>

                <v-text-field
                  v-model="form.website_url"
                  label="Website URL"
                  prepend-inner-icon="mdi-web"
                  type="url"
                  :rules="[rules.url]"
                  placeholder="https://yourteam.com"
                  class="mb-4"
                />

                <v-divider class="my-6" />

                <div class="d-flex ga-3">
                  <v-btn
                    type="submit"
                    color="primary"
                    size="large"
                    :loading="saving"
                    :disabled="!hasChanges"
                  >
                    <v-icon start>mdi-content-save</v-icon>
                    Save Changes
                  </v-btn>
                  <v-btn
                    variant="outlined"
                    size="large"
                    :to="`/teams/${teamId}`"
                  >
                    Cancel
                  </v-btn>
                </div>
              </v-form>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="4">
          <!-- Preview Card -->
          <v-card>
            <v-card-title class="text-subtitle-1">
              <v-icon start size="small">mdi-eye</v-icon>
              Preview
            </v-card-title>
            <v-divider />
            <div
              v-if="form.banner_url"
              class="banner-preview"
              :style="{ backgroundImage: `url(${form.banner_url})` }"
            />
            <v-card-item>
              <template v-slot:prepend>
                <v-avatar
                  :color="form.primary_color || 'primary'"
                  size="56"
                >
                  <v-img alt="Team logo preview" v-if="form.logo_url" :src="form.logo_url" />
                  <span v-else class="text-h6">{{ (form.tag || 'TM').substring(0, 2) }}</span>
                </v-avatar>
              </template>
              <v-card-title>{{ form.name || 'Team Name' }}</v-card-title>
              <v-card-subtitle>[{{ form.tag || 'TAG' }}]</v-card-subtitle>
            </v-card-item>
            <v-card-text v-if="form.description" class="text-body-2">
              {{ form.description }}
            </v-card-text>
            <v-card-text v-if="form.primary_color || form.secondary_color">
              <div class="d-flex ga-2 align-center">
                <span class="text-caption text-medium-emphasis">Colors:</span>
                <div
                  v-if="form.primary_color"
                  class="color-swatch"
                  :style="{ backgroundColor: form.primary_color }"
                />
                <div
                  v-if="form.secondary_color"
                  class="color-swatch"
                  :style="{ backgroundColor: form.secondary_color }"
                />
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <!-- Success Snackbar -->
    <v-snackbar v-model="showSuccess" color="success" :timeout="3000">
      {{ successMessage }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'
import { useLeagueTeamsStore } from '@/stores/leagueTeams'
import { useAuthStore } from '@/stores/auth'
import { useFormRules } from '@/composables/useFormRules'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import ImageUpload from '@/components/ImageUpload.vue'
import ColorPicker from '@/components/ColorPicker.vue'

const route = useRoute()
const leagueTeamsStore = useLeagueTeamsStore()
const authStore = useAuthStore()

const teamId = computed(() => route.params.id as string)
const isNewTeam = computed(() => route.query.newTeam === 'true')

const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const showSuccess = ref(false)
const successMessage = ref('')

const { currentTeam: team } = storeToRefs(leagueTeamsStore)

// Check if current user is the team owner
const { playerId: currentPlayerId } = storeToRefs(authStore)
const isOwner = computed(() => team.value?.owner_player_id === currentPlayerId.value)

const form = reactive({
  name: '',
  tag: '',
  description: '',
  logo_url: null as string | null,
  banner_url: null as string | null,
  primary_color: null as string | null,
  secondary_color: null as string | null,
  website_url: '',
})

const originalForm = ref<typeof form | null>(null)

const hasChanges = computed(() => {
  if (!originalForm.value) return false
  return (
    form.name !== originalForm.value.name ||
    form.tag !== originalForm.value.tag ||
    form.description !== originalForm.value.description ||
    form.logo_url !== originalForm.value.logo_url ||
    form.banner_url !== originalForm.value.banner_url ||
    form.primary_color !== originalForm.value.primary_color ||
    form.secondary_color !== originalForm.value.secondary_color ||
    form.website_url !== originalForm.value.website_url
  )
})

const rules = useFormRules()

useUnsavedChanges(hasChanges)

onMounted(async () => {
  try {
    await leagueTeamsStore.fetchTeam(teamId.value)

    // Non-owner: leave `form` unpopulated and let the template render the
    // ownership notice instead of the form. `error` is reserved for genuine
    // load failures — using it here produced two competing messages once the
    // notice became its own alert.
    if (!isOwner.value) {
      return
    }

    // Initialize form with team data
    if (team.value) {
      form.name = team.value.name
      form.tag = team.value.tag
      form.description = team.value.description || ''
      form.logo_url = team.value.logo_url || null
      form.banner_url = team.value.banner_url || null
      form.primary_color = team.value.primary_color || null
      form.secondary_color = team.value.secondary_color || null
      // website_url is not in the TeamResponse type - initialize to empty
      form.website_url = ''

      // Store original for change detection
      originalForm.value = { ...form }
    }
  } catch {
    error.value = leagueTeamsStore.error || 'Failed to load team'
  } finally {
    loading.value = false
  }
})

// Watch for team updates (from image uploads)
watch(team, (newTeam) => {
  if (newTeam) {
    form.logo_url = newTeam.logo_url || null
    form.banner_url = newTeam.banner_url || null
  }
})

async function handleSubmit() {
  saving.value = true
  error.value = null

  try {
    await leagueTeamsStore.updateTeam(teamId.value, {
      name: form.name,
      tag: form.tag,
      description: form.description || undefined,
      primary_color: form.primary_color || undefined,
      secondary_color: form.secondary_color || undefined,
    })

    // Update original form to reflect saved state
    originalForm.value = { ...form }

    successMessage.value = 'Team settings saved'
    showSuccess.value = true
  } catch {
    error.value = leagueTeamsStore.error || 'Failed to save team settings'
  } finally {
    saving.value = false
  }
}

function onLogoUploaded(url: string) {
  form.logo_url = url
  successMessage.value = 'Logo uploaded'
  showSuccess.value = true
}

function onBannerUploaded(url: string) {
  form.banner_url = url
  successMessage.value = 'Banner uploaded'
  showSuccess.value = true
}

function onUploadError(errorMsg: string) {
  error.value = errorMsg
}
</script>

<style scoped>
.banner-preview {
  height: 100px;
  background-size: cover;
  background-position: center;
}

.color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.12);
}
</style>
