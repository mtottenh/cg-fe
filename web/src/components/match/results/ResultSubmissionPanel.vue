<template>
  <v-card>
    <v-card-title class="d-flex align-center">
      <v-icon start>mdi-trophy</v-icon>
      Submit Match Result
    </v-card-title>

    <v-card-text>
      <!-- Match format info -->
      <v-chip size="small" variant="tonal" class="mb-4">
        {{ matchFormatLabel }}
      </v-chip>

      <!-- Score inputs for each game in the match -->
      <div class="scores-section mb-4">
        <ScoreInput
          v-for="(game, index) in games"
          :key="game.gameNumber"
          :game-number="game.gameNumber"
          :team-a-name="teamAName"
          :team-b-name="teamBName"
          :team-a-score="game.teamAScore"
          :team-b-score="game.teamBScore"
          :map-name="game.mapName"
          @update:team-a-score="updateGameScore(index, 'teamA', $event)"
          @update:team-b-score="updateGameScore(index, 'teamB', $event)"
        />
      </div>

      <!-- Series winner display -->
      <v-alert v-if="seriesWinner" type="success" variant="tonal" class="mb-4">
        <div class="d-flex align-center justify-space-between">
          <div>
            <strong>Series Winner:</strong> {{ seriesWinner }}
          </div>
          <v-chip size="small" color="success">
            {{ seriesScore }}
          </v-chip>
        </div>
      </v-alert>

      <v-alert v-else-if="hasScores" type="warning" variant="tonal" class="mb-4">
        Enter scores to determine the series winner.
      </v-alert>

      <!-- Notes -->
      <v-textarea
        v-model="notes"
        label="Notes (optional)"
        placeholder="Any additional information about the match..."
        variant="outlined"
        rows="2"
        counter
        maxlength="1000"
        class="mb-4"
      />

      <!-- Evidence attachment - integrated as per architecture -->
      <EvidenceAttachmentPanel
        :match-id="matchId"
        @update:evidence-ids="evidenceIds = $event"
      />

      <!-- Error display -->
      <v-alert v-if="error" type="error" variant="tonal" closable class="mt-4">
        {{ error }}
      </v-alert>
    </v-card-text>

    <v-card-actions>
      <v-spacer />
      <v-btn
        color="primary"
        variant="flat"
        size="large"
        :loading="loading"
        :disabled="!isValidSubmission"
        @click="handleSubmit"
      >
        <v-icon start>mdi-check-circle</v-icon>
        Submit Result
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useMatchResultsStore, type GameResultInput } from '@/stores/matchResults'
import ScoreInput from './ScoreInput.vue'
import EvidenceAttachmentPanel from '../evidence/EvidenceAttachmentPanel.vue'

interface GameData {
  gameNumber: number
  teamAScore: number
  teamBScore: number
  mapId: string
  mapName?: string
}

const props = defineProps<{
  matchId: string
  tournamentId: string
  teamAName: string
  teamBName: string
  teamARegistrationId: string
  teamBRegistrationId: string
  matchFormat: 'bo1' | 'bo3' | 'bo5' | 'bo7'
  maps?: Array<{ id: string; name: string }>
}>()

const emit = defineEmits<{
  submitted: []
}>()

const store = useMatchResultsStore()
const loading = computed(() => store.loading)
const error = computed(() => store.error)

// Calculate number of games based on format
const numGames = computed(() => {
  switch (props.matchFormat) {
    case 'bo1':
      return 1
    case 'bo3':
      return 3
    case 'bo5':
      return 5
    case 'bo7':
      return 7
    default:
      return 1
  }
})

const matchFormatLabel = computed(() => {
  switch (props.matchFormat) {
    case 'bo1':
      return 'Best of 1'
    case 'bo3':
      return 'Best of 3'
    case 'bo5':
      return 'Best of 5'
    case 'bo7':
      return 'Best of 7'
    default:
      return props.matchFormat
  }
})

// Initialize games array based on match format
const games = ref<GameData[]>(
  Array.from({ length: numGames.value }, (_, i) => ({
    gameNumber: i + 1,
    teamAScore: 0,
    teamBScore: 0,
    mapId: props.maps?.[i]?.id || `map_${i + 1}`,
    mapName: props.maps?.[i]?.name,
  }))
)

// Reset games when format changes
watch(numGames, (newNum) => {
  games.value = Array.from({ length: newNum }, (_, i) => ({
    gameNumber: i + 1,
    teamAScore: 0,
    teamBScore: 0,
    mapId: props.maps?.[i]?.id || `map_${i + 1}`,
    mapName: props.maps?.[i]?.name,
  }))
})

// Notes
const notes = ref('')

// Evidence IDs from EvidenceAttachmentPanel
// Phase 1: This will always be empty
// Phase 2: This will contain real IDs after uploads
const evidenceIds = ref<string[]>([])

// Computed: Series scores
const teamASeriesWins = computed(() => {
  return games.value.filter((g) => g.teamAScore > g.teamBScore).length
})

const teamBSeriesWins = computed(() => {
  return games.value.filter((g) => g.teamBScore > g.teamAScore).length
})

const winsNeeded = computed(() => Math.ceil(numGames.value / 2))

const hasScores = computed(() => {
  return games.value.some((g) => g.teamAScore > 0 || g.teamBScore > 0)
})

// Computed: determine series winner
const seriesWinner = computed(() => {
  if (teamASeriesWins.value >= winsNeeded.value) return props.teamAName
  if (teamBSeriesWins.value >= winsNeeded.value) return props.teamBName
  return null
})

const seriesWinnerRegistrationId = computed(() => {
  if (teamASeriesWins.value >= winsNeeded.value) return props.teamARegistrationId
  if (teamBSeriesWins.value >= winsNeeded.value) return props.teamBRegistrationId
  return null
})

const seriesScore = computed(() => {
  return `${teamASeriesWins.value} - ${teamBSeriesWins.value}`
})

const isValidSubmission = computed(() => {
  // Must have a series winner
  if (!seriesWinner.value) return false

  // All played games must have valid scores
  for (const game of games.value) {
    if (game.teamAScore < 0 || game.teamBScore < 0) return false
    // Can't be a tie (in CS2 etc.)
    if (game.teamAScore === game.teamBScore && game.teamAScore > 0) return false
  }

  return true
})

// Methods
function updateGameScore(index: number, team: 'teamA' | 'teamB', score: number) {
  if (team === 'teamA') {
    games.value[index].teamAScore = score
  } else {
    games.value[index].teamBScore = score
  }
}

async function handleSubmit() {
  if (!isValidSubmission.value || !seriesWinnerRegistrationId.value) return

  // Convert games to GameResultInput format
  const gameResults: GameResultInput[] = games.value.map((g) => ({
    game_number: g.gameNumber,
    map_id: g.mapId,
    participant1_score: g.teamAScore,
    participant2_score: g.teamBScore,
    evidence_ids: [], // Per-game evidence not supported in Phase 1
  }))

  try {
    await store.submitResult(
      props.matchId,
      seriesWinnerRegistrationId.value,
      teamASeriesWins.value,
      teamBSeriesWins.value,
      gameResults,
      evidenceIds.value,
      [], // demoLinkIds - Phase 3
      notes.value || undefined
    )
    emit('submitted')
  } catch {
    // Error handled by store
  }
}
</script>
