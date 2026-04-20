<template>
  <v-card variant="outlined">
    <v-card-title class="d-flex align-center">
      <v-icon start>mdi-history</v-icon>
      Change History
      <v-spacer />
      <v-btn
        icon="mdi-refresh"
        size="small"
        variant="text"
        :loading="loading"
        @click="loadHistory"
      />
    </v-card-title>
    <v-divider />

    <v-progress-linear v-if="loading" indeterminate />

    <v-card-text v-if="!loading && changes.length === 0" class="text-center py-8">
      <v-icon size="48" color="grey-lighten-1" class="mb-2">mdi-history</v-icon>
      <div class="text-body-1 text-medium-emphasis">No changes recorded yet</div>
    </v-card-text>

    <v-timeline v-else density="compact" side="end" class="pa-4">
      <v-timeline-item
        v-for="change in changes"
        :key="change.id"
        :dot-color="getChangeColor(change.change_type)"
        size="small"
      >
        <template v-slot:icon>
          <v-icon size="small" color="white">{{ getChangeIcon(change.change_type) }}</v-icon>
        </template>

        <v-card variant="tonal" density="compact" class="mb-2">
          <v-card-text class="pa-3">
            <div class="d-flex align-center mb-1">
              <span class="text-subtitle-2 font-weight-medium">
                {{ formatFieldName(change.field_name) }}
              </span>
              <v-chip
                size="x-small"
                :color="getChangeColor(change.change_type)"
                class="ml-2"
              >
                {{ change.change_type }}
              </v-chip>
              <v-spacer />
              <span class="text-caption text-medium-emphasis">
                {{ formatDate(change.created_at) }}
              </span>
            </div>

            <div v-if="change.change_type === 'update'" class="mt-2">
              <div class="d-flex align-center gap-2">
                <v-chip
                  size="small"
                  variant="outlined"
                  color="error"
                  label
                >
                  {{ formatValue(change.old_value) }}
                </v-chip>
                <v-icon size="small">mdi-arrow-right</v-icon>
                <v-chip
                  size="small"
                  variant="outlined"
                  color="success"
                  label
                >
                  {{ formatValue(change.new_value) }}
                </v-chip>
              </div>
            </div>

            <div v-if="change.changed_by_name" class="mt-2 text-caption text-medium-emphasis">
              Changed by {{ change.changed_by_name }}
            </div>

            <div v-if="change.reverted_at" class="mt-2">
              <v-chip size="x-small" color="warning" prepend-icon="mdi-undo">
                Reverted {{ formatDate(change.reverted_at) }}
              </v-chip>
            </div>

            <v-btn
              v-if="canRevert && !change.reverted_at && change.change_type === 'update'"
              size="x-small"
              variant="text"
              color="warning"
              class="mt-2"
              @click="handleRevert(change)"
            >
              <v-icon start size="small">mdi-undo</v-icon>
              Revert
            </v-btn>
          </v-card-text>
        </v-card>
      </v-timeline-item>
    </v-timeline>

    <v-card-actions v-if="hasMore">
      <v-btn
        variant="text"
        block
        :loading="loadingMore"
        @click="loadMore"
      >
        Load More
      </v-btn>
    </v-card-actions>

    <!-- Revert Confirmation Dialog -->
    <v-dialog v-model="revertDialog" max-width="400">
      <v-card>
        <v-card-title>Revert Change</v-card-title>
        <v-card-text>
          <p class="mb-4">
            Are you sure you want to revert the change to
            <strong>{{ selectedChange?.field_name }}</strong>?
          </p>
          <v-textarea
            v-model="revertReason"
            label="Reason (optional)"
            rows="2"
            variant="outlined"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="revertDialog = false">Cancel</v-btn>
          <v-btn color="warning" :loading="reverting" @click="confirmRevert">
            Revert
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api'

// The /v1/audit endpoints are not in the OpenAPI spec yet. We still route
// through the typed api client using an `as never` escape hatch so that the
// auth middleware (token injection) and error middleware (401 silent-refresh)
// apply — exactly like `captainActions.ts` does for its missing-from-spec
// endpoint.

