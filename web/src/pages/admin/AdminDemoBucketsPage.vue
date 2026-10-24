<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-6">
      <div>
        <h1 class="text-h4">Demo Buckets</h1>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Read-only view of object storage. Useful for finding demos that were
          never catalogued.
        </p>
      </div>
      <v-btn
        variant="text"
        prepend-icon="mdi-refresh"
        :loading="demosStore.browseBucketState.loading"
        @click="reload()"
      >
        Refresh
      </v-btn>
    </div>

    <ErrorAlert
      :error="demosStore.browseBucketState.error || demosStore.fetchBucketsState.error"
      retryable
      @retry="reload()"
    />

    <!-- Bucket picker. The server rejects anything off the allowlist, so
         this list is a convenience, not the security control. -->
    <v-card class="mb-4">
      <v-card-text class="d-flex flex-wrap align-center ga-3">
        <v-select
          v-model="selectedBucket"
          :items="bucketItems"
          item-title="title"
          item-value="value"
          label="Bucket"
          aria-label="Bucket"
          density="compact"
          hide-details
          style="max-width: 340px"
          :loading="demosStore.fetchBucketsState.loading"
          data-testid="bucket-select"
          @update:model-value="onBucketChange"
        />
        <v-text-field
          v-model="prefixInput"
          label="Prefix"
          density="compact"
          hide-details
          clearable
          placeholder="e.g. raw/"
          style="max-width: 340px"
          data-testid="prefix-input"
          @keyup.enter="applyPrefix(prefixInput)"
          @click:clear="applyPrefix('')"
        />
        <v-btn variant="tonal" @click="applyPrefix(prefixInput)">Go</v-btn>
      </v-card-text>
    </v-card>

    <!-- Breadcrumb over the synthetic folder hierarchy -->
    <div class="d-flex flex-wrap align-center ga-2 mb-3">
      <v-chip size="small" variant="tonal" @click="applyPrefix('')">
        <v-icon start icon="mdi-folder-home-outline" />
        {{ selectedBucket || '—' }}
      </v-chip>
      <template v-for="(crumb, i) in breadcrumbs" :key="crumb.prefix">
        <v-icon size="small" icon="mdi-chevron-right" />
        <v-chip
          size="small"
          :variant="i === breadcrumbs.length - 1 ? 'flat' : 'tonal'"
          @click="applyPrefix(crumb.prefix)"
        >
          {{ crumb.label }}
        </v-chip>
      </template>
    </div>

    <v-card>
      <v-card-text class="d-flex flex-wrap align-center ga-3 pb-0">
        <v-text-field
          v-model="search"
          label="Search this prefix"
          aria-label="Search this prefix"
          placeholder="filter by file name"
          prepend-inner-icon="mdi-magnify"
          density="compact"
          variant="outlined"
          clearable
          hide-details
          style="max-width: 360px"
          data-testid="bucket-search"
        />
        <span class="text-caption text-medium-emphasis">
          {{ visibleObjects.length }}
          {{ visibleObjects.length === 1 ? 'file' : 'files' }}
          <template v-if="search.trim()">matching</template>
          <template v-if="listing?.next_cursor">
            · more not yet loaded
          </template>
        </span>
      </v-card-text>

      <v-table density="comfortable" data-testid="bucket-objects">
        <thead>
          <tr>
            <th>
              <button type="button" class="sort-header" data-testid="sort-name" @click="toggleSort('name')">
                Name <v-icon size="x-small" :icon="sortIcon('name')" />
              </button>
            </th>
            <th class="text-right">
              <button type="button" class="sort-header" data-testid="sort-size" @click="toggleSort('size')">
                Size <v-icon size="x-small" :icon="sortIcon('size')" />
              </button>
            </th>
            <th>
              <button type="button" class="sort-header" data-testid="sort-date" @click="toggleSort('last_modified')">
                Last modified <v-icon size="x-small" :icon="sortIcon('last_modified')" />
              </button>
            </th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <!-- Folders first, as in any file browser -->
          <tr
            v-for="folder in visibleFolders"
            :key="folder"
            class="cursor-pointer"
            @click="applyPrefix(folder)"
          >
            <td>
              <v-icon start icon="mdi-folder-outline" class="text-medium-emphasis" />
              {{ relativeName(folder) }}
            </td>
            <td class="text-right text-medium-emphasis">—</td>
            <td class="text-medium-emphasis">—</td>
            <td class="text-right text-medium-emphasis">—</td>
          </tr>

          <tr v-for="object in visibleObjects" :key="object.key">
            <td>
              <v-icon start icon="mdi-file-outline" class="text-medium-emphasis" />
              {{ relativeName(object.key) }}
            </td>
            <td class="text-right">{{ formatSize(object.size) }}</td>
            <td>{{ formatDate(object.last_modified) }}</td>
            <td class="text-right">
              <v-btn
                size="small"
                variant="text"
                prepend-icon="mdi-download"
                :loading="downloadingKey === object.key"
                data-testid="download-object"
                @click="onDownload(object.key)"
              >
                Download
              </v-btn>
            </td>
          </tr>

          <tr v-if="isEmpty">
            <td colspan="4" class="text-center text-medium-emphasis py-8">
              <template v-if="demosStore.browseBucketState.loading">Loading…</template>
              <template v-else-if="search.trim()">No files match “{{ search.trim() }}”.</template>
              <template v-else>Nothing here.</template>
            </td>
          </tr>
        </tbody>
      </v-table>

      <v-divider v-if="listing?.next_cursor" />
      <v-card-actions v-if="listing?.next_cursor" class="justify-center">
        <v-btn
          variant="text"
          :loading="demosStore.browseBucketState.loading"
          data-testid="load-more"
          @click="loadMore()"
        >
          Load more
        </v-btn>
      </v-card-actions>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useDemosStore } from '@/stores/demos'
