<template>
  <v-dialog
    v-model="open"
    max-width="1000"
    persistent
    scrollable
  >
    <v-card v-if="match">
      <v-card-title class="d-flex align-center justify-space-between">
        <div class="d-flex align-center ga-2">
          <v-chip size="small" variant="tonal">#{{ match.match_number }}</v-chip>
          <span>Match Detail</span>
        </div>
        <v-btn aria-label="Close" icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-tabs v-model="activeTab" bg-color="transparent">
        <v-tab value="overview">Overview</v-tab>
        <v-tab value="results">Results</v-tab>
        <v-tab value="evidence">Evidence</v-tab>
        <v-tab value="actions">Admin Actions</v-tab>
      </v-tabs>

      <v-divider />

      <v-card-text class="pa-4" style="max-height: 70vh; overflow-y: auto">
        <v-tabs-window v-model="activeTab">
          <v-tabs-window-item value="overview">
            <MatchOverviewTab
              :match="match"
              :tournament-id="tournamentId"
              @updated="emit('updated')"
            />
          </v-tabs-window-item>

          <v-tabs-window-item value="results">
            <MatchResultsTab />
          </v-tabs-window-item>

          <v-tabs-window-item value="evidence">
            <MatchEvidenceTab :match-id="matchId" />
          </v-tabs-window-item>

          <v-tabs-window-item value="actions">
            <MatchAdminActionsTab
              :match="match"
              :tournament-id="tournamentId"
              @updated="emit('updated')"
            />
          </v-tabs-window-item>
        </v-tabs-window>
      </v-card-text>
    </v-card>

    <!-- Loading -->
    <v-card v-else>
      <v-card-text class="text-center pa-8">
        <v-progress-circular indeterminate color="primary" />
        <p class="mt-4 text-medium-emphasis">Loading match...</p>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTournamentsStore } from '@/stores/tournaments'
import { useMatchResultsStore } from '@/stores/matchResults'
import { useEvidenceStore } from '@/stores/evidence'
import MatchOverviewTab from './match-detail/MatchOverviewTab.vue'
import MatchResultsTab from './match-detail/MatchResultsTab.vue'
import MatchEvidenceTab from './match-detail/MatchEvidenceTab.vue'
import MatchAdminActionsTab from './match-detail/MatchAdminActionsTab.vue'

const props = defineProps<{
  matchId: string | null
  tournamentId: string
}>()

const emit = defineEmits<{
  updated: []
}>()

const open = defineModel<boolean>({ required: true })

const tournamentsStore = useTournamentsStore()
const matchResultsStore = useMatchResultsStore()
const evidenceStore = useEvidenceStore()

const activeTab = ref('overview')

const match = computed(() => {
  if (!props.matchId) return null
  return tournamentsStore.matches.find(m => m.id === props.matchId) ?? null
})

// When the selected match changes while the modal is open, reset to the
// overview tab and refresh result/evidence data. Each tab renders from the
// store collections these fetches populate.
watch(() => props.matchId, async (id) => {
  if (id && open.value) {
    activeTab.value = 'overview'
    await Promise.allSettled([
      matchResultsStore.fetchCurrentResult(id),
      matchResultsStore.fetchResultHistory(id),
      evidenceStore.fetchLinkedDemos(id),
      evidenceStore.fetchEvidence(id),
    ])
  }
})

function close() {
  open.value = false
}
</script>
