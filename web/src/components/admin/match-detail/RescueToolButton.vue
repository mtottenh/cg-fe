<template>
  <!-- The span keeps the tooltip working while the button is disabled. -->
  <span class="d-inline-block">
    <v-btn
      :color="color"
      variant="tonal"
      :prepend-icon="icon"
      :disabled="!state.enabled"
      :loading="loading"
      :data-testid="testid"
      @click="$emit('run')"
    >
      <slot />
    </v-btn>
    <v-tooltip v-if="!state.enabled && state.why" activator="parent" location="top" max-width="320">
      {{ state.why }}
    </v-tooltip>
    <span v-if="!state.enabled && state.why" class="d-sr-only" :data-testid="`${testid}-why`">
      {{ state.why }}
    </span>
  </span>
</template>

<script setup lang="ts">
import type { ToolState } from '@/utils/matchRescue'

/** One rescue tool: enabled, or disabled with the reason on hover. */
withDefaults(defineProps<{
  state: ToolState
  testid: string
  icon?: string
  color?: string
  loading?: boolean
}>(), {
  icon: undefined,
  color: 'primary',
  loading: false,
})

defineEmits<{ run: [] }>()
</script>
