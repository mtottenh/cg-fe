<template>
  <v-card>
    <v-card-title class="d-flex align-center">
      <v-icon start>mdi-controller</v-icon>
      CS2 Match Tracking
    </v-card-title>
    <v-divider />

    <v-progress-linear v-if="loading" indeterminate />

    <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
      {{ error }}
    </v-alert>

    <!-- State A: Not Registered -->
    <v-card-text v-if="!loading && !registered">
      <p class="text-body-2 mb-2">
        Enable automatic match tracking by entering your CS2 Game Authentication Code.
      </p>
      <!-- The in-game Settings menu does NOT expose these codes — Steam's
           help wizard is the only reliable place to mint/view both. -->
      <p class="text-body-2 mb-4">
        Get both codes from
        <a
          href="https://help.steampowered.com/en/wizard/HelpWithGameIssue/?appid=730&issueid=128&ref=cs210mans.uk"
          target="_blank"
          rel="noopener noreferrer"
        >Steam's Game Authentication Code page</a>
        (sign in with the same Steam account you play CS2 on).
      </p>

      <v-form ref="registerForm" @submit.prevent="handleRegister">
        <v-text-field
          v-model="gameAuthCode"
          label="Game Auth Code"
          placeholder="XXXX-XXXXX-XXXX"
          prepend-inner-icon="mdi-key"
          :rules="[rules.required]"
          class="mb-2"
        />

        <v-text-field
          v-model="initialShareCode"
          label="Latest Share Code (optional)"
          placeholder="CSGO-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx"
          prepend-inner-icon="mdi-share-variant"
          hint="Your most recent match share code — shown on the same Steam page."
          persistent-hint
          class="mb-4"
        />

        <v-btn
          type="submit"
          color="primary"
          :loading="saving"
        >
          Enable Match Tracking
        </v-btn>
      </v-form>
    </v-card-text>

    <!-- State B: Tracking Active -->
    <v-card-text v-if="!loading && registered && tracking">
      <v-list density="compact" class="mb-4">
        <v-list-item>
          <template #prepend><v-icon>mdi-key</v-icon></template>
          <v-list-item-title>Auth Code</v-list-item-title>
          <v-list-item-subtitle>{{ tracking.game_auth_code_prefix }}</v-list-item-subtitle>
        </v-list-item>

        <v-list-item>
          <template #prepend><v-icon>mdi-check-circle</v-icon></template>
          <v-list-item-title>Status</v-list-item-title>
          <v-list-item-subtitle>
            <v-chip :color="tracking.is_active ? 'success' : 'warning'" size="small">
              {{ tracking.is_active ? 'Active' : 'Inactive' }}
            </v-chip>
          </v-list-item-subtitle>
        </v-list-item>

        <v-list-item v-if="tracking.last_poll_at">
          <template #prepend><v-icon>mdi-clock-outline</v-icon></template>
          <v-list-item-title>Last Polled</v-list-item-title>
          <v-list-item-subtitle>{{ formatDateTime(tracking.last_poll_at) }}</v-list-item-subtitle>
        </v-list-item>

        <v-list-item v-if="tracking.poll_errors > 0">
          <template #prepend><v-icon color="warning">mdi-alert</v-icon></template>
          <v-list-item-title>Poll Errors</v-list-item-title>
          <v-list-item-subtitle>{{ tracking.poll_errors }}</v-list-item-subtitle>
        </v-list-item>

        <v-list-item v-if="tracking.last_error">
          <template #prepend><v-icon color="error">mdi-alert-circle</v-icon></template>
          <v-list-item-title>Last Error</v-list-item-title>
          <v-list-item-subtitle>{{ tracking.last_error }}</v-list-item-subtitle>
        </v-list-item>
      </v-list>

      <!-- Update Auth Code -->
      <v-expansion-panels class="mb-4">
        <v-expansion-panel title="Update Auth Code">
          <v-expansion-panel-text>
            <v-form @submit.prevent="handleUpdate">
              <v-text-field
                v-model="newAuthCode"
                label="New Game Auth Code"
                placeholder="XXXX-XXXXX-XXXX"
                prepend-inner-icon="mdi-key"
                :rules="[rules.required]"
                class="mb-2"
              />
              <v-btn type="submit" color="primary" :loading="saving" size="small">
                Save
              </v-btn>
            </v-form>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <v-btn color="error" variant="outlined" :loading="saving" @click="handleDelete">
        Stop Tracking
      </v-btn>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSteamTracking } from '@/composables/useSteamTracking'
import { useFormRules } from '@/composables/useFormRules'
import { formatDateTime } from '@/utils/formatters'

const {
  tracking,
  loading,
  saving,
  error,
  registered,
  fetchTracking,
  register,
  updateAuthCode,
  deleteTracking,
} = useSteamTracking()

const gameAuthCode = ref('')
const initialShareCode = ref('')
const newAuthCode = ref('')

const rules = useFormRules()

onMounted(() => {
  fetchTracking()
})

async function handleRegister() {
  if (!gameAuthCode.value) return
  try {
    await register(gameAuthCode.value, initialShareCode.value || undefined)
    gameAuthCode.value = ''
    initialShareCode.value = ''
  } catch {
    // error is set by composable
  }
}

async function handleUpdate() {
  if (!newAuthCode.value) return
  try {
    await updateAuthCode(newAuthCode.value)
    newAuthCode.value = ''
  } catch {
    // error is set by composable
  }
}

async function handleDelete() {
  try {
    await deleteTracking()
  } catch {
    // error is set by composable
  }
}

</script>
