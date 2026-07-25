import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'
import { replaceById, upsertById } from '@/utils/collections'

type TournamentRegistrationResponse = components['schemas']['TournamentRegistrationResponse']
type RegisterTeamRequest = components['schemas']['RegisterTeamRequest']
type RegisterPlayerRequest = components['schemas']['RegisterPlayerRequest']
type PaginationMeta = components['schemas']['PaginationMeta']
type CheckInStatusResponse = components['schemas']['CheckInStatusResponse']
type TournamentRegistrationCountsResponse =
  components['schemas']['TournamentRegistrationCountsResponse']

/** Rows per page for the registrations table feed. */
export const REGISTRATIONS_PAGE_SIZE = 20

/**
 * Registrations slice: registration CRUD, approvals, check-in, no-show handling.
 */
export function createRegistrationsSlice() {
  const registrations = ref<TournamentRegistrationResponse[]>([])
  const checkInStatus = ref<CheckInStatusResponse | null>(null)
  const registrationsPagination = ref<PaginationMeta>({ page: 1, per_page: 20, total_items: 0, total_pages: 0 })
  /**
   * The current user's own registrations in the tournament on screen (P-167).
   *
   * NOT derived from `registrations`: that list is one page (20 rows by
   * default, 100 at most), and searching it for yourself told every
   * participant past row 20 that they were not registered — no Registered
   * state, no withdraw control, no check-in. Resolved server-side instead, by
   * the same rule that authorizes result submission and disputes, so the page
   * cannot offer an affordance the API will refuse.
   */
  const myRegistrations = ref<TournamentRegistrationResponse[]>([])
  /**
   * Real per-status counts (P-167). The participant chip, the
   * `n / max_participants` capacity read and the pending-approvals badge were
   * all `page.length`, so a 64-slot tournament with 40 entrants rendered
   * "20 / 64" and an organiser saw "20 pending approvals" however many were
   * waiting.
   */
  const registrationCounts = ref<TournamentRegistrationCountsResponse | null>(null)

  const fetchRegistrationsState = createActionState()
  const fetchMyRegistrationsState = createActionState()
  const fetchRegistrationCountsState = createActionState()
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

  /**
   * One page of a tournament's registrations, for a table to render.
   *
   * The page size is now explicit at the store boundary rather than inherited
   * from the API default, because "20" arriving invisibly is what let every
   * caller treat this list as if it were the whole thing (P-167). It is a
   * TABLE FEED: do not answer "am I registered?", "is my team in?" or "how
   * many are there?" from it — use `fetchMyRegistrations` and
   * `fetchRegistrationCounts`, which do not depend on where a row sorts.
   */
  async function fetchRegistrations(
    tournamentId: string,
    filters?: { status?: string; page?: number; per_page?: number }
  ): Promise<TournamentRegistrationResponse[]> {
    return withActionState(fetchRegistrationsState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/registrations', {
        params: {
          path: { tournament_id: tournamentId },
          query: {
            ...filters,
            page: filters?.page ?? 1,
            per_page: filters?.per_page ?? REGISTRATIONS_PAGE_SIZE,
          },
        },
      }))
      registrations.value = result.data
      registrationsPagination.value = result.pagination
      return registrations.value
    }, 'Failed to fetch registrations')
  }

  /**
   * Resolve the caller's own registrations in a tournament (P-167).
   *
   * Deliberately a separate request rather than a filter over
   * `fetchRegistrations`: the answer must not depend on where the caller's row
   * happens to sort. Returns terminal rows too (withdrawn / disqualified), so
   * callers can tell "withdrew" from "never entered" — they filter.
   */
  async function fetchMyRegistrations(tournamentId: string): Promise<TournamentRegistrationResponse[]> {
    return withActionState(fetchMyRegistrationsState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/registrations/me', {
        params: { path: { tournament_id: tournamentId } },
      }))
      myRegistrations.value = result.data.registrations
      return myRegistrations.value
    }, 'Failed to resolve your registration')
  }

  /** Real per-status registration counts for a tournament (P-167). */
  async function fetchRegistrationCounts(tournamentId: string): Promise<TournamentRegistrationCountsResponse> {
    return withActionState(fetchRegistrationCountsState, async () => {
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}/registrations/counts', {
        params: { path: { tournament_id: tournamentId } },
      }))
      registrationCounts.value = result.data
      return result.data
    }, 'Failed to fetch registration counts')
  }

  /**
   * P-179 — keep the server-sourced counts honest after a mutation.
   *
   * P-167 replaced `registrations.filter(r => r.status === 'pending').length`
   * with a real server count, which fixed a badge computed from a 20-row page.
   * But the old computation had a property the new one lost: it was derived
   * from the same reactive array the mutations write to, so approving a
   * registration updated it for free. `registrationCounts` is a separate ref
   * written ONLY by `fetchRegistrationCounts`, and approve/reject/disqualify/
   * withdraw all `replaceById` into `registrations` without touching it — so
   * the badge was correct on load and stale after every action taken on it.
   *
   * Refetch rather than adjust locally: a local decrement has to mirror server
   * semantics exactly to stay right, and it cannot see another organiser
   * working the same queue. This is an admin surface, not a hot path.
   *
   * On failure the counts are CLEARED, not left. The mutation itself succeeded,
   * so failing it now would be a lie in the other direction — but leaving the
   * previous number is precisely the defect being fixed. "Unknown" is honest;
   * a confidently wrong count is not.
   *
   * No-ops when nothing has loaded counts, so pages that never display them pay
   * nothing.
   */
  async function refreshRegistrationCounts(tournamentId: string): Promise<void> {
    if (registrationCounts.value === null) return
    try {
      await fetchRegistrationCounts(tournamentId)
    } catch {
      registrationCounts.value = null
    }
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
      // The row is the caller's by construction — keep the identity list
      // coherent without a refetch.
      upsertById(myRegistrations.value, result.data)
      await refreshRegistrationCounts(tournamentId)
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
      upsertById(myRegistrations.value, result.data)
      await refreshRegistrationCounts(tournamentId)
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
      for (const list of [registrations.value, myRegistrations.value]) {
        const reg = list.find((r) => r.id === registrationId)
        if (reg) {
          reg.status = 'withdrawn'
          reg.withdrawn_at = new Date().toISOString()
        }
      }
      await refreshRegistrationCounts(tournamentId)
    }, 'Failed to withdraw from tournament')
  }

  async function checkIn(tournamentId: string, registrationId: string): Promise<TournamentRegistrationResponse> {
    return withActionState(checkInState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/registrations/{registration_id}/check-in', {
        params: { path: { tournament_id: tournamentId, registration_id: registrationId } },
      }))
      replaceById(registrations.value, result.data)
      replaceById(myRegistrations.value, result.data)
      return result.data
    }, 'Failed to check in')
  }

  async function approveRegistration(tournamentId: string, registrationId: string): Promise<TournamentRegistrationResponse> {
    return withActionState(approveRegistrationState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/registrations/{registration_id}/approve', {
        params: { path: { tournament_id: tournamentId, registration_id: registrationId } },
      }))
      replaceById(registrations.value, result.data)
      await refreshRegistrationCounts(tournamentId)
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
      await refreshRegistrationCounts(tournamentId)
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
      await refreshRegistrationCounts(tournamentId)
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
    myRegistrations.value = []
    registrationCounts.value = null
    checkInStatus.value = null
  }

  return {
    // State
    registrations,
    // Exposed so the participant tables can render a real pager: the list is
    // server-paginated, and without the meta the pages past the first were
    // simply unreachable (P-167).
    registrationsPagination,
    myRegistrations,
    registrationCounts,
    checkInStatus,
    // Per-action states
    fetchRegistrationsState,
    fetchMyRegistrationsState,
    fetchRegistrationCountsState,
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
    fetchMyRegistrations,
    fetchRegistrationCounts,
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
