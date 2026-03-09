import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'
import { updateById, replaceById } from '@/utils/collections'
import { tournamentStatusMap, getStatusColor as getMapColor, getStatusLabel as getMapLabel } from '@/utils/statusMaps'

// Use generated types
type TournamentResponse = components['schemas']['TournamentResponse']
type TournamentSummaryResponse = components['schemas']['TournamentSummaryResponse']
type TournamentRegistrationResponse = components['schemas']['TournamentRegistrationResponse']
type TournamentMatchResponse = components['schemas']['TournamentMatchResponse']
type TournamentBracketResponse = components['schemas']['TournamentBracketResponse']
type TournamentStageResponse = components['schemas']['TournamentStageResponse']
type CreateTournamentRequest = components['schemas']['CreateTournamentRequest']
type UpdateTournamentRequest = components['schemas']['UpdateTournamentRequest']
type RegisterTeamRequest = components['schemas']['RegisterTeamRequest']
type RegisterPlayerRequest = components['schemas']['RegisterPlayerRequest']
type PaginationMeta = components['schemas']['PaginationMeta']
type SeededParticipantResponse = components['schemas']['SeededParticipantResponse']
type CheckInStatusResponse = components['schemas']['CheckInStatusResponse']

// Tournament status enum for type safety
export const TOURNAMENT_STATUSES = [
  'draft',
  'published',
  'registration',
  'scheduled',
  'in_progress',
  'completed',
  'finalized',
  'cancelled',
] as const

export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number]

// Tournament format options
export const TOURNAMENT_FORMATS = [
  { value: 'single_elimination', label: 'Single Elimination' },
  { value: 'double_elimination', label: 'Double Elimination' },
  { value: 'round_robin', label: 'Round Robin' },
  { value: 'swiss', label: 'Swiss' },
  { value: 'groups_and_playoffs', label: 'Groups & Playoffs' },
] as const

// Participant type options
export const PARTICIPANT_TYPES = [
  { value: 'individual', label: 'Individual' },
  { value: 'team', label: 'Team' },
  { value: 'adhoc', label: 'Ad-hoc Team' },
] as const

// Registration type options
export const REGISTRATION_TYPES = [
  { value: 'open', label: 'Open', description: 'Anyone can register' },
  { value: 'approval', label: 'Approval Required', description: 'Registrations require admin approval' },
  { value: 'invite_only', label: 'Invite Only', description: 'Only invited participants can register' },
  { value: 'qualification', label: 'Qualification', description: 'Must meet qualification criteria' },
] as const

// Scheduling mode options
export const SCHEDULING_MODES = [
  { value: 'live', label: 'Live', description: 'All matches played in real-time event' },
  { value: 'self_scheduled', label: 'Self-Scheduled', description: 'Participants schedule their own matches' },
  { value: 'hybrid', label: 'Hybrid', description: 'Mix of scheduled and self-scheduled matches' },
] as const

// Match format options
export const MATCH_FORMATS = [
  { value: 'bo1', label: 'Best of 1' },
  { value: 'bo3', label: 'Best of 3' },
  { value: 'bo5', label: 'Best of 5' },
  { value: 'bo7', label: 'Best of 7' },
] as const

// Withdrawal policy options
export const WITHDRAWAL_POLICIES = [
  { value: 'forfeit', label: 'Forfeit', description: 'Opponent wins by default' },
  { value: 'reseeding', label: 'Reseeding', description: 'Bracket is reseeded' },
  { value: 'waitlist_promotion', label: 'Waitlist Promotion', description: 'Next waitlisted participant joins' },
  { value: 'admin_decision', label: 'Admin Decision', description: 'Admins decide on case-by-case basis' },
] as const