interface EntityChange {
  id: string
  entity_type: string
  entity_id: string
  change_type: 'create' | 'update' | 'delete' | 'revert'
  field_name?: string
  old_value?: unknown
  new_value?: unknown
  changed_by: string
  changed_by_name?: string
  reverted_at?: string
  reverted_by?: string
  revert_reason?: string
  created_at: string
}

interface Props {
  entityType: string
  entityId: string
  canRevert?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  canRevert: false,
})

const emit = defineEmits<{
  reverted: [change: EntityChange]
}>()

const changes = ref<EntityChange[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(false)
const page = ref(1)
const perPage = 10

const revertDialog = ref(false)
const selectedChange = ref<EntityChange | null>(null)
const revertReason = ref('')
const reverting = ref(false)

async function fetchAuditPage(pageNum: number): Promise<{ data?: EntityChange[]; changes?: EntityChange[] } | null> {
  const { data, error } = await api.GET(
    '/v1/audit/{entity_type}/{entity_id}' as never,
    {
      params: {
        path: { entity_type: props.entityType, entity_id: props.entityId },
        query: { page: pageNum, per_page: perPage },
      },
    } as never,
  )
  if (error) return null
  return data as { data?: EntityChange[]; changes?: EntityChange[] } | null
}

async function loadHistory() {
  loading.value = true
  page.value = 1
  try {
    const data = await fetchAuditPage(page.value)
    if (data) {
      changes.value = data.data || data.changes || []
      hasMore.value = changes.value.length === perPage
    }
  } catch (error) {
    console.error('Failed to load history:', error)
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  loadingMore.value = true
  page.value += 1
  try {
    const data = await fetchAuditPage(page.value)
    if (data) {
      const newChanges = data.data || data.changes || []
      changes.value.push(...newChanges)
      hasMore.value = newChanges.length === perPage
    }
  } catch (error) {
    console.error('Failed to load more history:', error)
    page.value -= 1
  } finally {
    loadingMore.value = false
  }
}

function handleRevert(change: EntityChange) {
  selectedChange.value = change
  revertReason.value = ''
  revertDialog.value = true
}

async function confirmRevert() {
  if (!selectedChange.value) return

  reverting.value = true
  try {
    const { error } = await api.POST(
      '/v1/audit/revert/{change_id}' as never,
      {
        params: { path: { change_id: selectedChange.value.id } },
        body: { reason: revertReason.value || undefined },
      } as never,
    )
    if (!error) {
      emit('reverted', selectedChange.value)
      revertDialog.value = false
      await loadHistory()
    }
  } catch (error) {
    console.error('Failed to revert change:', error)
  } finally {
    reverting.value = false
  }
}

function getChangeColor(type: string): string {
  switch (type) {
    case 'create':
      return 'success'
    case 'update':
      return 'primary'
    case 'delete':
      return 'error'
    case 'revert':
      return 'warning'
    default:
      return 'grey'
  }
}

function getChangeIcon(type: string): string {
  switch (type) {
    case 'create':
      return 'mdi-plus'
    case 'update':
      return 'mdi-pencil'
    case 'delete':
      return 'mdi-delete'
    case 'revert':
      return 'mdi-undo'
    default:
      return 'mdi-circle'
  }
}

function formatFieldName(name?: string): string {
  if (!name) return 'Entity'
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)'
  if (typeof value === 'string') {
    if (value.length > 50) return value.substring(0, 50) + '...'
    return value || '(empty)'
  }
  if (typeof value === 'object') {
    return JSON.stringify(value).substring(0, 50)
  }
  return String(value)
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // Less than 1 minute
  if (diff < 60000) return 'Just now'

  // Less than 1 hour
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000)
    return `${mins}m ago`
  }

  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000)
    return `${hours}h ago`
  }

  // Less than 7 days
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000)
    return `${days}d ago`
  }

  // Default format
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

onMounted(() => {
  loadHistory()
})
</script>
