<template>
  <div class="bracket-container">
    <EmptyState
      v-if="!hasMatches"
      icon="mdi-tournament"
      title="No Bracket Available"
      subtitle="The bracket will be displayed once matches are generated."
      variant="text"
    />

    <div v-else>
      <!-- Stage switcher: only for true multi-stage tournaments
           (groups → playoffs). Single-stage events skip the chrome. -->
      <v-tabs
        v-if="stageTabs.length > 1"
        v-model="selectedStageId"
        density="compact"
        class="mb-4"
        data-testid="stage-tabs"
      >
        <v-tab v-for="stage in stageTabs" :key="stage.id" :value="stage.id">
          {{ stage.name }}
          <v-chip v-if="stage.status === 'active'" size="x-small" color="primary" class="ml-2" variant="tonal">
            Live
          </v-chip>
        </v-tab>
      </v-tabs>

      <EmptyState
        v-if="visibleMatches.length === 0"
        icon="mdi-timer-sand"
        title="Stage Not Started"
        subtitle="Matches for this stage will appear once the previous stage completes."
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

        <!-- Double Elimination (Winners + Losers + Grand Final) -->
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

          <div v-if="grandFinalMatches.length > 0" class="mb-4">
            <h3 class="text-subtitle-1 font-weight-bold mb-2">Grand Final</h3>
            <div class="bracket">
              <div class="round">
                <div class="round-matches">
                  <div
                    v-for="match in grandFinalMatches"
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

        <!-- Round Robin / Swiss / Group stage: one section per bracket, so a
             four-group stage renders four labelled grids instead of one
             interleaved round soup. -->
        <template v-if="bracketType === 'round_robin' || bracketType === 'swiss'">
          <div
            v-for="section in groupSections"
            :key="section.bracket.id"
            class="mb-6"
          >
            <h3 v-if="groupSections.length > 1" class="text-subtitle-1 font-weight-bold mb-2">
              {{ section.bracket.name }}
            </h3>
            <div class="bracket">
              <div
                v-for="(round, roundIndex) in section.rounds"
                :key="roundIndex"
                class="round"
              >
                <div class="round-header">
                  <span class="text-subtitle-2 font-weight-bold">Round {{ roundIndex + 1 }}</span>
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
    </div>

    <!-- Standings tables (Swiss/Round Robin) — one per bracket, so every
         group in a group stage gets its own table. -->
    <v-card
      v-for="section in standingsSections"
      :key="section.bracketId"
      class="mt-6"
      variant="outlined"
    >
      <v-card-title class="text-subtitle-1">
        <v-icon start size="small">mdi-podium</v-icon>
        {{ section.title }}
      </v-card-title>
      <v-data-table
        :headers="standingsHeaders"
        :items="section.rows"
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
import type { components } from '@/api/types'
import type { BracketStandingsRow } from '@/api/overrides'
import { useTournamentsStore } from '@/stores/tournaments'
import TournamentMatchCard from './TournamentMatchCard.vue'
import EmptyState from '@/components/EmptyState.vue'

type TournamentStageResponse = components['schemas']['TournamentStageResponse']

const tournamentsStore = useTournamentsStore()

const props = defineProps<{
  brackets: TournamentBracketResponse[]
  matches: TournamentMatchResponse[]
  /** Stages, when the caller has them. Enables the stage switcher for
   * multi-stage (groups + playoffs) tournaments; optional so existing
   * single-stage callers change nothing. */
  stages?: TournamentStageResponse[]
  /** Registration id of the viewer's own entry — their path through the
   * bracket gets a highlight outline. */
  highlightRegistrationId?: string | null
}>()

function isMyMatch(match: TournamentMatchResponse): boolean {
  const reg = props.highlightRegistrationId
  if (!reg) return false
  return match.participant1_registration_id === reg || match.participant2_registration_id === reg
}

defineEmits<{
  'match-click': [match: TournamentMatchResponse]
}>()

const hasMatches = computed(() => props.matches.length > 0)

// --- Stage awareness ---

/** Stages that own at least one bracket, in play order. */
const stageTabs = computed(() => {
  const stages = props.stages ?? []
  if (stages.length === 0) return []
  const bracketStageIds = new Set(props.brackets.map((b) => b.stage_id))
  return [...stages]
    .filter((s) => bracketStageIds.has(s.id) || s.status !== 'cancelled')
    .sort((a, b) => a.stage_order - b.stage_order)
})

const selectedStageId = ref<string | null>(null)

// Default to the live stage; fall back to the first. Re-run when stages
// arrive async or the tournament changes underneath us.
watch(stageTabs, (tabs) => {
  if (tabs.length === 0) {
    selectedStageId.value = null
    return
  }
  if (selectedStageId.value && tabs.some((s) => s.id === selectedStageId.value)) return
  const active = tabs.find((s) => s.status === 'active')
  selectedStageId.value = active?.id ?? tabs[0]?.id ?? null
}, { immediate: true })

const visibleBrackets = computed(() => {
  if (stageTabs.value.length <= 1 || !selectedStageId.value) return props.brackets
  return props.brackets.filter((b) => b.stage_id === selectedStageId.value)
})

const visibleMatches = computed(() => {
  if (stageTabs.value.length <= 1 || !selectedStageId.value) return props.matches
  return props.matches.filter((m) => m.stage_id === selectedStageId.value)
})

// --- Bracket layout ---