export const useTournamentsStore = defineStore('tournaments', () => {
  // State
  const tournaments = ref<TournamentSummaryResponse[]>([])
  const currentTournament = ref<TournamentResponse | null>(null)
  const registrations = ref<TournamentRegistrationResponse[]>([])
  const matches = ref<TournamentMatchResponse[]>([])
  const brackets = ref<TournamentBracketResponse[]>([])
  const stages = ref<TournamentStageResponse[]>([])
  const seeding = ref<SeededParticipantResponse[]>([])
  const checkInStatus = ref<CheckInStatusResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pagination = ref<PaginationMeta>({ page: 1, per_page: 20, total_items: 0, total_pages: 0 })

  // Computed
  const activeTournaments = computed(() =>
    tournaments.value.filter((t) => !['completed', 'cancelled'].includes(t.status))
  )

  const upcomingTournaments = computed(() =>
    tournaments.value.filter((t) => ['draft', 'published', 'registration'].includes(t.status))
  )

  const liveTournaments = computed(() => tournaments.value.filter((t) => t.status === 'in_progress'))

  // Per-action states
  const fetchTournamentsState = createActionState()
  const fetchTournamentState = createActionState()
  const fetchTournamentBySlugState = createActionState()
  const createTournamentState = createActionState()
  const updateTournamentState = createActionState()
  const publishState = createActionState()
  const openRegistrationState = createActionState()
  const closeRegistrationState = createActionState()
  const reopenRegistrationState = createActionState()
  const startTournamentState = createActionState()
  const cancelTournamentState = createActionState()
  const completeTournamentState = createActionState()
  const finalizeTournamentState = createActionState()
  const generateNextRoundState = createActionState()
  const fetchRegistrationsState = createActionState()
  const registerTeamState = createActionState()
  const registerPlayerState = createActionState()
  const withdrawState = createActionState()
  const checkInState = createActionState()
  const approveRegistrationState = createActionState()
  const rejectRegistrationState = createActionState()
  const disqualifyRegistrationState = createActionState()
  const fetchMatchesState = createActionState()
  const fetchMatchState = createActionState()
  const fetchBracketsState = createActionState()
  const fetchStagesState = createActionState()
  const adminMatchTransitionState = createActionState()
  const adminForfeitState = createActionState()
  const adminDoubleForfeitState = createActionState()
  const adminScheduleState = createActionState()
  const processProgressionState = createActionState()
  const reapplyProgressionState = createActionState()
  const revertProgressionState = createActionState()
  const matchCheckInState = createActionState()
  const forfeitMatchState = createActionState()
  const fetchSeedingState = createActionState()
  const autoSeedState = createActionState()
  const manualSeedState = createActionState()
  const clearSeedingState = createActionState()
  const createStageState = createActionState()
  const fetchCheckInStatusState = createActionState()
  const processNoShowsState = createActionState()
  const adminCheckInState = createActionState()
  const fetchBracketStandingsState = createActionState()
  const getMapPoolState = createActionState()
  const setMapPoolState = createActionState()
  const deleteMapPoolState = createActionState()

  // ==================== Tournament CRUD ====================

  async function fetchTournaments(filters?: {
    game_id?: string
    league_id?: string
    season_id?: string
    status?: string
    search?: string
    page?: number
    per_page?: number
  }): Promise<TournamentSummaryResponse[]> {
    return withActionState(fetchTournamentsState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments', {
        params: { query: filters },
      }))
      tournaments.value = result.data
      pagination.value = result.pagination
      return tournaments.value
    }, 'Failed to fetch tournaments')
  }

  async function fetchTournament(id: string): Promise<TournamentResponse> {
    return withActionState(fetchTournamentState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}', {
        params: { path: { tournament_id: id } },
      }))
      currentTournament.value = result.data
      return currentTournament.value
    }, 'Failed to fetch tournament')
  }

  async function fetchTournamentBySlug(slug: string): Promise<TournamentResponse> {
    return withActionState(fetchTournamentBySlugState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments/by-slug/{slug}', {
        params: { path: { slug } },
      }))
      currentTournament.value = result.data
      return currentTournament.value
    }, 'Failed to fetch tournament')
  }

  async function createTournament(req: CreateTournamentRequest): Promise<TournamentResponse> {
    return withActionState(createTournamentState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments', {
        body: req,
      }))
      const newTournament = result.data
      currentTournament.value = newTournament
      return newTournament
    }, 'Failed to create tournament')
  }

  async function updateTournament(id: string, req: UpdateTournamentRequest): Promise<TournamentResponse> {
    return withActionState(updateTournamentState, async () => {
      const result = await unwrapApi(api.PATCH('/v1/tournaments/{tournament_id}', {
        params: { path: { tournament_id: id } },
        body: req,
      }))
      currentTournament.value = result.data
      // Update in list if present
      updateById(tournaments.value, id, { name: currentTournament.value.name, slug: currentTournament.value.slug, status: currentTournament.value.status, starts_at: currentTournament.value.starts_at })
      return currentTournament.value
    }, 'Failed to update tournament')
  }

  // ==================== Tournament State Transitions ====================

  async function publishTournament(id: string): Promise<TournamentResponse> {
    return withActionState(publishState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/publish', {
        params: { path: { tournament_id: id } },
      }))
      currentTournament.value = result.data
      // Update in list
      updateById(tournaments.value, id, { status: 'published' })
      return currentTournament.value
    }, 'Failed to publish tournament')
  }

  async function openRegistration(id: string): Promise<TournamentResponse> {
    return withActionState(openRegistrationState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/open-registration', {
        params: { path: { tournament_id: id } },
      }))
      currentTournament.value = result.data
      // Update in list
      updateById(tournaments.value, id, { status: 'registration', is_registration_open: true })
      return currentTournament.value
    }, 'Failed to open registration')
  }

  async function closeRegistration(id: string): Promise<TournamentResponse> {
    return withActionState(closeRegistrationState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/close-registration', {
        params: { path: { tournament_id: id } },
      }))
      currentTournament.value = result.data
      // Update in list
      updateById(tournaments.value, id, { status: 'scheduled', is_registration_open: false })
      return currentTournament.value
    }, 'Failed to close registration')
  }

  async function reopenRegistration(id: string): Promise<TournamentResponse> {
    return withActionState(reopenRegistrationState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/reopen-registration', {
        params: { path: { tournament_id: id } },
      }))
      currentTournament.value = result.data
      updateById(tournaments.value, id, { status: 'registration', is_registration_open: true })
      return currentTournament.value
    }, 'Failed to reopen registration')
  }

  async function startTournament(id: string): Promise<TournamentResponse> {
    return withActionState(startTournamentState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/start', {
        params: { path: { tournament_id: id } },
      }))
      currentTournament.value = result.data
      // Update in list
      updateById(tournaments.value, id, { status: 'in_progress' })
      return currentTournament.value
    }, 'Failed to start tournament')
  }

  async function cancelTournament(id: string): Promise<TournamentResponse> {
    return withActionState(cancelTournamentState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/cancel', {
        params: { path: { tournament_id: id } },
      }))
      currentTournament.value = result.data
      updateById(tournaments.value, id, { status: 'cancelled' })
      return currentTournament.value
    }, 'Failed to cancel tournament')
  }

  async function completeTournament(id: string): Promise<TournamentResponse> {
    return withActionState(completeTournamentState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/complete', {
        params: { path: { tournament_id: id } },
      }))
      currentTournament.value = result.data
      updateById(tournaments.value, id, { status: 'completed' })
      return currentTournament.value
    }, 'Failed to complete tournament')
  }

  async function finalizeTournament(id: string): Promise<TournamentResponse> {
    return withActionState(finalizeTournamentState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/finalize', {
        params: { path: { tournament_id: id } },
      }))
      currentTournament.value = result.data
      updateById(tournaments.value, id, { status: 'finalized' })
      return currentTournament.value
    }, 'Failed to finalize tournament')
  }

  async function generateNextRound(tournamentId: string): Promise<TournamentMatchResponse[]> {
    return withActionState(generateNextRoundState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/tournaments/{tournament_id}/generate-next-round', {
        params: { path: { tournament_id: tournamentId } },
      }))
      await Promise.all([fetchBrackets(tournamentId), fetchMatches(tournamentId)])
      return result.data
    }, 'Failed to generate next round')
  }

  // ==================== Registrations ====================

  async function fetchRegistrations(
    tournamentId: string,
    filters?: { status?: string; page?: number; per_page?: number }
  ): Promise<TournamentRegistrationResponse[]> {
    return withActionState(fetchRegistrationsState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/registrations', {
        params: { path: { tournament_id: tournamentId }, query: filters },
      }))
      registrations.value = result.data
      pagination.value = result.pagination
      return registrations.value
    }, 'Failed to fetch registrations')
  }

  async function registerTeam(
    tournamentId: string,
    request: RegisterTeamRequest
  ): Promise<TournamentRegistrationResponse> {
    return withActionState(registerTeamState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/registrations/team', {
        params: { path: { tournament_id: tournamentId } },
        body: request,
      }))
      const registration = result.data
      registrations.value.push(registration)
      return registration
    }, 'Failed to register team for tournament')
  }

  async function registerPlayer(
    tournamentId: string,
    request: RegisterPlayerRequest
  ): Promise<TournamentRegistrationResponse> {
    return withActionState(registerPlayerState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/registrations/player', {
        params: { path: { tournament_id: tournamentId } },
        body: request,
      }))
      const registration = result.data
      registrations.value.push(registration)
      return registration
    }, 'Failed to register for tournament')
  }

  async function withdrawFromTournament(tournamentId: string, registrationId: string): Promise<void> {
    return withActionState(withdrawState, async () => {
      await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/registrations/{registration_id}/withdraw', {
        params: { path: { tournament_id: tournamentId, registration_id: registrationId } },
        body: {},
      }))
      // Withdraw returns a WithdrawalResponse (forfeits, matches_forfeited), not a registration.
      // Update the local registration status instead.
      const reg = registrations.value.find(r => r.id === registrationId)
      if (reg) {
        reg.status = 'withdrawn'
        reg.withdrawn_at = new Date().toISOString()
      }
    }, 'Failed to withdraw from tournament')
  }

  async function checkIn(tournamentId: string, registrationId: string): Promise<TournamentRegistrationResponse> {
    return withActionState(checkInState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/registrations/{registration_id}/check-in', {
        params: { path: { tournament_id: tournamentId, registration_id: registrationId } },
      }))
      const registration = result.data
      replaceById(registrations.value, registration)
      return registration
    }, 'Failed to check in')
  }

  async function approveRegistration(tournamentId: string, registrationId: string): Promise<TournamentRegistrationResponse> {
    return withActionState(approveRegistrationState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/registrations/{registration_id}/approve', {
        params: { path: { tournament_id: tournamentId, registration_id: registrationId } },
      }))
      const registration = result.data
      replaceById(registrations.value, registration)
      return registration
    }, 'Failed to approve registration')
  }

  async function rejectRegistration(
    tournamentId: string,
    registrationId: string,
    reason?: string
  ): Promise<TournamentRegistrationResponse> {
    return withActionState(rejectRegistrationState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/registrations/{registration_id}/reject', {
        params: { path: { tournament_id: tournamentId, registration_id: registrationId } },
        body: { reason: reason ?? null },
      }))
      const registration = result.data
      replaceById(registrations.value, registration)
      return registration
    }, 'Failed to reject registration')
  }

  async function disqualifyRegistration(
    tournamentId: string,
    registrationId: string,
    reason: string
  ): Promise<TournamentRegistrationResponse> {
    return withActionState(disqualifyRegistrationState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/registrations/{registration_id}/disqualify', {
        params: { path: { tournament_id: tournamentId, registration_id: registrationId } },
        body: { reason },
      }))
      const registration = result.data
      replaceById(registrations.value, registration)
      return registration
    }, 'Failed to disqualify registration')
  }

  // ==================== Matches & Brackets ====================

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
      // Backend endpoint doesn't exist yet — use list + filter as workaround
      if (matches.value.length === 0) {
        await fetchMatches(tournamentId)
      }
      const match = matches.value.find(m => m.id === matchId)
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

  async function fetchStages(tournamentId: string): Promise<TournamentStageResponse[]> {
    return withActionState(fetchStagesState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/stages', {
        params: { path: { tournament_id: tournamentId } },
      }))
      stages.value = result.data
      return stages.value
    }, 'Failed to fetch stages')
  }

  // ==================== Admin Match Actions ====================

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
      const updated = result.data
      replaceById(matches.value, updated)
      return updated
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
      // Forfeit returns a ForfeitResponse, not a match — re-fetch matches to get updated state
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
      // Double forfeit returns a ForfeitResponse, not a match — re-fetch matches to get updated state
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
      const updated = result.data
      replaceById(matches.value, updated)
      return updated
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

  async function reapplyProgression(
    matchId: string,
    newWinnerRegistrationId: string
  ) {
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
      const updated = result.data
      replaceById(matches.value, updated)
      return updated
    }, 'Failed to check in for match')
  }

  // ==================== Player Match Actions ====================

  async function forfeitMatch(
    tournamentId: string,
    matchId: string
  ): Promise<void> {
    return withActionState(forfeitMatchState, async () => {
      await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/matches/{match_id}/forfeit', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
      }))
      await fetchMatches(tournamentId)
    }, 'Failed to forfeit match')
  }

  // ==================== Seeding ====================

  async function fetchSeeding(tournamentId: string): Promise<SeededParticipantResponse[]> {
    return withActionState(fetchSeedingState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/seeding', {
        params: { path: { tournament_id: tournamentId } },
      }))
      seeding.value = result.data
      return seeding.value
    }, 'Failed to fetch seeding')
  }

  async function autoSeed(tournamentId: string): Promise<SeededParticipantResponse[]> {
    return withActionState(autoSeedState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/seeding/auto', {
        params: { path: { tournament_id: tournamentId } },
      }))
      seeding.value = result.data
      return seeding.value
    }, 'Failed to auto-seed tournament')
  }

  async function manualSeed(
    tournamentId: string,
    seeds: Array<{ registration_id: string; seed: number }>
  ): Promise<SeededParticipantResponse[]> {
    return withActionState(manualSeedState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/seeding/manual', {
        params: { path: { tournament_id: tournamentId } },
        body: { seeds },
      }))
      seeding.value = result.data
      return seeding.value
    }, 'Failed to save manual seeding')
  }

  async function clearSeeding(tournamentId: string): Promise<void> {
    return withActionState(clearSeedingState, async () => {
      await unwrapApi(api.DELETE('/v1/tournaments/{tournament_id}/seeding', {
        params: { path: { tournament_id: tournamentId } },
      }))
      seeding.value = []
    }, 'Failed to clear seeding')
  }

  // ==================== Stages ====================

  async function createStage(
    tournamentId: string,
    request: components['schemas']['CreateStageRequest']
  ): Promise<TournamentStageResponse> {
    return withActionState(createStageState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/stages', {
        params: { path: { tournament_id: tournamentId } },
        body: request,
      }))
      const stage = result.data
      stages.value.push(stage)
      return stage
    }, 'Failed to create stage')
  }

  // ==================== Check-in & No-Shows ====================

  async function fetchCheckInStatus(tournamentId: string): Promise<CheckInStatusResponse> {
    return withActionState(fetchCheckInStatusState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/check-in-status', {
        params: { path: { tournament_id: tournamentId } },
      }))
      checkInStatus.value = result.data
      return checkInStatus.value
    }, 'Failed to fetch check-in status')
  }

  async function processNoShows(tournamentId: string): Promise<void> {
    return withActionState(processNoShowsState, async () => {
      await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/process-no-shows', {
        params: { path: { tournament_id: tournamentId } },
      }))
      await fetchRegistrations(tournamentId)
    }, 'Failed to process no-shows')
  }

  async function adminCheckIn(
    tournamentId: string,
    registrationId: string
  ): Promise<TournamentRegistrationResponse> {
    return withActionState(adminCheckInState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/registrations/{registration_id}/admin-check-in', {
        params: { path: { tournament_id: tournamentId, registration_id: registrationId } },
      }))
      const registration = result.data
      replaceById(registrations.value, registration)
      return registration
    }, 'Failed to admin check-in')
  }

  // ==================== Bracket Standings ====================

  async function fetchBracketStandings(tournamentId: string, bracketId: string) {
    return withActionState(fetchBracketStandingsState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/brackets/{bracket_id}/standings', {
        params: { path: { tournament_id: tournamentId, bracket_id: bracketId } },
      }))
      return result.data
    }, 'Failed to fetch bracket standings')
  }

  // ==================== Utility ====================

  // ==================== Tournament Map Pool ====================

  async function getTournamentMapPool(tournamentId: string) {
    return withActionState(getMapPoolState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/map-pool', {
        params: { path: { tournament_id: tournamentId } },
      }))
      return result.data
    }, 'Failed to fetch tournament map pool')
  }

  async function setTournamentMapPool(tournamentId: string, mapIds: string[]) {
    return withActionState(setMapPoolState, async () => {
      const result = await unwrapApi(api.PUT('/v1/tournaments/{tournament_id}/map-pool', {
        params: { path: { tournament_id: tournamentId } },
        body: { map_ids: mapIds },
      }))
      return result.data
    }, 'Failed to set tournament map pool')
  }

  async function deleteTournamentMapPool(tournamentId: string) {
    return withActionState(deleteMapPoolState, async () => {
      await unwrapApi(api.DELETE('/v1/tournaments/{tournament_id}/map-pool', {
        params: { path: { tournament_id: tournamentId } },
      }))
    }, 'Failed to delete tournament map pool')
  }

  function clearCurrent() {
    currentTournament.value = null
    registrations.value = []
    matches.value = []
    brackets.value = []
    stages.value = []
    seeding.value = []
    checkInStatus.value = null
  }

  function clearTournaments() {
    tournaments.value = []
  }

  function $reset() {
    tournaments.value = []
    currentTournament.value = null
    registrations.value = []
    matches.value = []
    brackets.value = []
    stages.value = []
    seeding.value = []
    checkInStatus.value = null
    loading.value = false
    error.value = null
    pagination.value = { page: 1, per_page: 20, total_items: 0, total_pages: 0 }
  }

  return {
    // State
    tournaments,
    currentTournament,
    registrations,
    matches,
    brackets,
    stages,
    seeding,
    checkInStatus,
    loading,
    error,
    pagination,

    // Computed
    activeTournaments,
    upcomingTournaments,
    liveTournaments,

    // Per-action states
    fetchTournamentsState,
    fetchTournamentState,
    fetchTournamentBySlugState,
    createTournamentState,
    updateTournamentState,
    publishState,
    openRegistrationState,
    closeRegistrationState,
    reopenRegistrationState,
    startTournamentState,
    cancelTournamentState,
    completeTournamentState,
    finalizeTournamentState,
    generateNextRoundState,
    fetchRegistrationsState,
    registerTeamState,
    registerPlayerState,
    withdrawState,
    checkInState,
    approveRegistrationState,
    rejectRegistrationState,
    disqualifyRegistrationState,
    fetchMatchesState,
    fetchMatchState,
    fetchBracketsState,
    fetchStagesState,
    adminMatchTransitionState,
    adminForfeitState,
    adminDoubleForfeitState,
    adminScheduleState,
    processProgressionState,
    reapplyProgressionState,
    revertProgressionState,
    matchCheckInState,
    forfeitMatchState,
    fetchSeedingState,
    autoSeedState,
    manualSeedState,
    clearSeedingState,
    createStageState,
    fetchCheckInStatusState,
    processNoShowsState,
    adminCheckInState,
    fetchBracketStandingsState,
    getMapPoolState,
    setMapPoolState,
    deleteMapPoolState,

    // Tournament CRUD
    fetchTournaments,
    fetchTournament,
    fetchTournamentBySlug,
    createTournament,
    updateTournament,

    // State transitions
    publishTournament,
    openRegistration,
    closeRegistration,
    reopenRegistration,
    startTournament,
    cancelTournament,
    completeTournament,
    finalizeTournament,
    generateNextRound,

    // Registrations
    fetchRegistrations,
    registerTeam,
    registerPlayer,
    withdrawFromTournament,
    checkIn,
    approveRegistration,
    rejectRegistration,
    disqualifyRegistration,

    // Matches & Brackets
    fetchMatches,
    fetchMatch,
    fetchBrackets,
    fetchStages,

    // Admin Match Actions
    adminMatchTransition,
    adminForfeitMatch,
    adminDoubleForfeit,
    adminScheduleMatch,
    processProgression,
    reapplyProgression,
    revertProgression,
    matchCheckIn,

    // Player Match Actions
    forfeitMatch,

    // Seeding
    fetchSeeding,
    autoSeed,
    manualSeed,
    clearSeeding,

    // Stages
    createStage,

    // Check-in & No-Shows
    fetchCheckInStatus,
    processNoShows,
    adminCheckIn,

    // Bracket Standings
    fetchBracketStandings,

    // Tournament Map Pool
    getTournamentMapPool,
    setTournamentMapPool,
    deleteTournamentMapPool,

    // Utility
    clearCurrent,
    clearTournaments,
    $reset,
  }
})

// Re-export types for convenience
export type {
  TournamentResponse,
  TournamentSummaryResponse,
  TournamentRegistrationResponse,
  TournamentMatchResponse,
  TournamentBracketResponse,
  TournamentStageResponse,
  CreateTournamentRequest,
  UpdateTournamentRequest,
  RegisterTeamRequest,
  RegisterPlayerRequest,
  SeededParticipantResponse,
  CheckInStatusResponse,
}

// Helper functions
export function getStatusColor(status: string): string {
  return getMapColor(tournamentStatusMap, status)
}

export function getStatusLabel(status: string): string {
  return getMapLabel(tournamentStatusMap, status)
}

export function formatTournamentFormat(format: string): string {
  const found = TOURNAMENT_FORMATS.find((f) => f.value === format)
  return found?.label || format
}
