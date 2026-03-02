import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'

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

// Tournament status enum for type safety
export const TOURNAMENT_STATUSES = [
  'draft',
  'published',
  'registration_open',
  'registration_closed',
  'check_in_open',
  'ready',
  'in_progress',
  'completed',
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
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pagination = ref<PaginationMeta>({ page: 1, per_page: 20, total_items: 0, total_pages: 0 })

  // Computed
  const activeTournaments = computed(() =>
    tournaments.value.filter((t) => !['completed', 'cancelled'].includes(t.status))
  )

  const upcomingTournaments = computed(() =>
    tournaments.value.filter((t) => ['draft', 'published', 'registration_open'].includes(t.status))
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
  const startTournamentState = createActionState()
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
      const index = tournaments.value.findIndex((t) => t.id === id)
      if (index !== -1) {
        tournaments.value[index] = {
          ...tournaments.value[index],
          name: currentTournament.value.name,
          slug: currentTournament.value.slug,
          status: currentTournament.value.status,
          starts_at: currentTournament.value.starts_at,
        }
      }
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
      const index = tournaments.value.findIndex((t) => t.id === id)
      if (index !== -1) {
        tournaments.value[index] = { ...tournaments.value[index], status: 'published' }
      }
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
      const index = tournaments.value.findIndex((t) => t.id === id)
      if (index !== -1) {
        tournaments.value[index] = { ...tournaments.value[index], status: 'registration_open', is_registration_open: true }
      }
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
      const index = tournaments.value.findIndex((t) => t.id === id)
      if (index !== -1) {
        tournaments.value[index] = { ...tournaments.value[index], status: 'registration_closed', is_registration_open: false }
      }
      return currentTournament.value
    }, 'Failed to close registration')
  }

  async function startTournament(id: string): Promise<TournamentResponse> {
    return withActionState(startTournamentState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/start', {
        params: { path: { tournament_id: id } },
      }))
      currentTournament.value = result.data
      // Update in list
      const index = tournaments.value.findIndex((t) => t.id === id)
      if (index !== -1) {
        tournaments.value[index] = { ...tournaments.value[index], status: 'in_progress' }
      }
      return currentTournament.value
    }, 'Failed to start tournament')
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

  async function withdrawFromTournament(tournamentId: string, registrationId: string): Promise<TournamentRegistrationResponse> {
    return withActionState(withdrawState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/registrations/{registration_id}/withdraw', {
        params: { path: { tournament_id: tournamentId, registration_id: registrationId } },
      }))
      const registration = result.data
      const index = registrations.value.findIndex((r) => r.id === registrationId)
      if (index !== -1) {
        registrations.value[index] = registration
      }
      return registration
    }, 'Failed to withdraw from tournament')
  }

  async function checkIn(tournamentId: string, registrationId: string): Promise<TournamentRegistrationResponse> {
    return withActionState(checkInState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/registrations/{registration_id}/check-in', {
        params: { path: { tournament_id: tournamentId, registration_id: registrationId } },
      }))
      const registration = result.data
      const index = registrations.value.findIndex((r) => r.id === registrationId)
      if (index !== -1) {
        registrations.value[index] = registration
      }
      return registration
    }, 'Failed to check in')
  }

  async function approveRegistration(tournamentId: string, registrationId: string): Promise<TournamentRegistrationResponse> {
    return withActionState(approveRegistrationState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/registrations/{registration_id}/approve', {
        params: { path: { tournament_id: tournamentId, registration_id: registrationId } },
      }))
      const registration = result.data
      const index = registrations.value.findIndex((r) => r.id === registrationId)
      if (index !== -1) {
        registrations.value[index] = registration
      }
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
      const index = registrations.value.findIndex((r) => r.id === registrationId)
      if (index !== -1) {
        registrations.value[index] = registration
      }
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
      const index = registrations.value.findIndex((r) => r.id === registrationId)
      if (index !== -1) {
        registrations.value[index] = registration
      }
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
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/matches/{match_id}', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
      }))
      return result.data
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

  // ==================== Utility ====================

  function clearCurrent() {
    currentTournament.value = null
    registrations.value = []
    matches.value = []
    brackets.value = []
    stages.value = []
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
    startTournamentState,
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
    startTournament,

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
}

// Helper functions
export function getStatusColor(status: string): string {
  switch (status) {
    case 'draft':
      return 'grey'
    case 'published':
      return 'info'
    case 'registration_open':
      return 'success'
    case 'registration_closed':
      return 'warning'
    case 'check_in_open':
      return 'primary'
    case 'ready':
      return 'secondary'
    case 'in_progress':
      return 'primary'
    case 'completed':
      return 'success'
    case 'cancelled':
      return 'error'
    default:
      return 'grey'
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'draft':
      return 'Draft'
    case 'published':
      return 'Published'
    case 'registration_open':
      return 'Registration Open'
    case 'registration_closed':
      return 'Registration Closed'
    case 'check_in_open':
      return 'Check-in Open'
    case 'ready':
      return 'Ready'
    case 'in_progress':
      return 'In Progress'
    case 'completed':
      return 'Completed'
    case 'cancelled':
      return 'Cancelled'
    default:
      return status
  }
}

export function formatTournamentFormat(format: string): string {
  const found = TOURNAMENT_FORMATS.find((f) => f.value === format)
  return found?.label || format
}
