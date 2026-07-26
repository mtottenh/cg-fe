<script setup lang="ts">
withDefaults(
  defineProps<{
    icon?: string
    title: string
    subtitle?: string
    /** Card variant; use "text" when nesting inside another card/table. */
    variant?: 'outlined' | 'text' | 'flat'
  }>(),
  { icon: undefined, subtitle: undefined, variant: 'outlined' }
)
</script>

<template>
  <v-card class="text-center pa-8" :variant="variant">
    <v-icon v-if="icon" :icon="icon" size="64" color="grey" />
    <h3 class="text-h6 mt-4">{{ title }}</h3>
    <div v-if="subtitle" class="text-body-2 text-medium-emphasis mt-2">{{ subtitle }}</div>
    <slot name="action" />
  </v-card>
</template>
