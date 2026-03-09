<template>
  <div class="bracket-container">
    <div v-if="!hasMatches" class="text-center pa-8">
      <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-tournament</v-icon>
      <h3 class="text-h6 mb-2">No Bracket Available</h3>
      <p class="text-grey">The bracket will be displayed once matches are generated.</p>
    </div>

    <div v-else class="bracket-wrapper">
      <!-- Single Elimination Bracket -->
      <template v-if="bracketType === 'single_elimination' || bracketType === 'winners'">
        <div class="bracket">
          <div
            v-for="(round, roundIndex) in roundsData"
            :key="roundIndex"
            class="round"
          >
            <div class="round-header">
              <span class="text-subtitle-2 font-weight-bold">{{ getRoundName(roundIndex + 1, totalRounds) }}</span>
            </div>
            <div class="round-matches">
              <div
                v-for="match in round"
                :key="match.id"
                class="match-wrapper"
              >
                <TournamentMatchCard
                  :match="match"
                  compact
                  @click="$emit('match-click', match)"
                />
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Double Elimination (Winners + Losers) -->
      <template v-if="bracketType === 'double_elimination'">
        <div class="mb-4">
          <h3 class="text-subtitle-1 font-weight-bold mb-2">Winners Bracket</h3>
          <div class="bracket">
            <div
              v-for="(round, roundIndex) in winnerRounds"
              :key="`w-${roundIndex}`"
              class="round"
            >
              <div class="round-header">
                <span class="text-subtitle-2 font-weight-bold">{{ getRoundName(roundIndex + 1, winnerRounds.length) }}</span>
              </div>
              <div class="round-matches">
                <div
                  v-for="match in round"
                  :key="match.id"
                  class="match-wrapper"
                >
                  <TournamentMatchCard
                    :match="match"
                    compact
                    @click="$emit('match-click', match)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="loserRounds.length > 0">
          <h3 class="text-subtitle-1 font-weight-bold mb-2">Losers Bracket</h3>
          <div class="bracket">
            <div
              v-for="(round, roundIndex) in loserRounds"
              :key="`l-${roundIndex}`"
              class="round"
            >
              <div class="round-header">
                <span class="text-subtitle-2 font-weight-bold">Losers Round {{ roundIndex + 1 }}</span>
              </div>
              <div class="round-matches">
                <div
                  v-for="match in round"
                  :key="match.id"
                  class="match-wrapper"
                >
                  <TournamentMatchCard
                    :match="match"
                    compact
                    @click="$emit('match-click', match)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Standings Table (for Swiss/Round Robin) -->
    <v-card v-if="standings.length > 0" class="mt-6" variant="outlined">
      <v-card-title class="text-subtitle-1">
        <v-icon start size="small">mdi-podium</v-icon>
        Standings
      </v-card-title>
      <v-data-table
        :headers="standingsHeaders"
        :items="standings"
        :items-per-page="-1"
        density="compact"
        class="elevation-0"
      >
        <template v-slot:item.rank="{ item }">
          <strong>#{{ item.rank }}</strong>
        </template>
        <template v-slot:item.record="{ item }">
          {{ item.wins }}-{{ item.losses }}<span v-if="item.draws">-{{ item.draws }}</span>
        </template>
      </v-data-table>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TournamentBracketResponse, TournamentMatchResponse } from '@/stores/tournaments'
import { useTournamentsStore } from '@/stores/tournaments'
import TournamentMatchCard from './TournamentMatchCard.vue'

const tournamentsStore = useTournamentsStore()

const props = defineProps<{
  brackets: TournamentBracketResponse[]
  matches: TournamentMatchResponse[]
}>()

const standings = ref<Array<{ rank: number; participant_name: string; wins: number; losses: number; draws: number; points: number }>>([])

const standingsHeaders = [
  { title: '#', key: 'rank', width: '50px' },
  { title: 'Participant', key: 'participant_name' },
  { title: 'Record', key: 'record', width: '100px' },
  { title: 'Points', key: 'points', width: '80px' },
]

