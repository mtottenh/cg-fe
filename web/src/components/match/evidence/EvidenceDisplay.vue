<template>
  <div>
    <!-- Loading -->
    <div v-if="loading" class="text-center pa-4">
      <v-progress-circular indeterminate color="primary" size="32" />
    </div>

    <template v-else>
      <!-- Linked Demos -->
      <div v-if="linkedDemos.length > 0">
        <div :class="titleClass" class="mb-2">Linked Demos ({{ linkedDemos.length }})</div>
        <v-table density="compact">
          <thead>
            <tr>
              <th>File Name</th>
              <th>Map</th>
              <th>Game #</th>
              <th v-if="detailed">Validated</th>
              <th v-if="detailed">Linked At</th>
              <th v-if="editable"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="dl in linkedDemos" :key="dl.link.id">
              <td>{{ dl.demo.file_name }}</td>
              <td>{{ (dl.demo.metadata as Record<string, unknown>)?.map_name || '-' }}</td>
              <td>{{ dl.link.game_number ?? '-' }}</td>
              <td v-if="detailed">
                <v-icon :color="dl.link.validated ? 'success' : 'grey'" size="small">
                  {{ dl.link.validated ? 'mdi-check-circle' : 'mdi-circle-outline' }}
                </v-icon>
              </td>
              <td v-if="detailed">{{ formatDateTime(dl.link.linked_at) }}</td>
              <td v-if="editable">
                <v-btn aria-label="Unlink demo" icon variant="text" size="small" color="error" @click="emit('unlink', dl.link.demo_id)">
                  <v-icon size="small">mdi-link-off</v-icon>
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>
      </div>

      <!-- Evidence Records -->
      <div v-if="evidence.length > 0" :class="{ 'mt-4': linkedDemos.length > 0 }">
        <div :class="titleClass" class="mb-2">Evidence Records ({{ evidence.length }})</div>
        <v-table density="compact">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th v-if="detailed">Status</th>
              <th>Validated</th>
              <th v-if="detailed">Created</th>
              <th v-if="matchId">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ev in evidence" :key="ev.id">
              <td>{{ ev.name }}</td>
              <td>
                <v-chip size="x-small" variant="tonal">{{ ev.evidence_type }}</v-chip>
              </td>
              <td v-if="detailed">
                <v-chip size="x-small" :color="evidenceStatusColor(ev.status)" variant="tonal">
                  {{ evidenceStatusLabel(ev.status) }}
                </v-chip>
              </td>
              <td>
                <v-icon :color="ev.validated ? 'success' : 'grey'" size="small">
                  {{ ev.validated ? 'mdi-check-circle' : 'mdi-circle-outline' }}
                </v-icon>
              </td>
              <td v-if="detailed">{{ formatDateTime(ev.created_at) }}</td>
              <td v-if="matchId">
                <v-btn aria-label="View evidence"
                  icon
                  variant="text"
                  size="small"
                  :loading="accessLoading === ev.id"
                  @click="viewEvidence(ev.id)"
                >
                  <v-icon size="small">mdi-open-in-new</v-icon>
                  <v-tooltip activator="parent" location="top">View / Download</v-tooltip>
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>
      </div>

      <!-- Empty State -->
      <div v-if="linkedDemos.length === 0 && evidence.length === 0 && showEmptyState" class="text-center pa-8">
        <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-file-video-outline</v-icon>
        <h3 class="text-h6 mb-2">No Evidence Linked</h3>
        <p class="text-medium-emphasis">No demos or evidence records have been linked to this match.</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { DemoMatchLinkWithDemoResponse, EvidenceSummaryResponse } from '@/stores/evidence'
import { useEvidenceStore } from '@/stores/evidence'
import { formatDateTime } from '@/utils/formatters'
import { evidenceStatusMap, getStatusColor, getStatusLabel } from '@/utils/statusMaps'

const props = withDefaults(
  defineProps<{
    linkedDemos: DemoMatchLinkWithDemoResponse[]
    evidence: EvidenceSummaryResponse[]
    matchId?: string
    detailed?: boolean
    loading?: boolean
    showEmptyState?: boolean
    editable?: boolean
  }>(),
  {
    matchId: undefined,
    detailed: false,
    loading: false,
    showEmptyState: false,
    editable: false,
  }
)

const emit = defineEmits<{
  unlink: [demoId: string]
}>()

const evidenceStore = useEvidenceStore()
const accessLoading = ref<string | null>(null)

const titleClass = computed(() => props.detailed ? 'text-subtitle-1' : 'text-subtitle-2')

// The status cell rendered the RAW value (`quarantined`, `pending`, …) with a
// binary active/not-active colour. `evidenceStatusMap` mirrors the
// `match_evidence_check_status` CHECK
// (api/migrations/0060_evidence_pending_status.sql). See COVERAGE-PLAN.md §9c.
function evidenceStatusColor(status: string): string {
  return getStatusColor(evidenceStatusMap, status)
}

function evidenceStatusLabel(status: string): string {
  return getStatusLabel(evidenceStatusMap, status)
}

async function viewEvidence(evidenceId: string) {
  if (!props.matchId) return
  accessLoading.value = evidenceId
  try {
    const result = await evidenceStore.getAccessUrl(props.matchId, evidenceId)
    window.open(result.url, '_blank')
  } finally {
    accessLoading.value = null
  }
}
</script>
