<template>
  <v-container>
    <v-row justify="center">
      <v-col cols="12" sm="8" md="6" lg="4">
        <v-card class="pa-6 text-center">
          <template v-if="error">
            <v-card-title class="text-h5 mb-2">Steam sign-in failed</v-card-title>
            <v-alert type="error" class="mb-4" data-testid="steam-complete-error">
              {{ error }}
            </v-alert>
            <v-btn color="primary" to="/login" data-testid="steam-complete-back-to-login">
              Back to login
            </v-btn>
          </template>
          <template v-else>
            <v-progress-circular indeterminate color="primary" size="48" class="mb-4" />
            <div class="text-body-1" data-testid="steam-complete-pending">
              Completing Steam sign-in…
            </div>
          </template>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { parseSteamCallbackFragment } from '@/utils/steamAuth'

const authStore = useAuthStore()
const router = useRouter()

const error = ref<string | null>(null)

onMounted(async () => {
  const tokens = parseSteamCallbackFragment(window.location.hash)

  // Clear the fragment immediately so the tokens don't linger in the
  // address bar / browser history.
  if (window.location.hash) {
    history.replaceState(history.state, '', window.location.pathname + window.location.search)
  }

  if (!tokens) {
    error.value = 'No sign-in tokens were provided. Please start again from the login page.'
    return
  }

  try {
    await authStore.loginWithTokens(tokens.accessToken, tokens.refreshToken)
    router.replace('/')
  } catch {
    error.value = authStore.error || 'Steam sign-in failed. Please try again.'
  }
})
</script>
