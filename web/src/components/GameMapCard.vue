<template>
  <v-card
    :class="[
      'map-card',
      { 'map-card-banned': status === 'banned' },
      { 'map-card-picked': status === 'picked' || status === 'decider' },
      { 'map-card-selectable': selectable && !disabled },
    ]"
    :variant="!status || status === 'available' ? 'outlined' : 'flat'"
    :color="cardColor"
    :disabled="disabled"
    @click="selectable && !disabled && $emit('select')"
  >
    <v-img
      v-if="imageUrl"
      :src="imageUrl"
      height="80"
      cover
      class="align-end"
    >
      <div class="map-card-overlay pa-1">
        <div class="text-caption font-weight-bold text-white">{{ displayName }}</div>
      </div>
      <v-overlay
        v-if="status === 'banned'"
        :model-value="true"
        contained
        class="align-center justify-center"
        scrim="error"
        :opacity="0.6"
      >
        <v-icon size="32" color="white">mdi-close-thick</v-icon>
      </v-overlay>
      <v-overlay
        v-if="status === 'picked' || status === 'decider'"
        :model-value="true"
        contained
        class="align-center justify-center"
        scrim="success"
        :opacity="0.5"
      >
        <v-icon size="32" color="white">mdi-check-bold</v-icon>
      </v-overlay>
    </v-img>
    <template v-else>
      <v-card-text class="text-center py-6">
        <v-icon v-if="status === 'banned'" color="error" size="24" class="mb-1">mdi-close-thick</v-icon>
        <v-icon v-else-if="status === 'picked' || status === 'decider'" color="success" size="24" class="mb-1">mdi-check-bold</v-icon>
        <v-icon v-else size="24" class="mb-1">mdi-map</v-icon>
        <div class="text-caption font-weight-medium">{{ displayName }}</div>
        <div v-if="mapId !== displayName" class="text-caption text-medium-emphasis">{{ mapId }}</div>
      </v-card-text>
    </template>

    <!-- Status chip -->
    <div v-if="statusLabel" class="map-card-status">
      <v-chip
        :color="status === 'banned' ? 'error' : 'success'"
        size="x-small"
        variant="flat"
      >
        {{ statusLabel }}
      </v-chip>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  mapId: string
  displayName: string
  imageUrl?: string | null
  status?: 'available' | 'banned' | 'picked' | 'decider'
  gameNumber?: number | null
  selectable?: boolean
  disabled?: boolean
  statusLabel?: string
}>()

defineEmits<{
  select: []
}>()

const cardColor = computed(() => {
  if (props.status === 'banned') return 'error'
  if (props.status === 'picked' || props.status === 'decider') return 'success'
  return undefined
})
</script>

<style scoped>
.map-card {
  position: relative;
  cursor: default;
  transition: transform 0.15s, box-shadow 0.15s;
}

.map-card-selectable {
  cursor: pointer;
}

.map-card-selectable:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.map-card-overlay {
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
}

.map-card-status {
  position: absolute;
  top: 4px;
  right: 4px;
}
</style>