// Fetch standings when brackets are loaded (for Swiss/Round Robin)
watch(() => props.brackets, async (brackets) => {
  if (brackets.length === 0) return
  const bracket = brackets[0]
  if (!bracket) return
  const type = bracket.bracket_type
  if (type === 'swiss' || type === 'round_robin') {
    const tournament = tournamentsStore.currentTournament
    if (!tournament) return
    try {
      const data = await tournamentsStore.fetchBracketStandings(tournament.id, bracket.id)
      standings.value = (data as any[]) || []
    } catch {
      standings.value = []
    }
  }
}, { immediate: true })

defineEmits<{
  'match-click': [match: TournamentMatchResponse]
}>()

const hasMatches = computed(() => props.matches.length > 0)

const bracketType = computed(() => {
  if (props.brackets.length === 0) return 'single_elimination'
  const types = props.brackets.map((b) => b.bracket_type)
  if (types.includes('losers')) return 'double_elimination'
  return props.brackets[0]?.bracket_type || 'single_elimination'
})

const totalRounds = computed(() => {
  if (props.matches.length === 0) return 0
  return Math.max(...props.matches.map((m) => m.round))
})

// Group matches by round for single elimination
const roundsData = computed(() => {
  const rounds: TournamentMatchResponse[][] = []
  for (let i = 1; i <= totalRounds.value; i++) {
    rounds.push(
      props.matches
        .filter((m) => m.round === i && !isLoserMatch(m))
        .sort((a, b) => a.match_number - b.match_number)
    )
  }
  return rounds
})

// Separate winners and losers for double elimination
const winnerRounds = computed(() => {
  const winnerBracket = props.brackets.find((b) => b.bracket_type === 'winners')
  if (!winnerBracket) return roundsData.value

  const rounds: TournamentMatchResponse[][] = []
  const winnerMatches = props.matches.filter((m) => m.bracket_id === winnerBracket.id)
  const maxRound = Math.max(...winnerMatches.map((m) => m.round), 0)

  for (let i = 1; i <= maxRound; i++) {
    rounds.push(
      winnerMatches.filter((m) => m.round === i).sort((a, b) => a.match_number - b.match_number)
    )
  }
  return rounds
})

const loserRounds = computed(() => {
  const loserBracket = props.brackets.find((b) => b.bracket_type === 'losers')
  if (!loserBracket) return []

  const rounds: TournamentMatchResponse[][] = []
  const loserMatches = props.matches.filter((m) => m.bracket_id === loserBracket.id)
  const maxRound = Math.max(...loserMatches.map((m) => m.round), 0)

  for (let i = 1; i <= maxRound; i++) {
    rounds.push(
      loserMatches.filter((m) => m.round === i).sort((a, b) => a.match_number - b.match_number)
    )
  }
  return rounds
})

function isLoserMatch(match: TournamentMatchResponse): boolean {
  const loserBracket = props.brackets.find((b) => b.bracket_type === 'losers')
  return loserBracket ? match.bracket_id === loserBracket.id : false
}

function getRoundName(round: number, total: number): string {
  if (round === total) return 'Finals'
  if (round === total - 1) return 'Semi-Finals'
  if (round === total - 2) return 'Quarter-Finals'
  return `Round ${round}`
}
</script>

<style scoped>
.bracket-container {
  overflow-x: auto;
  padding: 16px 0;
}

.bracket-wrapper {
  min-width: fit-content;
}

.bracket {
  display: flex;
  gap: 32px;
}

.round {
  display: flex;
  flex-direction: column;
  min-width: 200px;
}

.round-header {
  text-align: center;
  padding: 8px;
  margin-bottom: 16px;
  border-bottom: 2px solid rgba(var(--v-theme-primary), 0.3);
}

.round-matches {
  display: flex;
  flex-direction: column;
  gap: 16px;
  justify-content: space-around;
  flex: 1;
}

.match-wrapper {
  display: flex;
  align-items: center;
}
</style>
