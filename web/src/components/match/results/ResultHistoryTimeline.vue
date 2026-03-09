<template>
  <v-card v-if="history.length > 0" variant="outlined">
    <v-card-title class="text-subtitle-1">
      <v-icon start size="small">mdi-history</v-icon>
      Result History
    </v-card-title>

    <v-card-text>
      <v-timeline density="compact" side="end">
        <v-timeline-item
          v-for="entry in history"
          :key="entry.id"
          :dot-color="getStatusColor(entry.status)"
          size="small"
        >
          <template #opposite>
            <span class="text-caption text-grey">{{ formatDate(entry.created_at) }}</span>
          </template>

          <v-card variant="outlined" density="compact" class="timeline-card">
            <v-card-text class="py-2 px-3">
              <div class="d-flex align-center justify-space-between">
                <div>
                  <strong class="text-body-2">{{ getSubmitterLabel(entry) }}</strong>
                  <v-chip :color="getStatusColor(entry.status)" size="x-small" class="ml-2">
                    {{ getStatusLabel(entry.status) }}
                  </v-chip>
                </div>
              </div>

              <div class="text-caption text-grey mt-1">
                {{ formatScores(entry) }}
              </div>

              <div v-if="entry.was_auto_confirmed" class="text-caption text-grey-darken-1 mt-1">
                <v-icon size="x-small" class="mr-1">mdi-robot</v-icon>
                Auto-confirmed
              </div>
            </v-card-text>
          </v-card>
        </v-timeline-item>
      </v-timeline>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import type { ResultClaimResponse } from '@/stores/matchResults'
import { getResultStatusColor, getResultStatusLabel, formatResultDate } from '@/stores/matchResults'

const props = defineProps<{
  history: ResultClaimResponse[]
  teamAName?: string
  teamBName?: string
}>()

function getStatusColor(status: string): string {
  return getResultStatusColor(status)
}

function getStatusLabel(status: string): string {
  return getResultStatusLabel(status)
}

function formatDate(dateStr: string): string {
  return formatResultDate(dateStr)
}

function getSubmitterLabel(_entry: ResultClaimResponse): string {
  // In a real app, we'd look up the player name
  // For now, we'll use a generic label
  return 'Result submitted'
}

function formatScores(entry: ResultClaimResponse): string {
  const p1 = props.teamAName || 'Team 1'
  const p2 = props.teamBName || 'Team 2'

  if (entry.game_results && entry.game_results.length > 0) {
    const gameScores = entry.game_results
      .map((g) => `Map ${g.game_number}: ${g.participant1_score}-${g.participant2_score}`)
      .join(' | ')
    return `${p1} ${entry.claimed_participant1_score} - ${entry.claimed_participant2_score} ${p2} (${gameScores})`
  }

  return `${p1} ${entry.claimed_participant1_score} - ${entry.claimed_participant2_score} ${p2}`
}
</script>

<style scoped>
.timeline-card {
  max-width: 400px;
}
</style>
