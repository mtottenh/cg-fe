import { computed, type Ref } from 'vue'
import {
  useTournamentsStore,
  type TournamentResponse,
  type TournamentBracketResponse,
} from '@/stores/tournaments'

/**
 * Swiss/round-robin round progression derived from the tournament's first
 * bracket + current matches. Centralized because the same four computeds were
 * previously maintained in both `useTournamentContext` and
 * `AdminTournamentDetailPage`, with subtle type-cast differences.
 *
 * `canAdvanceRound` is true only when the tournament is in progress, the
 * bracket has round metadata, and every match of the current round is
 * completed. `currentRound < totalRounds` keeps the final round from
 * showing an "advance" button.
 *
 * Reads `matches` + `brackets` off the tournament store so pages don't
 * need to pass them in.
 */
export function useSwissBracketProgress(tournament: Ref<TournamentResponse | null>) {
  const tournamentsStore = useTournamentsStore()

  const isSwissFormat = computed(() => tournament.value?.format === 'swiss')

  const swissBracket = computed<TournamentBracketResponse | null>(() =>
    tournamentsStore.brackets[0] ?? null,
  )

  const currentRound = computed(() => swissBracket.value?.current_round ?? null)
  const totalRounds = computed(() => swissBracket.value?.total_rounds ?? null)

  const allCurrentRoundMatchesCompleted = computed(() => {
    const round = currentRound.value
    if (!round) return false
    const roundMatches = tournamentsStore.matches.filter((m) => m.round === round)
    return roundMatches.length > 0 && roundMatches.every((m) => m.status === 'completed')
  })

  const canAdvanceRound = computed(() => {
    if (!isSwissFormat.value) return false
    if (tournament.value?.status !== 'in_progress') return false
    const round = currentRound.value
    const total = totalRounds.value
    if (!round || !total) return false
    return round < total && allCurrentRoundMatchesCompleted.value
  })

  return {
    isSwissFormat,
    swissBracket,
    currentRound,
    totalRounds,
    allCurrentRoundMatchesCompleted,
    canAdvanceRound,
  }
}