import { useSnackbar } from '@/composables/useSnackbar'
import ErrorAlert from '@/components/ErrorAlert.vue'

const demosStore = useDemosStore()
const snackbar = useSnackbar()

const selectedBucket = ref<string>('')
const prefix = ref('')
const prefixInput = ref('')
const downloadingKey = ref<string | null>(null)

// Accumulated across "Load more" so paging appends rather than replaces.
const objects = ref<{ key: string; size: number; last_modified?: string | null }[]>([])
const commonPrefixes = ref<string[]>([])
const nextCursor = ref<string | null>(null)

const search = ref('')
type SortKey = 'name' | 'size' | 'last_modified'
const sortKey = ref<SortKey>('name')
const sortDesc = ref(false)

// S3 has no server-side search or ordering — ListObjectsV2 returns keys in
// lexicographic order and nothing else. So both are applied client-side over
// what has been loaded, and PAGE_SIZE is the API maximum to keep "loaded"
// and "all" the same thing for any realistically sized prefix.
const PAGE_SIZE = 1000

const listing = computed(() =>
  selectedBucket.value
    ? {
        objects: objects.value,
        common_prefixes: commonPrefixes.value,
        next_cursor: nextCursor.value,
      }
    : null,
)

const bucketItems = computed(() =>
  demosStore.buckets.map((b) => ({
    value: b.name,
    title: b.is_upload_target ? `${b.name} (uploads land here)` : b.name,
  })),
)

/** Search + sort, applied client-side (see PAGE_SIZE). */
const visibleObjects = computed(() => {
  const needle = search.value.trim().toLowerCase()
  const rows = needle
    ? objects.value.filter((o) => o.key.toLowerCase().includes(needle))
    : [...objects.value]

  const dir = sortDesc.value ? -1 : 1
  rows.sort((a, b) => {
    switch (sortKey.value) {
      case 'size':
        return (a.size - b.size) * dir
      case 'last_modified': {
        // Missing timestamps sort last regardless of direction.
        const at = a.last_modified ? Date.parse(a.last_modified) : null
        const bt = b.last_modified ? Date.parse(b.last_modified) : null
        if (at === null && bt === null) return 0
        if (at === null) return 1
        if (bt === null) return -1
        return (at - bt) * dir
      }
      default:
        return a.key.localeCompare(b.key) * dir
    }
  })
  return rows
})

/** Folders are hidden while searching — a name filter over the current
 *  prefix's files is what the box implies. */
const visibleFolders = computed(() =>
  search.value.trim() ? [] : commonPrefixes.value,
)

const isEmpty = computed(
  () => !visibleFolders.value.length && !visibleObjects.value.length,
)

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDesc.value = !sortDesc.value
  } else {
    sortKey.value = key
    // Dates are most useful newest-first; names read better A-Z.
    sortDesc.value = key !== 'name'
  }
}

function sortIcon(key: SortKey): string {
  if (sortKey.value !== key) return 'mdi-unfold-more-horizontal'
  return sortDesc.value ? 'mdi-arrow-down' : 'mdi-arrow-up'
}

/** Synthetic path segments from the current prefix. */
const breadcrumbs = computed(() => {
  const parts = prefix.value.split('/').filter(Boolean)
  let acc = ''
  return parts.map((part) => {
    acc += `${part}/`
    return { label: part, prefix: acc }
  })
})

/** Strip the current prefix so the table reads like a directory listing. */
function relativeName(key: string): string {
  const name = key.startsWith(prefix.value) ? key.slice(prefix.value.length) : key
  return name.replace(/\/$/, '') || key
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

async function load(append = false) {
  if (!selectedBucket.value) return
  const page = await demosStore.browseBucket(selectedBucket.value, {
    prefix: prefix.value || undefined,
    cursor: append ? (nextCursor.value ?? undefined) : undefined,
    limit: PAGE_SIZE,
  })
  objects.value = append ? [...objects.value, ...page.objects] : page.objects
  commonPrefixes.value = page.common_prefixes
  nextCursor.value = page.next_cursor ?? null
}

function reload() {
  return load(false)
}

function loadMore() {
  return load(true)
}

function applyPrefix(next: string) {
  prefix.value = next ?? ''
  prefixInput.value = prefix.value
  nextCursor.value = null
  search.value = ''
  return load(false)
}

function onBucketChange() {
  return applyPrefix('')
}

async function onDownload(key: string) {
  downloadingKey.value = key
  try {
    const result = await demosStore.downloadBucketObject(selectedBucket.value, key)
    window.open(result.download_url, '_blank')
  } catch {
    snackbar.error('Failed to get download URL')
  } finally {
    downloadingKey.value = null
  }
}

onMounted(async () => {
  await demosStore.fetchBuckets()
  const first = demosStore.buckets[0]
  if (first) {
    selectedBucket.value = first.name
    await load(false)
  }
})
</script>

<style scoped>
.sort-header {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
}
.sort-header:hover {
  text-decoration: underline;
}

.cursor-pointer {
  cursor: pointer;
}
</style>
