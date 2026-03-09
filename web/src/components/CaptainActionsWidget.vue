<template>
  <v-card v-if="actionCount > 0">
    <v-card-title class="d-flex align-center">
      <v-icon start>mdi-bell-badge-outline</v-icon>
      Action Items
      <v-badge
        :content="actionCount"
        :color="hasCritical ? 'error' : 'warning'"
        inline
        class="ml-2"
      />
    </v-card-title>
    <v-card-text>
      <v-list density="compact">
        <CaptainActionItem
          v-for="action in actions.slice(0, 5)"
          :key="`${action.match_id}-${action.action_type}`"
          :action="action"
        />
      </v-list>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useCaptainActionsStore } from '@/stores/captainActions'
import CaptainActionItem from '@/components/CaptainActionItem.vue'

const store = useCaptainActionsStore()
const { sortedActions: actions, actionCount, hasCritical } = storeToRefs(store)
</script>
