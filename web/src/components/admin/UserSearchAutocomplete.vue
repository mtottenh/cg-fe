<template>
  <v-autocomplete
    v-model="selectedUser"
    v-model:search="searchQuery"
    :items="searchResults"
    :loading="loading"
    :item-title="itemTitle"
    item-value="id"
    :label="label"
    :placeholder="placeholder"
    :prepend-inner-icon="prependIcon"
    :variant="variant"
    :density="density"
    :rules="rules"
    :disabled="disabled"
    :clearable="clearable"
    return-object
    no-filter
    hide-no-data
    @update:model-value="onSelect"
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

    <template v-slot:no-data>
      <v-list-item v-if="searchQuery && searchQuery.length >= 2">
        <v-list-item-title class="text-grey">
          {{ loading ? 'Searching...' : 'No players found' }}
        </v-list-item-title>
      </v-list-item>
      <v-list-item v-else>
        <v-list-item-title class="text-grey">
          Type at least 2 characters to search
        </v-list-item-title>
      </v-list-item>
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { api } from '@/api'
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
  }
)

const selectedUser = defineModel<PlayerSummary | null>({ default: null })

const emit = defineEmits<{
  (e: 'select', player: PlayerSummary | null): void
}>()

const searchQuery = ref('')
const searchResults = ref<PlayerSummary[]>([])
const loading = ref(false)

// Debounced search
watchDebounced(
  searchQuery,
  async (query) => {
    if (!query || query.length < 2) {
      searchResults.value = []
      return
    }

    loading.value = true
    try {
      const { data, error } = await api.GET('/v1/players', {
        params: { query: { q: query, per_page: 10 } },
      })

      if (error) {
        console.error('Player search error:', error)
        searchResults.value = []
        return
      }

      searchResults.value = data?.data || []
    } catch (e) {
      console.error('Player search failed:', e)
      searchResults.value = []
    } finally {
      loading.value = false
    }
  },
  { debounce: 300 }
)

function itemTitle(item: PlayerSummary): string {
  return item.display_name
}

function onSelect(player: PlayerSummary | null) {
  selectedUser.value = player
  emit('select', player)
}
</script>
