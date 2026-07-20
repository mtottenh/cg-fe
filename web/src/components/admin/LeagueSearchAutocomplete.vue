<template>
  <SearchAutocomplete
    v-model="selected"
    :fetch-fn="fetchLeagues"
    :item-title="(l: LeagueResponse) => `${l.name} (${l.slug})`"
    :label="label"
    :placeholder="placeholder"
    :prepend-icon="prependIcon"
    :variant="variant"
    :density="density"
    :rules="rules"
    :disabled="disabled"
    :clearable="clearable"
    preload
    prompt-text="Type to search leagues by name or slug"
    no-results-text="No leagues found"
    @select="(l) => emit('select', l)"
  >
    <template v-slot:item="{ item, props: itemProps }">
      <v-list-item v-bind="itemProps" :title="undefined">
        <template v-slot:prepend>
          <v-avatar size="32" class="mr-2" rounded="lg">
            <v-img alt="" v-if="item.raw.logo_url" :src="item.raw.logo_url" />
            <v-icon v-else>mdi-trophy</v-icon>
          </v-avatar>
        </template>
        <v-list-item-title>{{ item.raw.name }}</v-list-item-title>
        <v-list-item-subtitle class="text-caption">
          <span class="text-primary">{{ item.raw.slug }}</span>
          <v-chip size="x-small" :color="item.raw.status === 'active' ? 'success' : 'grey'" variant="tonal" class="ml-2">
            {{ item.raw.status }}
          </v-chip>
        </v-list-item-subtitle>
      </v-list-item>
    </template>

    <template v-slot:selection="{ item }">
      <div class="d-flex align-center">
        <v-avatar size="24" class="mr-2" rounded="lg">
          <v-img alt="" v-if="item.raw.logo_url" :src="item.raw.logo_url" />
          <v-icon v-else size="16">mdi-trophy</v-icon>
        </v-avatar>
        <span>{{ item.raw.name }}</span>
        <span class="text-caption text-medium-emphasis ml-2">({{ item.raw.slug }})</span>
      </div>
    </template>
  </SearchAutocomplete>
</template>

<script setup lang="ts">
import SearchAutocomplete from '@/components/SearchAutocomplete.vue'
import { api } from '@/api'
import { unwrapApi } from '@/stores/helpers'
import type { components } from '@/api/types'

type LeagueResponse = components['schemas']['LeagueResponse']

withDefaults(
  defineProps<{
    label?: string
    placeholder?: string
    prependIcon?: string
    variant?: 'outlined' | 'filled' | 'underlined' | 'plain' | 'solo' | 'solo-inverted' | 'solo-filled'
    density?: 'default' | 'comfortable' | 'compact'
    rules?: ((value: unknown) => boolean | string)[]
    disabled?: boolean
    clearable?: boolean
  }>(),
  {
    label: 'Search League',
    placeholder: 'Enter league name or slug...',
    prependIcon: 'mdi-trophy-outline',
    variant: 'outlined',
    density: 'compact',
    rules: () => [],
    disabled: false,
    clearable: true,
  },
)

const selected = defineModel<LeagueResponse | null>({ default: null })

const emit = defineEmits<{
  (e: 'select', league: LeagueResponse | null): void
}>()

async function fetchLeagues(_query: string): Promise<LeagueResponse[]> {
  // Preload mode: query is always '' on mount. Filtering happens client-side via itemTitle.
  const result = await unwrapApi(api.GET('/v1/leagues', {
    params: { query: { per_page: 200 } },
  }))
  return result.data
}
</script>
