<template>
  <v-container class="py-8">
    <v-btn variant="text" to="/profile" class="mb-4">
      <v-icon start>mdi-arrow-left</v-icon>
      Back to Profile
    </v-btn>

    <h1 class="text-h3 mb-6">Edit Profile</h1>

    <v-progress-linear v-if="loading && !player" indeterminate class="mb-4" />

    <v-alert v-if="error" type="error" class="mb-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <v-alert v-if="successMessage" type="success" class="mb-4" closable @click:close="successMessage = null">
      {{ successMessage }}
    </v-alert>

    <v-row v-if="player">
      <!-- Avatar and Banner Section -->
      <v-col cols="12">
        <v-card class="mb-6">
          <v-card-title class="d-flex align-center">
            <v-icon start>mdi-image</v-icon>
            Profile Images
          </v-card-title>
          <v-divider />
          <v-card-text>
            <v-row>
              <v-col cols="12" md="4">
                <div class="text-subtitle-2 mb-2">Avatar</div>
                <ImageUpload
                  v-model="player.avatar_url"
                  placeholder="Upload avatar"
                  placeholder-icon="mdi-account-circle"
                  shape="circle"
                  :aspect-ratio="1"
                  :max-size="2"
                  path="/v1/players/me/avatar"
                  response-field="avatar_url"
                  @upload-complete="handleAvatarUploaded"
                  @upload-error="handleUploadError"
                />
              </v-col>
              <v-col cols="12" md="8">
                <div class="text-subtitle-2 mb-2">Banner</div>
                <ImageUpload
                  v-model="player.banner_url"
                  placeholder="Upload banner"
                  placeholder-icon="mdi-panorama"
                  shape="banner"
                  :aspect-ratio="3"
                  :max-size="5"
                  path="/v1/players/me/banner"
                  response-field="banner_url"
                  @upload-complete="handleBannerUploaded"
                  @upload-error="handleUploadError"
                />
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Basic Info Section -->
      <v-col cols="12" md="6">
        <v-card class="mb-6">
          <v-card-title class="d-flex align-center">
            <v-icon start>mdi-account</v-icon>
            Basic Information
          </v-card-title>
          <v-divider />
          <v-card-text>
            <v-form ref="basicForm" @submit.prevent="saveBasicInfo">
              <v-text-field
                v-model="form.display_name"
                label="Display Name"
                prepend-inner-icon="mdi-account-outline"
                :rules="[rules.required, rules.minLength(3), rules.maxLength(32)]"
                counter="32"
                class="mb-4"
              />

              <v-textarea
                v-model="form.bio"
                label="Bio"
                prepend-inner-icon="mdi-text"
                :rules="[rules.maxLength(500)]"
                counter="500"
                rows="3"
                class="mb-4"
              />

              <v-autocomplete
                v-model="form.country_code"
                label="Country"
                prepend-inner-icon="mdi-earth"
                :items="countries"
                item-title="name"
                item-value="code"
                clearable
                class="mb-4"
              />

              <v-text-field
                v-model="form.region"
                label="Region/State"
                prepend-inner-icon="mdi-map-marker"
                :rules="[rules.maxLength(64)]"
                class="mb-4"
              />

              <v-autocomplete
                v-model="form.timezone"
                label="Timezone"
                prepend-inner-icon="mdi-clock-outline"
                :items="timezones"
                clearable
                class="mb-4"
              />

              <v-text-field
                v-model="form.steam_id"
                label="Steam ID (SteamID64)"
                prepend-inner-icon="mdi-steam"
                :rules="[rules.steamId]"
                :readonly="!!player?.steam_id"
                :hint="player?.steam_id
                  ? 'Steam ID is permanently linked and cannot be changed.'
                  : 'Enter your SteamID64 (e.g., 76561198012345678). This cannot be changed later.'"
                persistent-hint
                placeholder="76561198012345678"
                class="mb-4"
              />

              <v-switch
                v-model="form.looking_for_team"
                label="Looking for Team"
                hint="Show other players that you're looking for a team to join"
                persistent-hint
                color="primary"
                class="mb-4"
              />

              <v-btn
                type="submit"
                color="primary"
                :loading="saving"
                :disabled="!hasBasicChanges"
              >
                Save Changes
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Social Links Section -->
      <v-col cols="12" md="6">
        <SocialLinksEditor
          v-model="form.social_links"
          class="mb-6"
        />
        <v-btn
          color="primary"
          :loading="savingSocial"
          :disabled="!hasSocialChanges"
          @click="saveSocialLinks"
        >
          Save Social Links
        </v-btn>
      </v-col>

      <!-- CS2 Match Tracking Section -->
      <v-col cols="12" md="6">
        <SteamTrackingCard />
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayersStore, type SocialLinks } from '@/stores/players'
import { useFormRules } from '@/composables/useFormRules'
import ImageUpload from '@/components/ImageUpload.vue'
import SocialLinksEditor from '@/components/SocialLinksEditor.vue'
import SteamTrackingCard from '@/components/SteamTrackingCard.vue'

