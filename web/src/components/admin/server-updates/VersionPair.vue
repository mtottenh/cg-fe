<template>
  <span class="d-inline-flex align-center ga-1 flex-wrap" data-testid="version-pair">
    <code :title="installed ? 'Installed' : 'Installed version unknown'">{{ installed ?? 'unknown' }}</code>
    <template v-if="available === true">
      <v-icon size="small">mdi-arrow-right</v-icon>
      <code title="Latest">{{ latest ?? 'unknown' }}</code>
      <v-chip
        size="x-small"
        color="info"
        variant="tonal"
        prepend-icon="mdi-arrow-up-bold"
        data-testid="update-available"
      >
        Update available
      </v-chip>
    </template>
    <span v-else-if="available === false" class="text-caption text-success">up to date</span>
    <span
      v-else-if="latest"
      class="text-caption text-medium-emphasis"
      title="The versions could not be compared"
    >
      latest {{ latest }}
    </span>
  </span>
</template>

<script setup lang="ts">
defineProps<{
  installed: string | null
  latest: string | null
  available: boolean | null
}>()
</script>
