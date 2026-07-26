<template>
  <div class="bracket-container">
    <EmptyState
      v-if="!hasMatches"
      icon="mdi-tournament"
      title="No Bracket Available"
      subtitle="The bracket will be displayed once matches are generated."
      variant="text"
    />

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
                :class="{ 'my-match': isMyMatch(match) }"
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
                  :class="{ 'my-match': isMyMatch(match) }"
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
                  :class="{ 'my-match': isMyMatch(match) }"
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
        :sort-by="[{ key: 'position', order: 'asc' }]"
        density="compact"
        class="elevation-0"
      >
        <template v-slot:item.position="{ item }">
          <strong>#{{ item.position }}</strong>
        </template>
        <template v-slot:item.matches_won="{ item }">
          {{ item.matches_won }}-{{ item.matches_lost }}<span v-if="item.matches_drawn">-{{ item.matches_drawn }}</span>
        </template>
        <template v-slot:item.buchholz_score="{ item }">
          {{ item.buchholz_score != null ? item.buchholz_score.toFixed(1) : '—' }}
        </template>
        <template v-slot:item.game_differential="{ item }">
          {{ item.game_differential > 0 ? '+' : '' }}{{ item.game_differential }}
        </template>
      </v-data-table>
      <div class="text-caption text-medium-emphasis px-4 pb-2">
        Ordered by points; ties broken by Buchholz (Swiss) and game differential.
      </div>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TournamentBracketResponse, TournamentMatchResponse } from '@/stores/tournaments'
import type { BracketStandingsRow } from '@/api/overrides'
import { useTournamentsStore } from '@/stores/tournaments'
import TournamentMatchCard from './TournamentMatchCard.vue'
import EmptyState from '@/components/EmptyState.vue'

const tournamentsStore = useTournamentsStore()

const props = defineProps<{
  brackets: TournamentBracketResponse[]
  matches: TournamentMatchResponse[]
  /** Registration id of the viewer's own entry — their path through the
   * bracket gets a highlight outline. */
  highlightRegistrationId?: string | null
}>()

function isMyMatch(match: TournamentMatchResponse): boolean {
  const reg = props.highlightRegistrationId
  if (!reg) return false
  return match.participant1_registration_id === reg || match.participant2_registration_id === reg
}

const standings = ref<BracketStandingsRow[]>([])

// Every key maps to a REAL row field — a header keyed to a non-existent
// field silently sorts on `undefined` and scrambles the perceived ranking.
const standingsHeaders = [
  { title: '#', key: 'position', width: '56px' },
  { title: 'Participant', key: 'participant_name' },
  { title: 'Record', key: 'matches_won', width: '100px' },
  { title: 'Game Diff', key: 'game_differential', width: '100px', align: 'end' as const },
  { title: 'Buchholz', key: 'buchholz_score', width: '100px', align: 'end' as const },
  { title: 'Points', key: 'points', width: '80px', align: 'end' as const },
]

// Fetch standings when brackets are loaded (for Swiss/Round Robin)
let standingsSeq = 0
watch(() => props.brackets, async (brackets) => {
  const seq = ++standingsSeq
  // Always reset first: navigating from a Swiss tournament to one without
  // standings must not keep rendering the previous tournament's table.
  standings.value = []
  // Find the Swiss/RR bracket wherever it sits — it is not always brackets[0]
  // in multi-bracket tournaments.
  const bracket = brackets.find(
    (b) => b.bracket_type === 'swiss' || b.bracket_type === 'round_robin',
  )
  if (!bracket) return
  const tournament = tournamentsStore.currentTournament
  if (!tournament) return
  try {
    const data = await tournamentsStore.fetchBracketStandings(tournament.id, bracket.id)
    if (seq === standingsSeq) standings.value = data ?? []
  } catch {
    if (seq === standingsSeq) standings.value = []
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
  // The backend serializes BracketType::SingleElim as 'single_elim'
  // (portal-core Display impl); the single-elimination template matches
  // 'single_elimination'. Normalize so the round grid actually renders.
  const first = props.brackets[0]?.bracket_type
  if (first === 'single_elim') return 'single_elimination'
  return first || 'single_elimination'
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
  /* Scroll affordance: edge shadows appear only while content extends
     beyond the visible area (classic local/scroll attachment trick). */
  background:
    linear-gradient(to right, rgb(var(--v-theme-background)) 30%, transparent) left / 40px 100%,
    linear-gradient(to left, rgb(var(--v-theme-background)) 30%, transparent) right / 40px 100%,
    linear-gradient(to right, rgba(0, 0, 0, 0.45), transparent) left / 20px 100%,
    linear-gradient(to left, rgba(0, 0, 0, 0.45), transparent) right / 20px 100%;
  background-repeat: no-repeat;
  background-attachment: local, local, scroll, scroll;
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
  position: relative;
}

/* Progression cues: stubs out of each feeder match and into each next-round
   match make the left-to-right flow legible without a full connector tree. */
.round:not(:last-child) .match-wrapper::after {
  content: '';
  position: absolute;
  right: -18px;
  width: 18px;
  height: 2px;
  background: rgba(var(--v-theme-primary), 0.35);
}

.round:not(:first-child) .match-wrapper::before {
  content: '';
  position: absolute;
  left: -16px;
  width: 16px;
  height: 2px;
  background: rgba(var(--v-theme-primary), 0.35);
}

/* The viewer's own path through the bracket. */
.match-wrapper.my-match {
  outline: 2px solid rgba(var(--v-theme-primary), 0.7);
  outline-offset: 2px;
  border-radius: 8px;
}
</style>
