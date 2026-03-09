<template>
  <v-card class="mb-4" variant="tonal">
    <v-card-text class="d-flex align-center flex-wrap gap-3 py-2">
      <!-- Connected indicator -->
      <div class="d-flex align-center gap-1">
        <v-icon :color="connected ? 'success' : 'grey'" size="x-small">mdi-circle</v-icon>
        <span class="text-caption">{{ connected ? 'Live' : 'Disconnected' }}</span>
      </div>

      <v-divider vertical class="mx-1" />

      <!-- Participants -->
      <div v-for="p in participants" :key="p.registration_id" class="d-flex align-center gap-1">
        <v-icon :color="p.connected ? 'success' : 'grey-lighten-1'" size="x-small">
          {{ p.connected ? 'mdi-circle' : 'mdi-circle-outline' }}
        </v-icon>
        <span class="text-caption" :class="{ 'text-grey': !p.connected }">
          {{ p.username }}
        </span>
        <v-chip size="x-small" variant="text" class="text-caption text-medium-emphasis">
          {{ p.team_name }}
        </v-chip>
      </div>

      <v-spacer />

      <!-- Spectators -->
      <div v-if="spectatorCount > 0" class="d-flex align-center gap-1">
        <v-icon size="small" color="grey">mdi-eye</v-icon>
        <span class="text-caption text-grey">{{ spectatorCount }} watching</span>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import type { LobbyParticipant } from '@/composables/useMatchLobby'

defineProps<{
  participants: LobbyParticipant[]
  spectatorCount: number
  connected: boolean
}>()
</script>
