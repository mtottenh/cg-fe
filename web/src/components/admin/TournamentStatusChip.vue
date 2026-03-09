<template>
  <v-chip :color="color" :variant="variant" :size="size">
    <v-icon v-if="showIcon" start :size="iconSize">{{ icon }}</v-icon>
    {{ label }}
  </v-chip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { tournamentStatusMap, getStatusColor, getStatusLabel, getStatusIcon } from '@/utils/statusMaps'

const props = withDefaults(
  defineProps<{
    status: string
    size?: 'x-small' | 'small' | 'default' | 'large' | 'x-large'
    variant?: 'flat' | 'text' | 'elevated' | 'tonal' | 'outlined' | 'plain'
    showIcon?: boolean
  }>(),
  {
    size: 'small',
    variant: 'flat',
    showIcon: false,
  }
)

const color = computed(() => getStatusColor(tournamentStatusMap, props.status))
const label = computed(() => getStatusLabel(tournamentStatusMap, props.status))
const icon = computed(() => getStatusIcon(tournamentStatusMap, props.status))

const iconSize = computed(() => {
  switch (props.size) {
    case 'x-small':
      return 12
    case 'small':
      return 14
    case 'default':
      return 16
    case 'large':
      return 18
    case 'x-large':
      return 20
    default:
      return 14
  }
})
</script>
