import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock only the `api` client; keep ApiError & friends real so the store
// helpers (unwrapApi/withActionState) behave exactly as in production.
vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: {
      GET: vi.fn(),
      POST: vi.fn(),
      PUT: vi.fn(),
      DELETE: vi.fn(),
      PATCH: vi.fn(),
    },
  }
})

import { api, ApiError } from '@/api'
import {
  useTournamentsStore,
  type TournamentResponse,
  type TournamentMatchResponse,
  type TournamentRegistrationResponse,
} from '@/stores/tournaments'

const mockGet = api.GET as unknown as Mock
const mockPost = api.POST as unknown as Mock

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function makeTournament(overrides: Partial<TournamentResponse> = {}): TournamentResponse {
  return {
    id: 'tourn-1',
    name: 'Winter Cup',
    slug: 'winter-cup',
    status: 'draft',
    format: 'single_elimination',
    participant_type: 'individual',
    game_id: 'cs2',
    starts_at: '2026-02-01T18:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as TournamentResponse
}

function makeMatch(overrides: Partial<TournamentMatchResponse> = {}): TournamentMatchResponse {
  return {
    id: 'match-1',
    tournament_id: 'tourn-1',
    bracket_id: 'bracket-1',
    round: 1,
    match_number: 1,
    status: 'scheduled',
    participant1_registration_id: 'reg-a',
    participant2_registration_id: 'reg-b',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as TournamentMatchResponse
}

function makeRegistration(
  overrides: Partial<TournamentRegistrationResponse> = {},
): TournamentRegistrationResponse {
  return {
    id: 'reg-1',
    tournament_id: 'tourn-1',
    player_id: 'player-1',
    status: 'registered',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as TournamentRegistrationResponse
}

const apiError = (status: number, detail: string) => ({ error: { status, detail } })

describe('Tournaments Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('fetchTournaments', () => {
    it('passes filters through and stores list + pagination', async () => {
      const list = [makeTournament()]
      const pagination = { page: 2, per_page: 10, total_items: 11, total_pages: 2 }
      mockGet.mockResolvedValue({ data: { data: list, pagination } })
      const store = useTournamentsStore()

      const result = await store.fetchTournaments({ status: 'published', page: 2, per_page: 10 })

      expect(mockGet).toHaveBeenCalledWith('/v1/tournaments', {
        params: { query: { status: 'published', page: 2, per_page: 10 } },
      })
      expect(result).toEqual(list)
      expect(store.tournaments).toEqual(list)
      expect(store.pagination).toEqual(pagination)
    })
  })

  describe('fetchTournament / fetchTournamentBySlug', () => {
    it('fetches by id and sets currentTournament', async () => {
      const tournament = makeTournament()
      mockGet.mockResolvedValue({ data: { data: tournament } })
      const store = useTournamentsStore()

      const result = await store.fetchTournament('tourn-1')

      expect(mockGet).toHaveBeenCalledWith('/v1/tournaments/{tournament_id}', {
        params: { path: { tournament_id: 'tourn-1' } },
      })
      expect(result).toEqual(tournament)
      expect(store.currentTournament).toEqual(tournament)
      expect(store.fetchTournamentState.loading).toBe(false)
      expect(store.fetchTournamentState.error).toBeNull()
    })

    it('fetches by slug and sets currentTournament', async () => {
      const tournament = makeTournament()
      mockGet.mockResolvedValue({ data: { data: tournament } })
      const store = useTournamentsStore()

      await store.fetchTournamentBySlug('winter-cup')

      expect(mockGet).toHaveBeenCalledWith('/v1/tournaments/by-slug/{slug}', {
        params: { path: { slug: 'winter-cup' } },
      })
      expect(store.currentTournament).toEqual(tournament)
    })

    it('records the error detail, rethrows and leaves currentTournament null', async () => {
      mockGet.mockResolvedValue(apiError(404, 'Tournament not found'))
      const store = useTournamentsStore()

      await expect(store.fetchTournament('missing')).rejects.toThrow(ApiError)
      expect(store.fetchTournamentState.error).toBe('Tournament not found')
      expect(store.fetchTournamentState.loading).toBe(false)
      expect(store.currentTournament).toBeNull()
    })

    it('does not let a slow earlier fetch clobber a newer one (shared latest-wins guard)', async () => {
      const store = useTournamentsStore()
      const slowA = deferred<{ data: { data: TournamentResponse } }>()
      const tournamentA = makeTournament({ id: 'tourn-a', slug: 'a' })
      const tournamentB = makeTournament({ id: 'tourn-b', slug: 'b' })

      // First request (by id) hangs; the user navigates and a by-slug fetch
      // starts and completes first.
      mockGet.mockReturnValueOnce(slowA.promise)
      const first = store.fetchTournament('tourn-a')

      mockGet.mockResolvedValueOnce({ data: { data: tournamentB } })
      await store.fetchTournamentBySlug('b')
      expect(store.currentTournament).toEqual(tournamentB)

      // The stale response finally arrives — it must not overwrite B.
      slowA.resolve({ data: { data: tournamentA } })
      await expect(first).resolves.toEqual(tournamentA)
      expect(store.currentTournament).toEqual(tournamentB)
    })

    it('reference-counts loading across overlapping invocations of the same action', async () => {
      const store = useTournamentsStore()
      const first = deferred<{ data: { data: TournamentResponse } }>()
      const second = deferred<{ data: { data: TournamentResponse } }>()
      mockGet.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

      const p1 = store.fetchTournament('tourn-1')
      const p2 = store.fetchTournament('tourn-1')
      expect(store.fetchTournamentState.loading).toBe(true)

      first.resolve({ data: { data: makeTournament() } })
      await p1
      // The second invocation is still in flight — the spinner must not clear.
      expect(store.fetchTournamentState.loading).toBe(true)

      second.resolve({ data: { data: makeTournament() } })
      await p2
      expect(store.fetchTournamentState.loading).toBe(false)
    })
  })

  describe('fetchMatches / fetchMatch', () => {
    it('stores the match list for the fetched tournament', async () => {
      const matches = [makeMatch()]
      mockGet.mockResolvedValue({ data: { data: matches } })
      const store = useTournamentsStore()

      const result = await store.fetchMatches('tourn-1')

      expect(mockGet).toHaveBeenCalledWith('/v1/tournaments/{tournament_id}/matches', {
        params: { path: { tournament_id: 'tourn-1' } },
      })
      expect(result).toEqual(matches)
      expect(store.matches).toEqual(matches)
    })

    it('always hits the network and updates the cached list entry for the same tournament', async () => {
      const store = useTournamentsStore()
      mockGet.mockResolvedValueOnce({ data: { data: [makeMatch({ status: 'scheduled' })] } })
      await store.fetchMatches('tourn-1')

      const updated = makeMatch({ status: 'in_progress' })
      mockGet.mockResolvedValue({ data: { data: updated } })

      await store.fetchMatch('tourn-1', 'match-1')
      await store.fetchMatch('tourn-1', 'match-1')

      // Both calls hit GET — the store never serves fetchMatch from cache.
      const matchCalls = mockGet.mock.calls.filter(
        (c) => c[0] === '/v1/tournaments/{tournament_id}/matches/{match_id}',
      )
      expect(matchCalls).toHaveLength(2)
      expect(matchCalls[0]![1]).toEqual({
        params: { path: { tournament_id: 'tourn-1', match_id: 'match-1' } },
      })
      // The cached list entry is kept coherent via replaceById.
      expect(store.matches).toHaveLength(1)
      expect(store.matches[0]!.status).toBe('in_progress')
    })

    it('leaves the cached list alone when it belongs to a different tournament', async () => {
      const store = useTournamentsStore()
      mockGet.mockResolvedValueOnce({ data: { data: [makeMatch()] } })
      await store.fetchMatches('tourn-1')

      const other = makeMatch({ id: 'match-1', tournament_id: 'tourn-2', status: 'completed' })
      mockGet.mockResolvedValueOnce({ data: { data: other } })
      const result = await store.fetchMatch('tourn-2', 'match-1')

      expect(result).toEqual(other)
      // tourn-1's cached list must not absorb tourn-2's match.
      expect(store.matches[0]!.status).toBe('scheduled')
    })
  })

  describe('clearCurrent', () => {
    it('resets matches, brackets and the tournament-id association', async () => {
      const store = useTournamentsStore()
      mockGet.mockResolvedValueOnce({ data: { data: [makeMatch()] } })
      await store.fetchMatches('tourn-1')
      mockGet.mockResolvedValueOnce({
        data: { data: [{ id: 'bracket-1', tournament_id: 'tourn-1' }] },
      })
      await store.fetchBrackets('tourn-1')
      mockGet.mockResolvedValueOnce({ data: { data: makeTournament() } })
      await store.fetchTournament('tourn-1')

      store.clearCurrent()

      expect(store.matches).toHaveLength(0)
      expect(store.brackets).toHaveLength(0)
      expect(store.currentTournament).toBeNull()

      // matchesTournamentId was reset too: a fresh fetchMatch for the old
      // tournament must not resurrect anything into the cleared list.
      mockGet.mockResolvedValueOnce({ data: { data: makeMatch() } })
      await store.fetchMatch('tourn-1', 'match-1')
      expect(store.matches).toHaveLength(0)
    })
  })

  describe('publishTournament (lifecycle)', () => {
    it('POSTs publish, sets currentTournament and updates the summary list status', async () => {
      const store = useTournamentsStore()
      store.tournaments = [
        { id: 'tourn-1', name: 'Winter Cup', slug: 'winter-cup', status: 'draft' } as never,
      ]
      const published = makeTournament({ status: 'published' })
      mockPost.mockResolvedValue({ data: { data: published } })

      const result = await store.publishTournament('tourn-1')

      expect(mockPost).toHaveBeenCalledWith('/v1/tournaments/{tournament_id}/publish', {
        params: { path: { tournament_id: 'tourn-1' } },
      })
      expect(result).toEqual(published)
      expect(store.currentTournament).toEqual(published)
      expect(store.tournaments[0]!.status).toBe('published')
    })

    it('captures the conflict detail on failure', async () => {
      mockPost.mockResolvedValue(apiError(409, 'Tournament is not in draft status'))
      const store = useTournamentsStore()

      await expect(store.publishTournament('tourn-1')).rejects.toThrow(ApiError)
      expect(store.publishState.error).toBe('Tournament is not in draft status')
      expect(store.publishState.loading).toBe(false)
    })
  })

  describe('registerPlayer (registrations)', () => {
    it('POSTs the registration and appends it to the list', async () => {
      const registration = makeRegistration()
      mockPost.mockResolvedValue({ data: { data: registration } })
      const store = useTournamentsStore()

      const result = await store.registerPlayer('tourn-1', { player_id: 'player-1' } as never)

      expect(mockPost).toHaveBeenCalledWith('/v1/tournaments/{tournament_id}/registrations/player', {
        params: { path: { tournament_id: 'tourn-1' } },
        body: { player_id: 'player-1' },
      })
      expect(result).toEqual(registration)
      expect(store.registrations).toContainEqual(registration)
    })

    it('records the error and leaves registrations untouched on failure', async () => {
      mockPost.mockResolvedValue(apiError(409, 'Registration is closed'))
      const store = useTournamentsStore()

      await expect(
        store.registerPlayer('tourn-1', { player_id: 'player-1' } as never),
      ).rejects.toThrow(ApiError)
      expect(store.registerPlayerState.error).toBe('Registration is closed')
      expect(store.registrations).toHaveLength(0)
    })
  })
})
