<script setup lang="ts">
defineProps<{
  icon?: string
  title: string
  subtitle?: string
}>()
</script>

<template>
  <v-card class="text-center pa-8" variant="outlined">
    <v-icon v-if="icon" :icon="icon" size="64" color="grey" />
    <div class="text-h6 mt-4">{{ title }}</div>
    <div v-if="subtitle" class="text-body-2 text-grey mt-2">{{ subtitle }}</div>
    <slot name="action" />
  </v-card>
</template>
