<template>
  <v-navigation-drawer v-model="open" :rail="rail" permanent color="surface">
    <v-list density="compact" nav>
      <v-list-item
        prepend-icon="mdi-view-dashboard"
        title="Dashboard"
        :to="{ name: 'admin-dashboard' }"
        :active="route.name === 'admin-dashboard'"
      />

      <v-list-subheader v-if="!rail">Games & Leagues</v-list-subheader>

      <v-list-item
        prepend-icon="mdi-gamepad-variant"
        title="Games"
        :to="{ name: 'admin-games' }"
        :active="route.name?.toString().startsWith('admin-games')"
      />

      <v-list-item
        prepend-icon="mdi-trophy"
        title="Leagues"
        :to="{ name: 'admin-leagues' }"
        :active="route.name?.toString().startsWith('admin-leagues')"
      />

      <v-list-item
        prepend-icon="mdi-tournament"
        title="Tournaments"
        :to="{ name: 'admin-tournaments' }"
        :active="route.name?.toString().startsWith('admin-tournaments')"
      />

      <v-list-subheader v-if="!rail">Content</v-list-subheader>

      <v-list-item
        prepend-icon="mdi-file-video"
        title="Demos"
        :to="{ name: 'admin-demos' }"
        :active="route.name?.toString().startsWith('admin-demo')"
      />

      <v-list-subheader v-if="!rail">Infrastructure</v-list-subheader>

      <v-list-item
        prepend-icon="mdi-server-network"
        title="Game Servers"
        :to="{ name: 'admin-game-servers' }"
        :active="route.name?.toString().startsWith('admin-game-servers')"
      />

      <v-list-subheader v-if="!rail">Players & Moderation</v-list-subheader>

      <v-list-item
        prepend-icon="mdi-account-group"
        title="Players"
        :to="{ name: 'admin-players' }"
        :active="route.name?.toString().startsWith('admin-players')"
      />

      <v-list-item
        prepend-icon="mdi-gavel"
        title="Bans"
        :to="{ name: 'admin-bans' }"
        :active="route.name?.toString().startsWith('admin-bans')"
      />

      <v-list-item
        prepend-icon="mdi-alert-decagram"
        title="Disputes"
        :to="{ name: 'admin-disputes' }"
        :active="route.name?.toString().startsWith('admin-disputes')"
      />

      <v-list-item
        prepend-icon="mdi-clipboard-check"
        title="Result Reviews"
        :to="{ name: 'admin-result-reviews' }"
        :active="route.name?.toString().startsWith('admin-result-reviews')"
      />

      <v-list-item
        prepend-icon="mdi-shield-key"
        title="Permissions"
        :to="{ name: 'admin-permissions' }"
        :active="route.name?.toString().startsWith('admin-permissions')"
      />

      <v-list-subheader v-if="!rail">System</v-list-subheader>

      <v-list-item
        prepend-icon="mdi-cog"
        title="Settings"
        :to="{ name: 'admin-settings' }"
        :active="route.name === 'admin-settings'"
        disabled
      />
    </v-list>

    <template v-slot:append>
      <v-list density="compact" nav>
        <v-list-item
          :prepend-icon="rail ? 'mdi-chevron-right' : 'mdi-chevron-left'"
          :title="rail ? '' : 'Collapse'"
          @click="$emit('update:rail', !rail)"
        />
      </v-list>
    </template>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

defineProps<{
  rail: boolean
}>()

defineEmits<{
  'update:rail': [value: boolean]
}>()

const open = defineModel<boolean>({ required: true })
</script>
