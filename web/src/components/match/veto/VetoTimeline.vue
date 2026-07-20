<template>
  <div>
    <div class="text-subtitle-2 mb-2">Veto History</div>
    <v-timeline density="compact" side="end">
      <v-timeline-item
        v-for="action in actions"
        :key="action.id"
        :dot-color="dotColor(action)"
        size="x-small"
      >
        <div class="d-flex align-center ga-2">
          <v-icon :color="dotColor(action)" size="small">{{ actionIcon(action) }}</v-icon>
          <span class="text-body-2">
            <strong>{{ getTeamName(action.performed_by_registration_id) }}</strong>
            {{ actionVerb(action) }}
            <strong>{{ getMapName(action.map_id) }}</strong>
          </span>
          <v-chip v-if="action.side_selection" size="x-small" variant="tonal">
            {{ action.side_selection.toUpperCase() }}
          </v-chip>
          <v-chip v-if="action.was_auto_action" size="x-small" color="warning" variant="tonal">
            Auto
          </v-chip>
        </div>
      </v-timeline-item>
    </v-timeline>
  </div>
</template>

<script setup lang="ts">
import type { VetoActionResponse, MapStatusResponse } from '@/stores/veto'

const props = defineProps<{
  actions: VetoActionResponse[]
  maps: MapStatusResponse[]
  participant1RegistrationId: string | null | undefined
  participant1Name: string
  participant2RegistrationId: string | null | undefined
  participant2Name: string
}>()

function getTeamName(registrationId: string | null | undefined): string {
  if (!registrationId) return 'System'
  if (registrationId === props.participant1RegistrationId) return props.participant1Name
  if (registrationId === props.participant2RegistrationId) return props.participant2Name
  return 'Unknown'
}

function getMapName(mapId: string): string {
  const map = props.maps.find(m => m.map_id === mapId)
  return map?.map_name || mapId
}

function dotColor(action: VetoActionResponse): string {
  if (action.action_type === 'ban') return 'error'
  if (action.action_type === 'pick') return 'success'
  if (action.action_type === 'decider') return 'info'
  return 'grey'
}

function actionIcon(action: VetoActionResponse): string {
  if (action.action_type === 'ban') return 'mdi-close-circle'
  if (action.action_type === 'pick') return 'mdi-check-circle'
  if (action.action_type === 'decider') return 'mdi-star-circle'
  return 'mdi-circle'
}

function actionVerb(action: VetoActionResponse): string {
  if (action.action_type === 'ban') return 'banned'
  if (action.action_type === 'pick') return 'picked'
  if (action.action_type === 'decider') return 'decider:'
  return action.action_type
}
</script>