const bracketType = computed(() => {
  if (visibleBrackets.value.length === 0) return 'single_elimination'
  const types = visibleBrackets.value.map((b) => b.bracket_type)
  if (types.includes('losers')) return 'double_elimination'
  // The backend serializes BracketType::SingleElim as 'single_elim'
  // (portal-core Display impl); the single-elimination template matches
  // 'single_elimination'. Normalize so the round grid actually renders.
  const first = visibleBrackets.value[0]?.bracket_type
  if (first === 'single_elim') return 'single_elimination'
  return first || 'single_elimination'
})

const totalRounds = computed(() => {
  if (visibleMatches.value.length === 0) return 0
  return Math.max(...visibleMatches.value.map((m) => m.round))
})

// Group matches by round for single elimination
const roundsData = computed(() => {
  const rounds: TournamentMatchResponse[][] = []
  for (let i = 1; i <= totalRounds.value; i++) {
    rounds.push(
      visibleMatches.value
        .filter((m) => m.round === i && !isLoserMatch(m))
        .sort((a, b) => a.match_number - b.match_number)
    )
  }
  return rounds
})

function roundsForBracket(bracketId: string): TournamentMatchResponse[][] {
  const bracketMatches = visibleMatches.value.filter((m) => m.bracket_id === bracketId)
  const maxRound = Math.max(...bracketMatches.map((m) => m.round), 0)
  const rounds: TournamentMatchResponse[][] = []
  for (let i = 1; i <= maxRound; i++) {
    rounds.push(
      bracketMatches.filter((m) => m.round === i).sort((a, b) => a.match_number - b.match_number)
    )
  }
  return rounds
}

// Separate winners and losers for double elimination
const winnerRounds = computed(() => {
  const winnerBracket = visibleBrackets.value.find((b) => b.bracket_type === 'winners')
  if (!winnerBracket) return roundsData.value
  return roundsForBracket(winnerBracket.id)
})

const loserRounds = computed(() => {
  const loserBracket = visibleBrackets.value.find((b) => b.bracket_type === 'losers')
  if (!loserBracket) return []
  return roundsForBracket(loserBracket.id)
})

// The grand final lives in its own bracket row; neither the winners nor the
// losers grid picks it up (both filter by their own bracket_id), so it was
// simply absent from the DE view before this section existed.
const grandFinalMatches = computed(() => {
  const gfBracket = visibleBrackets.value.find((b) => b.bracket_type === 'grand_final')
  if (!gfBracket) return []
  return visibleMatches.value
    .filter((m) => m.bracket_id === gfBracket.id)
    .sort((a, b) => a.match_number - b.match_number)
})

/** RR/Swiss brackets of the visible stage — one section per group. */
const groupSections = computed(() => {
  return visibleBrackets.value
    .filter((b) => b.bracket_type === 'round_robin' || b.bracket_type === 'swiss')
    .sort((a, b) => (a.group_number ?? 0) - (b.group_number ?? 0))
    .map((bracket) => ({ bracket, rounds: roundsForBracket(bracket.id) }))
})

function isLoserMatch(match: TournamentMatchResponse): boolean {
  const loserBracket = visibleBrackets.value.find((b) => b.bracket_type === 'losers')
  return loserBracket ? match.bracket_id === loserBracket.id : false
}

function getRoundName(round: number, total: number): string {
  if (round === total) return 'Finals'
  if (round === total - 1) return 'Semi-Finals'
  if (round === total - 2) return 'Quarter-Finals'
  return `Round ${round}`
}

// --- Standings (Swiss / Round Robin), one table per bracket ---

const standingsByBracket = ref<Record<string, BracketStandingsRow[]>>({})

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

// Fetch standings for every Swiss/RR bracket in the whole tournament (not
// just the visible stage, so switching tabs doesn't refetch). Sequenced so a
// tournament swap can't interleave stale rows into the fresh map.
//
// The tournament id comes from each BRACKET, not from the store's
// `currentTournament`: callers that fetch tournament + brackets in one
// unordered Promise.all (AdminTournamentDetailPage) can have brackets for
// tournament Y land while `currentTournament` still holds Z, and the
// resulting mismatched (Z, Y-bracket) request 404s into an empty table that
// nothing ever retries — the standings card just silently never appears.
// Taking the id from the same payload makes that mismatch impossible.
let standingsSeq = 0
watch(() => props.brackets, async (brackets) => {
  const seq = ++standingsSeq
  standingsByBracket.value = {}
  const tableBrackets = brackets.filter(
    (b) => b.bracket_type === 'swiss' || b.bracket_type === 'round_robin',
  )
  if (tableBrackets.length === 0) return
  const results = await Promise.all(
    tableBrackets.map(async (bracket) => {
      try {
        const data = await tournamentsStore.fetchBracketStandings(
          bracket.tournament_id,
          bracket.id,
        )
        return [bracket.id, data ?? []] as const
      } catch {
        return [bracket.id, []] as const
      }
    }),
  )
  if (seq !== standingsSeq) return
  standingsByBracket.value = Object.fromEntries(results)
}, { immediate: true })

const standingsSections = computed(() => {
  const sections = visibleBrackets.value
    .filter((b) => b.bracket_type === 'swiss' || b.bracket_type === 'round_robin')
    .sort((a, b) => (a.group_number ?? 0) - (b.group_number ?? 0))
    .map((b) => ({
      bracketId: b.id,
      title: visibleBrackets.value.length > 1 ? `${b.name} Standings` : 'Standings',
      rows: standingsByBracket.value[b.id] ?? [],
    }))
  return sections.filter((s) => s.rows.length > 0)
})
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
