<template>
  <div class="d-flex align-center ga-2 py-1" :data-testid="`pug-player-${player.player_id}`">
    <v-avatar size="28">
      <v-img v-if="player.avatar_url" :src="player.avatar_url" :alt="player.display_name" />
      <v-icon v-else icon="mdi-account" size="small" />
    </v-avatar>
    <span class="text-body-2">{{ player.display_name }}</span>
    <v-icon
      v-if="player.is_captain"
      icon="mdi-star"
      size="small"
      color="amber"
      aria-label="Captain"
    />
    <v-tooltip v-if="!player.has_steam_id" location="top">
      <template #activator="{ props: tooltipProps }">
        <v-icon
          v-bind="tooltipProps"
          icon="mdi-steam"
          size="small"
          color="error"
          aria-label="No linked Steam account"
        />
      </template>
      No linked Steam account — cannot enter the server
    </v-tooltip>
    <v-spacer />
    <v-menu v-if="isCreator && editable">
      <template #activator="{ props: menuProps }">
        <v-btn
          v-bind="menuProps"
          icon="mdi-dots-vertical"
          size="x-small"
          variant="text"
          :aria-label="`Manage ${player.display_name}`"
        />
      </template>
      <v-list density="compact">
        <v-list-item
          v-if="player.team !== 1"
          prepend-icon="mdi-numeric-1-circle"
          title="Move to Team 1"
          @click="emit('move', 1)"
        />
        <v-list-item
          v-if="player.team !== 2"
          prepend-icon="mdi-numeric-2-circle"
          title="Move to Team 2"
          @click="emit('move', 2)"
        />
        <v-list-item
          v-if="player.team != null"
          prepend-icon="mdi-seat-outline"
          title="Move to bench"
          @click="emit('move', null)"
        />
        <v-list-item
          :prepend-icon="player.is_captain ? 'mdi-star-off' : 'mdi-star'"
          :title="player.is_captain ? 'Remove captain' : 'Make captain'"
          @click="emit('toggle-captain')"
        />
        <v-divider />
        <v-list-item
          prepend-icon="mdi-account-remove"
          title="Kick"
          base-color="error"
          @click="emit('kick')"
        />
      </v-list>
    </v-menu>
  </div>
</template>

<script setup lang="ts">
import type { components } from '@/api/types'

defineProps<{
  player: components['schemas']['PugPlayerResponse']
  isCreator: boolean
  editable: boolean
}>()

const emit = defineEmits<{
  kick: []
  'toggle-captain': []
  move: [team: 1 | 2 | null]
}>()
</script>
