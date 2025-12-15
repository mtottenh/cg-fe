<script setup lang="ts">
defineProps<{
  loading: boolean
}>()
</script>

<template>
  <v-overlay :model-value="loading" class="align-center justify-center" persistent>
    <v-progress-circular indeterminate size="64" color="primary" />
  </v-overlay>
</template>
