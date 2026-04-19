import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'
import { replaceById } from '@/utils/collections'

type TournamentMatchResponse = components['schemas']['TournamentMatchResponse']
type TournamentBracketResponse = components['schemas']['TournamentBracketResponse']

/**
 * Matches slice: matches, brackets, admin match actions, progression, player match actions.
 */
export function createMatchesSlice() {
  const matches = ref<TournamentMatchResponse[]>([])
  const brackets = ref<TournamentBracketResponse[]>([])

  const fetchMatchesState = createActionState()
  const fetchMatchState = createActionState()
  const fetchBracketsState = createActionState()
  const adminMatchTransitionState = createActionState()
  const adminForfeitState = createActionState()
  const adminDoubleForfeitState = createActionState()
  const adminScheduleState = createActionState()
  const processProgressionState = createActionState()
  const reapplyProgressionState = createActionState()
  const revertProgressionState = createActionState()
  const matchCheckInState = createActionState()
  const forfeitMatchState = createActionState()
  const fetchBracketStandingsState = createActionState()

  async function fetchMatches(tournamentId: string): Promise<TournamentMatchResponse[]> {
    return withActionState(fetchMatchesState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/matches', {
        params: { path: { tournament_id: tournamentId } },
      }))
      matches.value = result.data
      return matches.value
    }, 'Failed to fetch matches')
  }

  async function fetchMatch(tournamentId: string, matchId: string): Promise<TournamentMatchResponse> {
    return withActionState(fetchMatchState, async () => {
      // Backend endpoint doesn't exist yet — use list + filter as workaround.
      if (matches.value.length === 0) {
        await fetchMatches(tournamentId)
      }
      const match = matches.value.find((m) => m.id === matchId)
      if (!match) throw new Error('Match not found')
      return match
    }, 'Failed to fetch match')
  }

  async function fetchBrackets(tournamentId: string): Promise<TournamentBracketResponse[]> {
    return withActionState(fetchBracketsState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/brackets', {
        params: { path: { tournament_id: tournamentId } },
      }))
      brackets.value = result.data
      return brackets.value
    }, 'Failed to fetch brackets')
  }

  async function adminMatchTransition(
    tournamentId: string,
    matchId: string,
    toStatus: string,
    overrideReason: string
  ): Promise<TournamentMatchResponse> {
    return withActionState(adminMatchTransitionState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/tournaments/{tournament_id}/matches/{match_id}/transition', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
        body: { to_status: toStatus, override_reason: overrideReason },
      }))
      replaceById(matches.value, result.data)
      return result.data
    }, 'Failed to transition match')
  }

  async function adminForfeitMatch(
    tournamentId: string,
    matchId: string,
    forfeitingRegistrationId: string,
    forfeitType: string,
    reason: string
  ): Promise<void> {
    return withActionState(adminForfeitState, async () => {
      await unwrapApi(api.POST('/v1/admin/tournaments/{tournament_id}/matches/{match_id}/forfeit', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
        body: { forfeiting_registration_id: forfeitingRegistrationId, forfeit_type: forfeitType, reason },
      }))
      await fetchMatches(tournamentId)
    }, 'Failed to forfeit match')
  }

  async function adminDoubleForfeit(
    tournamentId: string,
    matchId: string,
    reason: string
  ): Promise<void> {
    return withActionState(adminDoubleForfeitState, async () => {
      await unwrapApi(api.POST('/v1/admin/tournaments/{tournament_id}/matches/{match_id}/double-forfeit', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
        body: { reason },
      }))
      await fetchMatches(tournamentId)
    }, 'Failed to process double forfeit')
  }

  async function adminScheduleMatch(
    tournamentId: string,
    matchId: string,
    scheduledAt: string,
    notes?: string
  ): Promise<TournamentMatchResponse> {
    return withActionState(adminScheduleState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/tournaments/{tournament_id}/matches/{match_id}/schedule', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
        body: { scheduled_at: scheduledAt, notes: notes ?? null },
      }))
      replaceById(matches.value, result.data)
      return result.data
    }, 'Failed to schedule match')
  }

  async function processProgression(
    matchId: string,
    winnerRegistrationId: string,
    loserRegistrationId: string
  ) {
    return withActionState(processProgressionState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/matches/{match_id}/progression/process', {
        params: { path: { match_id: matchId } },
        body: { winner_registration_id: winnerRegistrationId, loser_registration_id: loserRegistrationId },
      }))
      return result.data
    }, 'Failed to process progression')
  }

  async function reapplyProgression(matchId: string, newWinnerRegistrationId: string) {
    return withActionState(reapplyProgressionState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/matches/{match_id}/progression/reapply', {
        params: { path: { match_id: matchId } },
        body: { new_winner_registration_id: newWinnerRegistrationId },
      }))
      return result.data
    }, 'Failed to reapply progression')
  }

  async function revertProgression(matchId: string) {
    return withActionState(revertProgressionState, async () => {
      await unwrapApi(api.POST('/v1/admin/matches/{match_id}/progression/revert', {
        params: { path: { match_id: matchId } },
      }))
    }, 'Failed to revert progression')
  }

  async function matchCheckIn(
    tournamentId: string,
    matchId: string,
    registrationId: string
  ): Promise<TournamentMatchResponse> {
    return withActionState(matchCheckInState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/matches/{match_id}/check-in', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
        body: { registration_id: registrationId },
      }))
      replaceById(matches.value, result.data)
      return result.data
    }, 'Failed to check in for match')
  }

  async function forfeitMatch(tournamentId: string, matchId: string): Promise<void> {
    return withActionState(forfeitMatchState, async () => {
      await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/matches/{match_id}/forfeit', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
      }))
      await fetchMatches(tournamentId)
    }, 'Failed to forfeit match')
  }

  async function fetchBracketStandings(tournamentId: string, bracketId: string) {
    return withActionState(fetchBracketStandingsState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/brackets/{bracket_id}/standings', {
        params: { path: { tournament_id: tournamentId, bracket_id: bracketId } },
      }))
      return result.data
    }, 'Failed to fetch bracket standings')
  }

  function clear() {
    matches.value = []
    brackets.value = []
  }

  return {
    // State
    matches,
    brackets,
    // Per-action states
    fetchMatchesState,
    fetchMatchState,
    fetchBracketsState,
    adminMatchTransitionState,
    adminForfeitState,
    adminDoubleForfeitState,
    adminScheduleState,
    processProgressionState,
    reapplyProgressionState,
    revertProgressionState,
    matchCheckInState,
    forfeitMatchState,
    fetchBracketStandingsState,
    // Actions
    fetchMatches,
    fetchMatch,
    fetchBrackets,
    adminMatchTransition,
    adminForfeitMatch,
    adminDoubleForfeit,
    adminScheduleMatch,
    processProgression,
    reapplyProgression,
    revertProgression,
    matchCheckIn,
    forfeitMatch,
    fetchBracketStandings,
    clear,
  }
}
