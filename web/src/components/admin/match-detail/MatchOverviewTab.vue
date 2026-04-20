<template>
  <div v-if="match">
    <!-- Match Header -->
    <v-card variant="outlined" class="mb-4">
      <v-card-text>
        <div class="d-flex align-center justify-center gap-6 pa-4">
          <div class="text-center">
            <div class="text-h6" :class="{ 'font-weight-bold text-success': match.winner_registration_id === match.participant1_registration_id }">
              {{ match.participant1_name || 'TBD' }}
            </div>
            <div class="text-h4 font-weight-bold">{{ match.participant1_score ?? '-' }}</div>
          </div>
          <div class="text-grey text-h6">vs</div>
          <div class="text-center">
            <div class="text-h6" :class="{ 'font-weight-bold text-success': match.winner_registration_id === match.participant2_registration_id }">
              {{ match.participant2_name || 'TBD' }}
            </div>
            <div class="text-h4 font-weight-bold">{{ match.participant2_score ?? '-' }}</div>
          </div>
        </div>
        <div class="text-center">
          <v-chip :color="getMatchStatusColor(match.status)" size="small" class="mr-2">
            {{ formatMatchStatus(match.status) }}
          </v-chip>
        </div>
      </v-card-text>
    </v-card>

    <!-- Match Metadata -->
    <v-table density="compact">
      <tbody>
        <tr>
          <td class="text-grey" width="180">Match ID</td>
          <td><code>{{ match.id }}</code></td>
        </tr>
        <tr v-if="match.round">
          <td class="text-grey">Round</td>
          <td>{{ match.round }}</td>
        </tr>
        <tr>
          <td class="text-grey">Format</td>
          <td>{{ formatMatchFormat(match.match_format) }}</td>
        </tr>
        <tr>
          <td class="text-grey">Scheduled At</td>
          <td>{{ match.scheduled_at ? formatDateTime(match.scheduled_at) : 'Not scheduled' }}</td>
        </tr>
        <tr v-if="match.started_at">
          <td class="text-grey">Started At</td>
          <td>{{ formatDateTime(match.started_at) }}</td>
        </tr>
        <tr v-if="match.completed_at">
          <td class="text-grey">Completed At</td>
          <td>{{ formatDateTime(match.completed_at) }}</td>
        </tr>
        <tr v-if="match.winner_registration_id">
          <td class="text-grey">Winner</td>
          <td>
            <strong>{{ match.winner_registration_id === match.participant1_registration_id ? match.participant1_name : match.participant2_name }}</strong>
          </td>
        </tr>
      </tbody>
    </v-table>

    <!-- Status Transition -->
    <div v-if="nextStatus" class="mt-4">
      <v-btn
        :color="getMatchActionColor(match.status)"
        :loading="tournamentsStore.adminMatchTransitionState.loading"
        @click="handleTransition"
      >
        {{ getMatchActionLabel(match.status) }}
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTournamentsStore, type TournamentMatchResponse } from '@/stores/tournaments'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { formatDateTime } from '@/utils/formatters'
import {
  getMatchStatusColor, formatMatchStatus, formatMatchFormat,
  getNextMatchStatus, getMatchActionLabel, getMatchActionColor,
} from '@/utils/matchStatus'

const props = defineProps<{
  match: TournamentMatchResponse | null
  tournamentId: string
}>()

const emit = defineEmits<{
  updated: []
}>()

const tournamentsStore = useTournamentsStore()
const feedback = useActionFeedback()

const nextStatus = computed(() => {
  return props.match ? getNextMatchStatus(props.match.status) : null
})

async function handleTransition() {
  if (!props.match || !nextStatus.value) return
  const next = nextStatus.value
  await feedback.run(
    () => tournamentsStore.adminMatchTransition(props.tournamentId, props.match!.id, next, 'Admin action'),
    {
      success: `Match transitioned to ${next.replace(/_/g, ' ')}`,
      errorSource: tournamentsStore.adminMatchTransitionState,
      after: () => emit('updated'),
    },
  )
}
</script>
