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
        <div v-for="(game, index) in games" :key="game.gameNumber">
          <ScoreInput
            :game-number="game.gameNumber"
            :team-a-name="teamAName"
            :team-b-name="teamBName"
            :team-a-score="game.teamAScore"
            :team-b-score="game.teamBScore"
            :map-name="game.mapName"
            @update:team-a-score="updateGameScore(index, 'teamA', $event)"
            @update:team-b-score="updateGameScore(index, 'teamB', $event)"
          />
          <!-- Linked demo info for this game -->
          <div
            v-if="getLinkedDemoForGame(game.gameNumber)"
            class="d-flex align-center ga-2 ml-2 mt-n1 mb-2"
          >
            <v-icon size="x-small" color="info">mdi-link</v-icon>
            <span class="text-caption text-info">
              <template v-if="getLinkedDemoForGame(game.gameNumber)!.demo.metadata">
                Demo: {{ getLinkedDemoForGame(game.gameNumber)!.demo.metadata!.map_name }} &mdash;
                {{ getLinkedDemoForGame(game.gameNumber)!.demo.metadata!.team1_name }}
                {{ getLinkedDemoForGame(game.gameNumber)!.demo.metadata!.team1_score }}
                : {{ getLinkedDemoForGame(game.gameNumber)!.demo.metadata!.team2_score }}
                {{ getLinkedDemoForGame(game.gameNumber)!.demo.metadata!.team2_name }}
              </template>
              <template v-else>
                Demo: {{ getLinkedDemoForGame(game.gameNumber)!.demo.file_name }}
              </template>
            </span>
            <v-chip
              v-if="autoFilledGames.has(game.gameNumber)"
              size="x-small"
              color="info"
              variant="tonal"
            >
              Auto-filled
            </v-chip>
            <v-btn
              icon
              size="x-small"
              variant="text"
              color="error"
              :loading="evidenceStore.unlinkDemoState.loading"
              @click="unlinkGameDemo(game.gameNumber)"
            >
              <v-icon size="x-small">mdi-close</v-icon>
            </v-btn>
          </div>
        </div>
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
        :match-format="matchFormat"
        @update:evidence-ids="evidenceIds = $event"
        @update:demo-link-ids="demoLinkIds = $event"
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
import { useEvidenceStore } from '@/stores/evidence'
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
const evidenceStore = useEvidenceStore()
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
const demoLinkIds = ref<string[]>([])

// Auto-fill tracking
const autoFilledGames = ref(new Set<number>())

function getLinkedDemoForGame(gameNumber: number) {
  return evidenceStore.linkedDemos.find(d => d.link.game_number === gameNumber) ?? null
}

function mapDemoScoresToMatch(
  metadata: { team1_name: string; team1_score: number; team2_name: string; team2_score: number },
  teamAName: string,
  teamBName: string,
): { teamAScore: number; teamBScore: number } {
  const t1 = metadata.team1_name.toLowerCase()
  const t2 = metadata.team2_name.toLowerCase()
  const a = teamAName.toLowerCase()
  const b = teamBName.toLowerCase()

  const team1IsB = t1.includes(b) || b.includes(t1)
  const team2IsA = t2.includes(a) || a.includes(t2)

  // If team1 matches teamB or team2 matches teamA, swap
  if (team1IsB || team2IsA) {
    return { teamAScore: metadata.team2_score, teamBScore: metadata.team1_score }
  }

  // Default: same order
  return { teamAScore: metadata.team1_score, teamBScore: metadata.team2_score }
}

// Auto-fill scores from linked demo metadata
watch(
  () => evidenceStore.linkedDemos,
  (linkedDemos) => {
    for (const item of linkedDemos) {
      const gameNum = item.link.game_number
      if (gameNum == null || !item.demo.metadata) continue

      const gameIndex = games.value.findIndex(g => g.gameNumber === gameNum)
      if (gameIndex === -1) continue

      const game = games.value[gameIndex]!
      const isUntouched = game.teamAScore === 0 && game.teamBScore === 0
      const wasPreviouslyAutoFilled = autoFilledGames.value.has(gameNum)
      if (!isUntouched && !wasPreviouslyAutoFilled) continue

      const mapped = mapDemoScoresToMatch(item.demo.metadata, props.teamAName, props.teamBName)
      games.value[gameIndex]!.teamAScore = mapped.teamAScore
      games.value[gameIndex]!.teamBScore = mapped.teamBScore
      autoFilledGames.value.add(gameNum)
    }
  },
  { deep: true }
)

async function unlinkGameDemo(gameNumber: number) {
  const linked = getLinkedDemoForGame(gameNumber)
  if (linked) {
    await evidenceStore.unlinkDemoEvidence(props.matchId, linked.link.id)
    autoFilledGames.value.delete(gameNumber)
  }
}

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
    games.value[index]!.teamAScore = score
  } else {
    games.value[index]!.teamBScore = score
  }
  // User manually edited, clear auto-fill tracking
  autoFilledGames.value.delete(games.value[index]!.gameNumber)
}

async function handleSubmit() {
  if (!isValidSubmission.value || !seriesWinnerRegistrationId.value) return

  // Convert games to GameResultInput format, attaching per-game demo links
  const gameResults: GameResultInput[] = games.value.map((g) => {
    const linkedDemo = evidenceStore.linkedDemos.find(d => d.link.game_number === g.gameNumber)
    return {
      game_number: g.gameNumber,
      map_id: g.mapId,
      participant1_score: g.teamAScore,
      participant2_score: g.teamBScore,
      evidence_ids: [],
      demo_link_id: linkedDemo?.link.id ?? null,
    }
  })

  try {
    await store.submitResult(
      props.matchId,
      seriesWinnerRegistrationId.value,
      teamASeriesWins.value,
      teamBSeriesWins.value,
      gameResults,
      evidenceIds.value,
      demoLinkIds.value,
      notes.value || undefined
    )
    emit('submitted')
  } catch {
    // Error handled by store
  }
}
</script>
