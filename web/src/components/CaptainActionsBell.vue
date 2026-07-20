<template>
  <v-menu location="bottom end" :close-on-content-click="true" max-height="400" min-width="340">
    <template v-slot:activator="{ props: menuProps }">
      <v-btn aria-label="Captain actions" variant="text" icon v-bind="menuProps">
        <v-badge
          v-if="actionCount > 0"
          :content="actionCount"
          :color="hasCritical ? 'error' : 'warning'"
        >
          <v-icon>mdi-bell-outline</v-icon>
        </v-badge>
        <v-icon v-else>mdi-bell-outline</v-icon>
        <v-tooltip activator="parent" location="bottom">Action Items</v-tooltip>
      </v-btn>
    </template>

    <v-card>
      <v-card-title class="d-flex align-center text-subtitle-1 py-2 px-4">
        Action Items
        <v-badge
          v-if="actionCount > 0"
          :content="actionCount"
          color="primary"
          inline
          class="ml-2"
        />
      </v-card-title>
      <v-divider />
      <v-list v-if="actions.length > 0" density="compact" nav>
        <CaptainActionItem
          v-for="action in actions"
          :key="`${action.match_id}-${action.action_type}`"
          :action="action"
        />
      </v-list>
      <v-card-text v-else class="text-center py-6">
        <v-icon size="32" color="success">mdi-check-circle-outline</v-icon>
        <p class="text-caption text-medium-emphasis mt-2">All caught up!</p>
      </v-card-text>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import { useCaptainActions } from '@/composables/useCaptainActions'
import CaptainActionItem from '@/components/CaptainActionItem.vue'

const { actions, actionCount, hasCritical } = useCaptainActions()
</script>
