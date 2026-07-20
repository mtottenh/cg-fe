import { ref, computed } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState, createLatestGuard } from '@/stores/helpers'
import { updateById } from '@/utils/collections'

type TournamentResponse = components['schemas']['TournamentResponse']
type TournamentSummaryResponse = components['schemas']['TournamentSummaryResponse']
type TournamentMatchResponse = components['schemas']['TournamentMatchResponse']
type CreateTournamentRequest = components['schemas']['CreateTournamentRequest']
type UpdateTournamentRequest = components['schemas']['UpdateTournamentRequest']
type PaginationMeta = components['schemas']['PaginationMeta']

/**
 * Lifecycle slice: tournament CRUD + status transitions.
 *
 * Intentionally does NOT hold registrations/matches/brackets — those belong to
 * the other slices. But `generateNextRound` needs to refresh brackets + matches,
 * so it accepts refreshers as callbacks.
 */
export function createLifecycleSlice(refreshers: {
  refreshBrackets: (tournamentId: string) => Promise<unknown>
  refreshMatches: (tournamentId: string) => Promise<unknown>
}) {
  // State
  const tournaments = ref<TournamentSummaryResponse[]>([])
  const currentTournament = ref<TournamentResponse | null>(null)
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

  // Shared guard: both fetchers write `currentTournament`, so a slow response
  // from either must not clobber a newer one after a route change.
  const beginCurrentTournamentFetch = createLatestGuard()

  async function fetchTournament(id: string): Promise<TournamentResponse> {
    return withActionState(fetchTournamentState, async () => {
      const isCurrent = beginCurrentTournamentFetch()
      const result = await unwrapApi(api.GET('/v1/tournaments/{tournament_id}', {
        params: { path: { tournament_id: id } },
      }))
      if (isCurrent()) currentTournament.value = result.data
      return result.data
    }, 'Failed to fetch tournament')
  }

  async function fetchTournamentBySlug(slug: string): Promise<TournamentResponse> {
    return withActionState(fetchTournamentBySlugState, async () => {
      const isCurrent = beginCurrentTournamentFetch()
      const result = await unwrapApi(api.GET('/v1/tournaments/by-slug/{slug}', {
        params: { path: { slug } },
      }))
      if (isCurrent()) currentTournament.value = result.data
      return result.data
    }, 'Failed to fetch tournament')
  }

  async function createTournament(req: CreateTournamentRequest): Promise<TournamentResponse> {
    return withActionState(createTournamentState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments', { body: req }))
      currentTournament.value = result.data
      return result.data
    }, 'Failed to create tournament')
  }

  async function updateTournament(id: string, req: UpdateTournamentRequest): Promise<TournamentResponse> {
    return withActionState(updateTournamentState, async () => {
      const result = await unwrapApi(api.PATCH('/v1/tournaments/{tournament_id}', {
        params: { path: { tournament_id: id } },
        body: req,
      }))
      currentTournament.value = result.data
      updateById(tournaments.value, id, {
        name: currentTournament.value.name,
        slug: currentTournament.value.slug,
        status: currentTournament.value.status,
        starts_at: currentTournament.value.starts_at,
      })
      return currentTournament.value
    }, 'Failed to update tournament')
  }

  // Status transitions

  async function publishTournament(id: string): Promise<TournamentResponse> {
    return withActionState(publishState, async () => {
      const result = await unwrapApi(api.POST('/v1/tournaments/{tournament_id}/publish', {
        params: { path: { tournament_id: id } },
      }))
      currentTournament.value = result.data
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
      await Promise.all([refreshers.refreshBrackets(tournamentId), refreshers.refreshMatches(tournamentId)])
      return result.data
    }, 'Failed to generate next round')
  }

  function clearTournaments() {
    tournaments.value = []
  }

  function clearCurrent() {
    currentTournament.value = null
  }

  return {
    // State
    tournaments,
    currentTournament,
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
    // Actions
    fetchTournaments,
    fetchTournament,
    fetchTournamentBySlug,
    createTournament,
    updateTournament,
    publishTournament,
    openRegistration,
    closeRegistration,
    reopenRegistration,
    startTournament,
    cancelTournament,
    completeTournament,
    finalizeTournament,
    generateNextRound,
    clearTournaments,
    clearCurrent,
  }
}
