<template>
  <span class="d-inline-flex flex-wrap ga-1 align-center" data-testid="load-health">
    <v-chip
      v-for="p in plugins"
      :key="p.key"
      size="x-small"
      variant="tonal"
      :color="p.ok === true ? 'success' : p.ok === false ? 'error' : 'grey'"
      :prepend-icon="p.ok === true ? 'mdi-check' : p.ok === false ? 'mdi-close' : 'mdi-help'"
      :title="p.ok === true ? `${p.label} loaded` : p.ok === false ? `${p.label} did not load` : `${p.label}: unknown`"
      :data-testid="`load-${p.key}`"
      :data-ok="String(p.ok)"
    >
      {{ p.label }}
    </v-chip>
    <span v-if="load?.error" class="text-caption text-error" data-testid="load-error">
      {{ load.error }}
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { components } from '@/api/types'

type LoadHealth = components['schemas']['UpdateLoadHealth']

const props = defineProps<{ load: LoadHealth | null | undefined }>()

const plugins = computed(() => [
  { key: 'metamod', label: 'Metamod', ok: props.load?.metamod ?? null },
  { key: 'cssharp', label: 'CSS', ok: props.load?.cssharp ?? null },
  { key: 'matchzy', label: 'MatchZy', ok: props.load?.matchzy ?? null },
])
</script>
