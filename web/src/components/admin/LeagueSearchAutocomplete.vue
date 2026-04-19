<template>
  <v-autocomplete
    v-model="selectedLeague"
    v-model:search="searchQuery"
    :items="filteredLeagues"
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
    @update:model-value="onSelect"
  >
    <template v-slot:item="{ item, props: itemProps }">
      <v-list-item v-bind="itemProps" :title="undefined">
        <template v-slot:prepend>
          <v-avatar size="32" class="mr-2" rounded="lg">
            <v-img v-if="item.raw.logo_url" :src="item.raw.logo_url" />
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
          <v-img v-if="item.raw.logo_url" :src="item.raw.logo_url" />
          <v-icon v-else size="16">mdi-trophy</v-icon>
        </v-avatar>
        <span>{{ item.raw.name }}</span>
        <span class="text-caption text-medium-emphasis ml-2">({{ item.raw.slug }})</span>
      </div>
    </template>

    <template v-slot:no-data>
      <v-list-item v-if="loading">
        <v-list-item-title class="text-grey">
          Loading leagues...
        </v-list-item-title>
      </v-list-item>
      <v-list-item v-else-if="searchQuery && searchQuery.length >= 1 && filteredLeagues.length === 0">
        <v-list-item-title class="text-grey">
          No leagues found matching "{{ searchQuery }}"
        </v-list-item-title>
      </v-list-item>
      <v-list-item v-else>
        <v-list-item-title class="text-grey">
          Type to search leagues by name or slug
        </v-list-item-title>
      </v-list-item>
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '@/api'
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
  }
)

const selectedLeague = defineModel<LeagueResponse | null>({ default: null })

const emit = defineEmits<{
  (e: 'select', league: LeagueResponse | null): void
}>()

const searchQuery = ref('')
const allLeagues = ref<LeagueResponse[]>([])
const loading = ref(false)

// Filtered leagues based on search query
const filteredLeagues = computed(() => {
  if (!searchQuery.value || searchQuery.value.length < 1) {
    return allLeagues.value
  }

  const query = searchQuery.value.toLowerCase()
  return allLeagues.value.filter(league =>
    league.name.toLowerCase().includes(query) ||
    league.slug.toLowerCase().includes(query)
  )
})

// Load leagues on mount
onMounted(async () => {
  loading.value = true
  try {
    const { data, error } = await api.GET('/v1/leagues', {
      params: { query: { per_page: 200 } },
    })

    if (error) {
      console.error('Failed to load leagues:', error)
      return
    }

    allLeagues.value = data?.data || []
  } catch (e) {
    console.error('Failed to load leagues:', e)
  } finally {
    loading.value = false
  }
})

function itemTitle(item: LeagueResponse): string {
  return `${item.name} (${item.slug})`
}

function onSelect(league: LeagueResponse | null) {
  selectedLeague.value = league
  emit('select', league)
}
</script>
