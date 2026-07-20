<template>
  <v-autocomplete
    v-model="selected"
    v-model:search="searchQuery"
    :items="items"
    :loading="loading"
    :item-title="itemTitle"
    :item-value="itemValue"
    :label="label"
    :placeholder="placeholder"
    :prepend-inner-icon="prependIcon"
    :variant="variant"
    :density="density"
    :rules="rules"
    :disabled="disabled"
    :clearable="clearable"
    return-object
    :no-filter="!preload"
    :hide-no-data="hideNoData"
    @update:model-value="onSelect"
  >
    <template v-if="$slots.item" v-slot:item="slotProps">
      <slot name="item" v-bind="slotProps" />
    </template>

    <template v-if="$slots.selection" v-slot:selection="slotProps">
      <slot name="selection" v-bind="slotProps" />
    </template>

    <template v-slot:no-data>
      <slot name="no-data" :search-query="searchQuery" :loading="loading" :min-query-length="minQueryLength">
        <v-list-item>
          <v-list-item-title class="text-medium-emphasis">
            <template v-if="loading">Searching...</template>
            <template v-else-if="searchQuery && searchQuery.length >= minQueryLength">{{ noResultsText }}</template>
            <template v-else>{{ promptText }}</template>
          </v-list-item-title>
        </v-list-item>
      </slot>
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts" generic="T extends { id: string }">
import { ref, onMounted, type Ref } from 'vue'
import { watchDebounced } from '@vueuse/core'

interface Props {
  /**
   * Returns the list of items matching the query. Called initially with '' if
   * `preload` is true, then every time the debounced search query changes.
   */
  fetchFn: (query: string) => Promise<T[]>
  /** Extract a display title from an item. */
  itemTitle: (item: T) => string
  /** v-autocomplete's item-value. Defaults to 'id'. */
  itemValue?: string
  /** Preload once at mount (client-side filtering flavor). Default false. */
  preload?: boolean
  /** Minimum query length to trigger server-side fetch. Default 2 (ignored if preload). */
  minQueryLength?: number
  /** Debounce on fetch. Default 300ms. */
  debounceMs?: number
  // v-autocomplete passthroughs
  label?: string
  placeholder?: string
  prependIcon?: string
  variant?: 'outlined' | 'filled' | 'underlined' | 'plain' | 'solo' | 'solo-inverted' | 'solo-filled'
  density?: 'default' | 'comfortable' | 'compact'
  rules?: ((value: unknown) => boolean | string)[]
  disabled?: boolean
  clearable?: boolean
  hideNoData?: boolean
  // Fallback no-data text
  promptText?: string
  noResultsText?: string
}

const props = withDefaults(defineProps<Props>(), {
  itemValue: 'id',
  preload: false,
  minQueryLength: 2,
  debounceMs: 300,
  label: undefined,
  placeholder: undefined,
  prependIcon: undefined,
  variant: 'outlined',
  density: 'compact',
  rules: () => [],
  disabled: false,
  clearable: true,
  hideNoData: false,
  promptText: 'Type to search',
  noResultsText: 'No results found',
})

const selected = defineModel<T | null>({ default: null })

const emit = defineEmits<{
  (e: 'select', value: T | null): void
}>()

const searchQuery = ref('')
const items = ref<T[]>([]) as Ref<T[]>
const loading = ref(false)

async function runFetch(query: string) {
  loading.value = true
  try {
    items.value = await props.fetchFn(query)
  } catch (e) {
    console.error('SearchAutocomplete fetch failed:', e)
    items.value = []
  } finally {
    loading.value = false
  }
}

// Server-side flavor: debounce each query (skipped if preload mode).
watchDebounced(
  searchQuery,
  async (query) => {
    if (props.preload) return // preload mode filters client-side, no re-fetch
    if (!query || query.length < props.minQueryLength) {
      items.value = []
      return
    }
    await runFetch(query)
  },
  { debounce: 300 },
)

onMounted(() => {
  if (props.preload) {
    runFetch('')
  }
})

function onSelect(value: T | null) {
  selected.value = value
  emit('select', value)
}
</script>
