<template>
  <div v-if="maps.length > 0">
    <div class="d-flex justify-space-between align-center mb-2">
      <div>
        <span class="text-subtitle-2">{{ label }}</span>
        <v-chip
          size="x-small"
          class="ml-2"
          :color="isCustom ? 'primary' : 'default'"
          variant="tonal"
        >
          <template v-if="defaultPoolIds">
            {{ isCustom ? `Custom (${modelValue.length} maps)` : 'Using game default' }}
          </template>
          <template v-else>
            {{ modelValue.length }} / {{ maps.length }} maps
          </template>
        </v-chip>
      </div>
      <slot name="actions">
        <v-btn
          v-if="defaultPoolIds && isCustom"
          variant="text"
          size="small"
          @click="$emit('update:modelValue', [...defaultPoolIds])"
        >
          Reset to default
        </v-btn>
      </slot>
    </div>
    <v-row dense>
      <v-col v-for="map in maps" :key="map.id" cols="6" sm="4" md="3">
        <v-card
          :variant="isSelected(map.id) ? 'flat' : 'outlined'"
          :color="isSelected(map.id) ? 'primary' : undefined"
          class="pool-card"
          :class="{ 'pool-card--inactive': !isSelected(map.id) }"
          @click="toggle(map.id)"
        >
          <v-card-text class="text-center py-3 px-1">
            <v-icon
              :icon="isSelected(map.id) ? 'mdi-check-circle' : 'mdi-circle-outline'"
              :color="isSelected(map.id) ? 'white' : 'grey'"
              size="18"
              class="mb-1"
            />
            <div
              class="text-caption font-weight-medium"
              :class="isSelected(map.id) ? 'text-white' : ''"
            >
              {{ map.display_name }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface MapItem {
  id: string
  display_name: string
  image_url?: string | null
}

const props = withDefaults(defineProps<{
  maps: MapItem[]
  modelValue: string[]
  defaultPoolIds?: string[]
  label?: string
}>(), {
  label: 'Map Pool',
})

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const isCustom = computed(() => {
  if (!props.defaultPoolIds) return false
  const sorted = (ids: string[]) => JSON.stringify([...ids].sort())
  return sorted(props.modelValue) !== sorted(props.defaultPoolIds)
})

function isSelected(mapId: string) {
  return props.modelValue.includes(mapId)
}

function toggle(mapId: string) {
  const current = [...props.modelValue]
  const idx = current.indexOf(mapId)
  if (idx >= 0) {
    current.splice(idx, 1)
  } else {
    current.push(mapId)
  }
  emit('update:modelValue', current)
}
</script>

<style scoped>
.pool-card {
  cursor: pointer;
  transition: transform 0.1s, opacity 0.15s;
}
.pool-card:hover {
  transform: translateY(-1px);
}
.pool-card--inactive {
  opacity: 0.55;
}
</style>
