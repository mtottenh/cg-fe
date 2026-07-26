<script setup lang="ts">
defineProps<{
  error: string | null
  retryable?: boolean
}>()

defineEmits<{
  clear: []
  retry: []
}>()
</script>

<template>
  <v-alert
    v-if="error"
    type="error"
    closable
    class="mb-4"
    @click:close="$emit('clear')"
  >
    {{ error }}
    <template v-if="retryable" #append>
      <v-btn variant="text" size="small" @click="$emit('retry')">Retry</v-btn>
    </template>
  </v-alert>
</template>
