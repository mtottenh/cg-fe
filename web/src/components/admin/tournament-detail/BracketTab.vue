<template>
  <v-card-text>
    <!-- Swiss Round Advancement -->
    <div v-if="isSwissFormat && tournament?.status === 'in_progress'" class="mb-4 d-flex align-center ga-3">
      <span v-if="swissBracket" class="text-subtitle-1">
        Round {{ swissBracket.current_round }} of {{ swissBracket.total_rounds }}
      </span>
      <v-btn
        v-if="canAdvanceRound"
        color="primary"
        prepend-icon="mdi-skip-next"
        :loading="tournamentsStore.generateNextRoundState.loading"
        @click="$emit('advance-round')"
      >
        Generate Next Round
      </v-btn>
      <v-chip v-else color="info" variant="tonal">
        {{ allCurrentRoundMatchesCompleted ? 'Final round' : 'Complete all matches to advance' }}
      </v-chip>
    </div>

    <div v-if="brackets.length === 0" class="text-center pa-8">
      <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-tournament</v-icon>
      <h3 class="text-h6 mb-2">No Bracket Generated</h3>
      <p class="text-medium-emphasis">
        The bracket will be generated when the tournament starts.
      </p>
    </div>
    <div v-else>
      <TournamentBracket :brackets="brackets" :matches="matches" :stages="stages" />
    </div>
  </v-card-text>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useTournamentsStore } from '@/stores/tournaments'
import { useSwissBracketProgress } from '@/composables/useSwissBracketProgress'
import TournamentBracket from '@/components/tournament/TournamentBracket.vue'

defineEmits<{
  'advance-round': []
}>()

const tournamentsStore = useTournamentsStore()
const { currentTournament: tournament, brackets, matches, stages } = storeToRefs(tournamentsStore)

const {
  isSwissFormat,
  swissBracket,
  allCurrentRoundMatchesCompleted,
  canAdvanceRound,
} = useSwissBracketProgress(tournament)
</script>
