import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'
import { replaceById } from '@/utils/collections'

type TournamentRegistrationResponse = components['schemas']['TournamentRegistrationResponse']
type RegisterTeamRequest = components['schemas']['RegisterTeamRequest']
type RegisterPlayerRequest = components['schemas']['RegisterPlayerRequest']
type PaginationMeta = components['schemas']['PaginationMeta']
type CheckInStatusResponse = components['schemas']['CheckInStatusResponse']

/**
 * Registrations slice: registration CRUD, approvals, check-in, no-show handling.
 */
export function createRegistrationsSlice() {
  const registrations = ref<TournamentRegistrationResponse[]>([])
  const checkInStatus = ref<CheckInStatusResponse | null>(null)
  const registrationsPagination = ref<PaginationMeta>({ page: 1, per_page: 20, total_items: 0, total_pages: 0 })

  const fetchRegistrationsState = createActionState()
  const registerTeamState = createActionState()
  const registerPlayerState = createActionState()
  const withdrawState = createActionState()
  const checkInState = createActionState()
  const approveRegistrationState = createActionState()
  const rejectRegistrationState = createActionState()
  const disqualifyRegistrationState = createActionState()
  const fetchCheckInStatusState = createActionState()
  const processNoShowsState = createActionState()
  const adminCheckInState = createActionState()

  async function fetchRegistrations(
    tournamentId: string,
    filters?: { status?: string; page?: number; per_page?: number }
  ): Promise<TournamentRegistrationResponse[]> {
    return withActionState(fetchRegistrationsState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/registrations', {
        params: { path: { tournament_id: tournamentId }, query: filters },
      }))
      registrations.value = result.data
      registrationsPagination.value = result.pagination
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
      registrations.value.push(result.data)
      return result.data
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
      registrations.value.push(result.data)
      return result.data
    }, 'Failed to register for tournament')
  }

  async function withdrawFromTournament(tournamentId: string, registrationId: string): Promise<void> {
    return withActionState(withdrawState, async () => {
      await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/registrations/{registration_id}/withdraw', {
        params: { path: { tournament_id: tournamentId, registration_id: registrationId } },
        body: {},
      }))
      // Withdraw returns a WithdrawalResponse, not a registration. Patch locally.
      const reg = registrations.value.find((r) => r.id === registrationId)
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
      replaceById(registrations.value, result.data)
      return result.data
    }, 'Failed to check in')
  }

  async function approveRegistration(tournamentId: string, registrationId: string): Promise<TournamentRegistrationResponse> {
    return withActionState(approveRegistrationState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/registrations/{registration_id}/approve', {
        params: { path: { tournament_id: tournamentId, registration_id: registrationId } },
      }))
      replaceById(registrations.value, result.data)
      return result.data
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
      replaceById(registrations.value, result.data)
      return result.data
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
      replaceById(registrations.value, result.data)
      return result.data
    }, 'Failed to disqualify registration')
  }

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

  async function adminCheckIn(tournamentId: string, registrationId: string): Promise<TournamentRegistrationResponse> {
    return withActionState(adminCheckInState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/registrations/{registration_id}/admin-check-in', {
        params: { path: { tournament_id: tournamentId, registration_id: registrationId } },
      }))
      replaceById(registrations.value, result.data)
      return result.data
    }, 'Failed to admin check-in')
  }

  function clear() {
    registrations.value = []
    checkInStatus.value = null
  }

  return {
    // State
    registrations,
    checkInStatus,
    // Per-action states
    fetchRegistrationsState,
    registerTeamState,
    registerPlayerState,
    withdrawState,
    checkInState,
    approveRegistrationState,
    rejectRegistrationState,
    disqualifyRegistrationState,
    fetchCheckInStatusState,
    processNoShowsState,
    adminCheckInState,
    // Actions
    fetchRegistrations,
    registerTeam,
    registerPlayer,
    withdrawFromTournament,
    checkIn,
    approveRegistration,
    rejectRegistration,
    disqualifyRegistration,
    fetchCheckInStatus,
    processNoShows,
    adminCheckIn,
    clear,
  }
}
