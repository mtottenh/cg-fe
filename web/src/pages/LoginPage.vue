<template>
  <v-container>
    <v-row justify="center">
      <v-col cols="12" sm="8" md="6" lg="4">
        <v-card class="pa-6">
          <v-card-title class="text-h4 text-center mb-4">Sign in</v-card-title>

          <!-- Steam is the ONLY sign-in method: accounts are Steam
               identities (matches, demos, and ranks all key off SteamID64),
               so a password path would only create orphaned accounts. -->
          <p class="text-body-2 text-medium-emphasis text-center mb-4">
            CS2 10 Mans uses your Steam account — no separate password.
          </p>

          <v-btn
            :href="steamUrl"
            color="blue-grey-darken-3"
            size="large"
            block
            prepend-icon="mdi-steam"
            data-testid="steam-login-button"
          >
            Sign in through Steam
          </v-btn>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { steamLoginUrl } from '@/utils/steamAuth'

const steamUrl = steamLoginUrl()
</script>
