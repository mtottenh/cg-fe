import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, ApiError } from '@/api'
import type { components } from '@/api/types'

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
type ApiErrorResponse = components['schemas']['ApiError']

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
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/tournaments', {
        params: { query: filters },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      tournaments.value = data!.data
      pagination.value = data!.pagination
      return tournaments.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch tournaments'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchTournament(id: string): Promise<TournamentResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/tournaments/{tournament_id}', {
        params: { path: { tournament_id: id } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentTournament.value = data!.data
      return currentTournament.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch tournament'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchTournamentBySlug(slug: string): Promise<TournamentResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/tournaments/by-slug/{slug}', {
        params: { path: { slug } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentTournament.value = data!.data
      return currentTournament.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch tournament'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function createTournament(req: CreateTournamentRequest): Promise<TournamentResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/tournaments', {
        body: req,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const newTournament = data!.data
      currentTournament.value = newTournament
      return newTournament
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to create tournament'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateTournament(id: string, req: UpdateTournamentRequest): Promise<TournamentResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.PATCH('/v1/tournaments/{tournament_id}', {
        params: { path: { tournament_id: id } },
        body: req,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentTournament.value = data!.data
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
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to update tournament'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  // ==================== Tournament State Transitions ====================

  async function publishTournament(id: string): Promise<TournamentResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/tournaments/{tournament_id}/publish', {
        params: { path: { tournament_id: id } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentTournament.value = data!.data
      // Update in list
      const index = tournaments.value.findIndex((t) => t.id === id)
      if (index !== -1) {
        tournaments.value[index] = { ...tournaments.value[index], status: 'published' }
      }
      return currentTournament.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to publish tournament'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function openRegistration(id: string): Promise<TournamentResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/tournaments/{tournament_id}/open-registration', {
        params: { path: { tournament_id: id } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentTournament.value = data!.data
      // Update in list
      const index = tournaments.value.findIndex((t) => t.id === id)
      if (index !== -1) {
        tournaments.value[index] = { ...tournaments.value[index], status: 'registration_open', is_registration_open: true }
      }
      return currentTournament.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to open registration'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function closeRegistration(id: string): Promise<TournamentResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/tournaments/{tournament_id}/close-registration', {
        params: { path: { tournament_id: id } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentTournament.value = data!.data
      // Update in list
      const index = tournaments.value.findIndex((t) => t.id === id)
      if (index !== -1) {
        tournaments.value[index] = { ...tournaments.value[index], status: 'registration_closed', is_registration_open: false }
      }
      return currentTournament.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to close registration'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function startTournament(id: string): Promise<TournamentResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/tournaments/{tournament_id}/start', {
        params: { path: { tournament_id: id } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      currentTournament.value = data!.data
      // Update in list
      const index = tournaments.value.findIndex((t) => t.id === id)
      if (index !== -1) {
        tournaments.value[index] = { ...tournaments.value[index], status: 'in_progress' }
      }
      return currentTournament.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to start tournament'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  // ==================== Registrations ====================

  async function fetchRegistrations(
    tournamentId: string,
    filters?: { status?: string; page?: number; per_page?: number }
  ): Promise<TournamentRegistrationResponse[]> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/tournaments/{tournament_id}/registrations', {
        params: { path: { tournament_id: tournamentId }, query: filters },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      registrations.value = data!.data
      pagination.value = data!.pagination
      return registrations.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch registrations'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function registerTeam(
    tournamentId: string,
    request: RegisterTeamRequest
  ): Promise<TournamentRegistrationResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/tournaments/{tournament_id}/registrations/team', {
        params: { path: { tournament_id: tournamentId } },
        body: request,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const registration = data!.data
      registrations.value.push(registration)
      return registration
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to register team for tournament'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function registerPlayer(
    tournamentId: string,
    request: RegisterPlayerRequest
  ): Promise<TournamentRegistrationResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/tournaments/{tournament_id}/registrations/player', {
        params: { path: { tournament_id: tournamentId } },
        body: request,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const registration = data!.data
      registrations.value.push(registration)
      return registration
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to register for tournament'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function withdrawFromTournament(tournamentId: string, registrationId: string): Promise<TournamentRegistrationResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/tournaments/{tournament_id}/registrations/{registration_id}/withdraw', {
        params: { path: { tournament_id: tournamentId, registration_id: registrationId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const registration = data!.data
      const index = registrations.value.findIndex((r) => r.id === registrationId)
      if (index !== -1) {
        registrations.value[index] = registration
      }
      return registration
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to withdraw from tournament'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function checkIn(tournamentId: string, registrationId: string): Promise<TournamentRegistrationResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/tournaments/{tournament_id}/registrations/{registration_id}/check-in', {
        params: { path: { tournament_id: tournamentId, registration_id: registrationId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const registration = data!.data
      const index = registrations.value.findIndex((r) => r.id === registrationId)
      if (index !== -1) {
        registrations.value[index] = registration
      }
      return registration
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to check in'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function approveRegistration(tournamentId: string, registrationId: string): Promise<TournamentRegistrationResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/tournaments/{tournament_id}/registrations/{registration_id}/approve', {
        params: { path: { tournament_id: tournamentId, registration_id: registrationId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const registration = data!.data
      const index = registrations.value.findIndex((r) => r.id === registrationId)
      if (index !== -1) {
        registrations.value[index] = registration
      }
      return registration
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to approve registration'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function rejectRegistration(
    tournamentId: string,
    registrationId: string,
    reason?: string
  ): Promise<TournamentRegistrationResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/tournaments/{tournament_id}/registrations/{registration_id}/reject', {
        params: { path: { tournament_id: tournamentId, registration_id: registrationId } },
        body: { reason: reason ?? null },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const registration = data!.data
      const index = registrations.value.findIndex((r) => r.id === registrationId)
      if (index !== -1) {
        registrations.value[index] = registration
      }
      return registration
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to reject registration'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function disqualifyRegistration(
    tournamentId: string,
    registrationId: string,
    reason: string
  ): Promise<TournamentRegistrationResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/tournaments/{tournament_id}/registrations/{registration_id}/disqualify', {
        params: { path: { tournament_id: tournamentId, registration_id: registrationId } },
        body: { reason },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const registration = data!.data
      const index = registrations.value.findIndex((r) => r.id === registrationId)
      if (index !== -1) {
        registrations.value[index] = registration
      }
      return registration
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to disqualify registration'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  // ==================== Matches & Brackets ====================

  async function fetchMatches(tournamentId: string): Promise<TournamentMatchResponse[]> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/tournaments/{tournament_id}/matches', {
        params: { path: { tournament_id: tournamentId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      matches.value = data!.data
      return matches.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch matches'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchMatch(tournamentId: string, matchId: string): Promise<TournamentMatchResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/tournaments/{tournament_id}/matches/{match_id}', {
        params: { path: { tournament_id: tournamentId, match_id: matchId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      return data!.data
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch match'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchBrackets(tournamentId: string): Promise<TournamentBracketResponse[]> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/tournaments/{tournament_id}/brackets', {
        params: { path: { tournament_id: tournamentId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      brackets.value = data!.data
      return brackets.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch brackets'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchStages(tournamentId: string): Promise<TournamentStageResponse[]> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/tournaments/{tournament_id}/stages', {
        params: { path: { tournament_id: tournamentId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      stages.value = data!.data
      return stages.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch stages'
      }
      throw e
    } finally {
      loading.value = false
    }
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
