import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState, createLatestGuard } from '@/stores/helpers'
import { replaceById } from '@/utils/collections'

type TournamentMatchResponse = components['schemas']['TournamentMatchResponse']
type TournamentBracketResponse = components['schemas']['TournamentBracketResponse']
type MatchParticipantsResponse = components['schemas']['MatchParticipantsResponse']
type MatchResultOverrideResponse = components['schemas']['MatchResultOverrideResponse']

/**
 * Matches slice: matches, brackets, admin match actions, progression, player match actions.
 */
export function createMatchesSlice() {
  const matches = ref<TournamentMatchResponse[]>([])
  const brackets = ref<TournamentBracketResponse[]>([])
  // Which tournament `matches` belongs to — the list must not survive a
  // tournament switch (a deep link into tournament B after visiting A would
  // otherwise read A's cached list).
  const matchesTournamentId = ref<string | null>(null)
  /** Resolved participants for the match currently on screen (P-53/P-56). */
  const matchParticipants = ref<MatchParticipantsResponse | null>(null)
  /** Admin score corrections recorded against the match on screen (P-72). */
  const matchResultOverrides = ref<MatchResultOverrideResponse[]>([])

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
  const fetchMatchParticipantsState = createActionState()
  const overrideMatchResultState = createActionState()
  const fetchMatchResultOverridesState = createActionState()

  // Latest-wins guard for the matches list across rapid tournament switches.
  const beginMatchesFetch = createLatestGuard()

  async function fetchMatches(tournamentId: string): Promise<TournamentMatchResponse[]> {
    return withActionState(fetchMatchesState, async () => {
      const isCurrent = beginMatchesFetch()
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/matches', {
        params: { path: { tournament_id: tournamentId } },
      }))
      if (isCurrent()) {
        matches.value = result.data
        matchesTournamentId.value = tournamentId
      }
      return result.data
    }, 'Failed to fetch matches')
  }

  async function fetchMatch(tournamentId: string, matchId: string): Promise<TournamentMatchResponse> {
    return withActionState(fetchMatchState, async () => {
      // Always hit the network: this feeds the match-detail poll loop, so a
      // cached read would hide opponent check-ins and status transitions.
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/matches/{match_id}', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
      }))
      // Keep the cached list coherent when it belongs to this tournament.
      if (matchesTournamentId.value === tournamentId && matches.value.length > 0) {
        replaceById(matches.value, result.data)
      }
      return result.data
    }, 'Failed to fetch match')
  }

  /**
   * Resolve both of a match's registrations, and which one is the caller's.
   *
   * P-53/P-56: this used to be derived in the browser by fetching the
   * tournament's registrations list and scanning it. That list is paginated
   * and the API clamps `per_page` at 100, so any participant whose row sorted
   * past #100 resolved to `null` — and every participant-only affordance on
   * the match page (submit a result, confirm one, schedule, check in) is gated
   * on that value. Result submission was therefore impossible, silently, for
   * everyone past row 100 of a 100+ participant tournament.
   *
   * The scan is deliberately not kept as a fallback: a fallback that only
   * works below 100 participants is the bug, and leaving it in is how the
   * ceiling comes back.
   */
  async function fetchMatchParticipants(
    tournamentId: string,
    matchId: string,
  ): Promise<MatchParticipantsResponse> {
    return withActionState(fetchMatchParticipantsState, async () => {
      const result = await unwrapApi(api.GET(
        '/v1/tournaments/{tournament_id}/matches/{match_id}/participants',
        { params: { path: { tournament_id: tournamentId, match_id: matchId } } },
      ))
      matchParticipants.value = result.data
      return result.data
    }, 'Failed to resolve match participants')
  }

  /**
   * P-72: correct the score recorded against a match.
   *
   * The only other admin path that can write a score requires a dispute to
   * exist (`POST /v1/admin/disputes/{id}/resolve/adjusted`), so a wrong score
   * that both parties confirmed — or that auto-confirmed after 24h — with
   * nobody disputing was uncorrectable by any operator.
   */
  async function adminOverrideMatchResult(
    tournamentId: string,
    matchId: string,
    participant1Score: number,
    participant2Score: number,
    reason: string,
  ): Promise<TournamentMatchResponse> {
    return withActionState(overrideMatchResultState, async () => {
      const result = await unwrapApi(api.POST(
        '/v1/admin/tournaments/{tournament_id}/matches/{match_id}/result-override',
        {
          params: { path: { tournament_id: tournamentId, match_id: matchId } },
          body: {
            participant1_score: participant1Score,
            participant2_score: participant2Score,
            reason,
          },
        },
      ))
      // Keep the cached list coherent so the modal and the matches table both
      // show the corrected score without a full refetch.
      if (matchesTournamentId.value === tournamentId && matches.value.length > 0) {
        replaceById(matches.value, result.data)
      }
      return result.data
    }, 'Failed to correct match result')
  }

  /** The audit trail of admin score corrections for one match, newest first. */
  async function fetchMatchResultOverrides(
    tournamentId: string,
    matchId: string,
  ): Promise<MatchResultOverrideResponse[]> {
    return withActionState(fetchMatchResultOverridesState, async () => {
      const result = await unwrapApi(api.GET(
        '/v1/admin/tournaments/{tournament_id}/matches/{match_id}/result-overrides',
        { params: { path: { tournament_id: tournamentId, match_id: matchId } } },
      ))
      matchResultOverrides.value = result.data
      return result.data
    }, 'Failed to fetch score corrections')
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

  async function forfeitMatch(
    tournamentId: string,
    matchId: string,
    registrationId: string,
  ): Promise<void> {
    return withActionState(forfeitMatchState, async () => {
      await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/matches/{match_id}/forfeit', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
        body: { registration_id: registrationId },
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
    matchesTournamentId.value = null
    matchParticipants.value = null
    matchResultOverrides.value = []
  }

  return {
    // State
    matches,
    brackets,
    matchParticipants,
    matchResultOverrides,
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
    fetchMatchParticipantsState,
    overrideMatchResultState,
    fetchMatchResultOverridesState,
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
    fetchMatchParticipants,
    adminOverrideMatchResult,
    fetchMatchResultOverrides,
    clear,
  }
}