const playersStore = usePlayersStore()

const loading = ref(true)
const saving = ref(false)
const savingSocial = ref(false)
const error = ref<string | null>(null)
const successMessage = ref<string | null>(null)

const { currentPlayer: player } = storeToRefs(playersStore)

const form = reactive({
  display_name: '',
  bio: '',
  country_code: '',
  region: '',
  timezone: '',
  steam_id: '',
  looking_for_team: false,
  social_links: {} as SocialLinks,
})

const originalForm = ref({
  display_name: '',
  bio: '',
  country_code: '',
  region: '',
  timezone: '',
  steam_id: '',
  looking_for_team: false,
  social_links: {} as SocialLinks,
})

const rules = {
  ...useFormRules(),
  steamId: (v: string) => {
    if (!v) return true
    if (!/^\d{17,20}$/.test(v)) return 'Must be a 17-20 digit SteamID64'
    return true
  },
}

const hasBasicChanges = computed(() => {
  return (
    form.display_name !== originalForm.value.display_name ||
    form.bio !== originalForm.value.bio ||
    form.country_code !== originalForm.value.country_code ||
    form.region !== originalForm.value.region ||
    form.timezone !== originalForm.value.timezone ||
    form.steam_id !== originalForm.value.steam_id ||
    form.looking_for_team !== originalForm.value.looking_for_team
  )
})

const hasSocialChanges = computed(() => {
  return JSON.stringify(form.social_links) !== JSON.stringify(originalForm.value.social_links)
})

// Common countries
const countries = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'PL', name: 'Poland' },
  { code: 'RU', name: 'Russia' },
  { code: 'CN', name: 'China' },
]

// Common timezones
const timezones = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
]

onMounted(async () => {
  try {
    await playersStore.fetchMyProfile()
    if (player.value) {
      populateForm()
    }
  } catch (e) {
    error.value = playersStore.error || 'Failed to load profile'
  } finally {
    loading.value = false
  }
})

watch(player, () => {
  if (player.value) {
    populateForm()
  }
})

function populateForm() {
  if (!player.value) return

  form.display_name = player.value.display_name || ''
  form.bio = player.value.bio || ''
  form.country_code = player.value.country_code || ''
  form.region = player.value.region || ''
  form.timezone = player.value.timezone || ''
  form.steam_id = player.value.steam_id || ''
  form.looking_for_team = player.value.looking_for_team ?? false
  form.social_links = player.value.social_links ? { ...player.value.social_links } : {}

  // Store original values for comparison
  originalForm.value = {
    display_name: form.display_name,
    bio: form.bio,
    country_code: form.country_code,
    region: form.region,
    timezone: form.timezone,
    steam_id: form.steam_id,
    looking_for_team: form.looking_for_team,
    social_links: { ...form.social_links },
  }
}

async function saveBasicInfo() {
  if (!hasBasicChanges.value) return

  saving.value = true
  error.value = null
  successMessage.value = null

  try {
    await playersStore.updateMyProfile({
      display_name: form.display_name || undefined,
      bio: form.bio || undefined,
      country_code: form.country_code || undefined,
      region: form.region || undefined,
      timezone: form.timezone || undefined,
      steam_id: (form.steam_id && form.steam_id !== originalForm.value.steam_id)
        ? form.steam_id : undefined,
      looking_for_team: form.looking_for_team,
    })
    successMessage.value = 'Profile updated successfully'
    populateForm()
  } catch (e) {
    error.value = playersStore.error || 'Failed to update profile'
  } finally {
    saving.value = false
  }
}

async function saveSocialLinks() {
  if (!hasSocialChanges.value) return

  savingSocial.value = true
  error.value = null
  successMessage.value = null

  try {
    await playersStore.updateMyProfile({
      social_links: form.social_links,
    })
    successMessage.value = 'Social links updated successfully'
    populateForm()
  } catch (e) {
    error.value = playersStore.error || 'Failed to update social links'
  } finally {
    savingSocial.value = false
  }
}

function handleAvatarUploaded() {
  successMessage.value = 'Avatar uploaded successfully'
}

function handleBannerUploaded() {
  successMessage.value = 'Banner uploaded successfully'
}

function handleUploadError(errorMsg: string) {
  error.value = errorMsg
}
</script>
