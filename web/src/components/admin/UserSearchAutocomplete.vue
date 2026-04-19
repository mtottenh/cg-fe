<template>
  <SearchAutocomplete
    v-model="selected"
    :fetch-fn="fetchPlayers"
    :item-title="(p: PlayerSummary) => p.display_name"
    :label="label"
    :placeholder="placeholder"
    :prepend-icon="prependIcon"
    :variant="variant"
    :density="density"
    :rules="rules"
    :disabled="disabled"
    :clearable="clearable"
    prompt-text="Type at least 2 characters to search"
    no-results-text="No players found"
    hide-no-data
    @select="(p) => emit('select', p)"
  >
    <template v-slot:item="{ item, props: itemProps }">
      <v-list-item v-bind="itemProps" :title="undefined">
        <template v-slot:prepend>
          <v-avatar size="32" class="mr-2">
            <v-img v-if="item.raw.avatar_url" :src="item.raw.avatar_url" />
            <v-icon v-else>mdi-account</v-icon>
          </v-avatar>
        </template>
        <v-list-item-title>{{ item.raw.display_name }}</v-list-item-title>
        <v-list-item-subtitle class="text-caption">
          ID: {{ item.raw.id.substring(0, 8) }}...
          <span v-if="item.raw.country_code" class="ml-2">{{ item.raw.country_code }}</span>
        </v-list-item-subtitle>
      </v-list-item>
    </template>

    <template v-slot:selection="{ item }">
      <div class="d-flex align-center">
        <v-avatar size="24" class="mr-2">
          <v-img v-if="item.raw.avatar_url" :src="item.raw.avatar_url" />
          <v-icon v-else size="16">mdi-account</v-icon>
        </v-avatar>
        <span>{{ item.raw.display_name }}</span>
      </div>
    </template>
  </SearchAutocomplete>
</template>

<script setup lang="ts">
import SearchAutocomplete from '@/components/SearchAutocomplete.vue'
import { api } from '@/api'
import { unwrapApi } from '@/stores/helpers'
import type { components } from '@/api/types'

type PlayerSummary = components['schemas']['PlayerSearchResponse']

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
    label: 'Search Player',
    placeholder: 'Enter player name...',
    prependIcon: 'mdi-account-search',
    variant: 'outlined',
    density: 'compact',
    rules: () => [],
    disabled: false,
    clearable: true,
  },
)

const selected = defineModel<PlayerSummary | null>({ default: null })

const emit = defineEmits<{
  (e: 'select', player: PlayerSummary | null): void
}>()

async function fetchPlayers(query: string): Promise<PlayerSummary[]> {
  const result = await unwrapApi(api.GET('/v1/players', {
    params: { query: { q: query, per_page: 10 } },
  }))
  return result.data
}
</script>
