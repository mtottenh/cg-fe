<template>
  <div>
    <!-- Current Result Claim -->
    <div v-if="currentResult" class="mb-4">
      <div class="text-subtitle-1 mb-2">Current Result Claim</div>
      <v-card variant="outlined">
        <v-card-text>
          <v-table density="compact">
            <tbody>
              <tr>
                <td class="text-grey" width="180">Status</td>
                <td>
                  <v-chip :color="getResultStatusColor(currentResult.status)" size="small">
                    {{ getResultStatusLabel(currentResult.status) }}
                  </v-chip>
                </td>
              </tr>
              <tr>
                <td class="text-grey">Score</td>
                <td>{{ currentResult.claimed_participant1_score }} - {{ currentResult.claimed_participant2_score }}</td>
              </tr>
              <tr>
                <td class="text-grey">Submitted By</td>
                <td><code>{{ currentResult.submitted_by_user_id }}</code></td>
              </tr>
              <tr v-if="currentResult.submitter_notes">
                <td class="text-grey">Notes</td>
                <td>{{ currentResult.submitter_notes }}</td>
              </tr>
              <tr v-if="currentResult.auto_confirm_at">
                <td class="text-grey">Auto-confirm</td>
                <td>{{ formatDateTime(currentResult.auto_confirm_at) }}</td>
              </tr>
              <tr>
                <td class="text-grey">Created</td>
                <td>{{ formatDateTime(currentResult.created_at) }}</td>
              </tr>
            </tbody>
          </v-table>

          <!-- Game Results -->
          <div v-if="currentResult.game_results.length > 0" class="mt-3">
            <div class="text-subtitle-2 mb-1">Game Results</div>
            <v-table density="compact">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Map</th>
                  <th>P1 Score</th>
                  <th>P2 Score</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="gr in currentResult.game_results" :key="gr.game_number">
                  <td>{{ gr.game_number }}</td>
                  <td>{{ gr.map_id }}</td>
                  <td>{{ gr.participant1_score }}</td>
                  <td>{{ gr.participant2_score }}</td>
                </tr>
              </tbody>
            </v-table>
          </div>

          <!-- Evidence & Demo IDs -->
          <div v-if="currentResult.evidence_ids.length > 0 || currentResult.demo_link_ids.length > 0" class="mt-3">
            <div class="text-subtitle-2 mb-1">Attached Evidence</div>
            <div class="d-flex flex-wrap gap-1">
              <v-chip v-for="eid in currentResult.evidence_ids" :key="eid" size="small" prepend-icon="mdi-file">
                {{ eid.slice(0, 8) }}...
              </v-chip>
              <v-chip v-for="did in currentResult.demo_link_ids" :key="did" size="small" prepend-icon="mdi-file-video" color="info">
                {{ did.slice(0, 8) }}...
              </v-chip>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <div v-else-if="!matchResultsStore.fetchCurrentResultState.loading" class="text-center pa-4 text-grey">
      No result claim for this match
    </div>

    <!-- Result History -->
    <div v-if="resultHistory.length > 0" class="mt-4">
      <div class="text-subtitle-1 mb-2">Result History ({{ resultHistory.length }})</div>
      <v-timeline density="compact" side="end">
        <v-timeline-item
          v-for="claim in resultHistory"
          :key="claim.id"
          :dot-color="getResultStatusColor(claim.status)"
          size="small"
        >
          <v-card variant="tonal" density="compact">
            <v-card-text class="pa-3">
              <div class="d-flex align-center gap-2 mb-1">
                <v-chip :color="getResultStatusColor(claim.status)" size="x-small">{{ getResultStatusLabel(claim.status) }}</v-chip>
                <span class="text-caption text-grey">{{ formatDateTime(claim.created_at) }}</span>
              </div>
              <div class="text-body-2">
                Score: {{ claim.claimed_participant1_score }} - {{ claim.claimed_participant2_score }}
                <span v-if="claim.was_auto_confirmed" class="text-caption text-grey ml-2">(auto-confirmed)</span>
              </div>
            </v-card-text>
          </v-card>
        </v-timeline-item>
      </v-timeline>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useMatchResultsStore, getResultStatusColor, getResultStatusLabel } from '@/stores/matchResults'
import { formatDateTime } from '@/utils/formatters'

const matchResultsStore = useMatchResultsStore()
const { currentResult, resultHistory } = storeToRefs(matchResultsStore)
</script>
