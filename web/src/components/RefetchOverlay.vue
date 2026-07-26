<script setup lang="ts">
/**
 * Two-phase loading wrapper.
 *
 * Initial load (`loading && !hasContent`): renders a skeleton (when `skeleton`
 * is set) or a centered spinner placeholder.
 * Refetch (`loading && hasContent`): keeps the existing content visible under a
 * translucent contained overlay so the layout doesn't jump.
 */
defineProps<{
  loading: boolean
  hasContent: boolean
  /** v-skeleton-loader `type` for the initial load (e.g. "card@6", "article"). */
  skeleton?: string
  /** Message shown under the spinner during the initial load. */
  message?: string
}>()
</script>

<template>
  <v-skeleton-loader v-if="loading && !hasContent && skeleton" :type="skeleton" />
  <v-card v-else-if="loading && !hasContent" class="pa-8 text-center">
    <v-progress-circular indeterminate color="primary" size="48" />
    <p v-if="message" class="text-medium-emphasis mt-4">{{ message }}</p>
  </v-card>
  <div v-else class="position-relative">
    <v-overlay
      :model-value="loading && hasContent"
      contained
      class="align-center justify-center"
      scrim="rgba(0,0,0,0.3)"
    >
      <v-progress-circular indeterminate color="primary" />
    </v-overlay>
    <slot />
  </div>
</template>
