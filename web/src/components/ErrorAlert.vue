<script setup lang="ts">
defineProps<{
  error: string | null
}>()

defineEmits<{
  dismiss: []
}>()
</script>

<template>
  <v-alert
    v-if="error"
    type="error"
    closable
    class="mb-4"
    @click:close="$emit('dismiss')"
  >
    {{ error }}
  </v-alert>
</template>
