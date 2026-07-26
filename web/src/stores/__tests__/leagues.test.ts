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
  useLeaguesStore,
  type LeagueResponse,
  type LeagueInvitationResponse,
} from '@/stores/leagues'

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

function makeLeague(overrides: Partial<LeagueResponse> = {}): LeagueResponse {
  return {
    id: 'league-1',
    name: 'Premier League',
    slug: 'premier-league',
    game_id: 'cs2',
    access_type: 'open',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as LeagueResponse
}

function makeApplication(
  overrides: Partial<LeagueInvitationResponse> = {},
): LeagueInvitationResponse {
  return {
    id: 'app-1',
    league_id: 'league-1',
    user_id: 'user-1',
    invitation_type: 'application',
    status: 'pending',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as LeagueInvitationResponse
}

const apiError = (status: number, detail: string) => ({ error: { status, detail } })

describe('Leagues Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('fetchLeagues', () => {
    it('passes pagination + filters and stores list + pagination meta', async () => {
      const list = [makeLeague()]
      const pagination = { page: 3, per_page: 5, total_items: 12, total_pages: 3 }
      mockGet.mockResolvedValue({ data: { data: list, pagination } })
      const store = useLeaguesStore()

      const result = await store.fetchLeagues(3, 5, 'cs2', 'premier')

      expect(mockGet).toHaveBeenCalledWith('/v1/leagues', {
        params: { query: { page: 3, per_page: 5, game_id: 'cs2', search: 'premier' } },
      })
      expect(result).toEqual(list)
      expect(store.leagues).toEqual(list)
      expect(store.pagination).toEqual(pagination)
    })

    it('records the error detail on failure', async () => {
      mockGet.mockResolvedValue(apiError(500, 'Database unavailable'))
      const store = useLeaguesStore()

      await expect(store.fetchLeagues()).rejects.toThrow(ApiError)
      expect(store.fetchLeaguesState.error).toBe('Database unavailable')
      expect(store.fetchLeaguesState.loading).toBe(false)
      // The store's aggregate `error` alias reads the list-fetch state.
      expect(store.error).toBe('Database unavailable')
    })
  })

  describe('fetchLeague / fetchLeagueBySlug', () => {
    it('fetches by id and sets currentLeague', async () => {
      const league = makeLeague()
      mockGet.mockResolvedValue({ data: { data: league } })
      const store = useLeaguesStore()

      const result = await store.fetchLeague('league-1')

      expect(mockGet).toHaveBeenCalledWith('/v1/leagues/{league_id}', {
        params: { path: { league_id: 'league-1' } },
      })
      expect(result).toEqual(league)
      expect(store.currentLeague).toEqual(league)
    })

    it('fetches by slug and sets currentLeague', async () => {
      const league = makeLeague()
      mockGet.mockResolvedValue({ data: { data: league } })
      const store = useLeaguesStore()

      await store.fetchLeagueBySlug('premier-league')

      expect(mockGet).toHaveBeenCalledWith('/v1/leagues/by-slug/{slug}', {
        params: { path: { slug: 'premier-league' } },
      })
      expect(store.currentLeague).toEqual(league)
    })

    it('records the error detail and rethrows on failure', async () => {
      mockGet.mockResolvedValue(apiError(404, 'League not found'))
      const store = useLeaguesStore()

      await expect(store.fetchLeague('missing')).rejects.toThrow(ApiError)
      expect(store.fetchLeagueState.error).toBe('League not found')
      expect(store.fetchLeagueState.loading).toBe(false)
      expect(store.currentLeague).toBeNull()
    })

    it('does not let a slow earlier fetch clobber a newer one (shared latest-wins guard)', async () => {
      const store = useLeaguesStore()
      const slowA = deferred<{ data: { data: LeagueResponse } }>()
      const leagueA = makeLeague({ id: 'league-a', slug: 'a' })
      const leagueB = makeLeague({ id: 'league-b', slug: 'b' })

      mockGet.mockReturnValueOnce(slowA.promise)
      const first = store.fetchLeague('league-a')

      mockGet.mockResolvedValueOnce({ data: { data: leagueB } })
      await store.fetchLeagueBySlug('b')
      expect(store.currentLeague).toEqual(leagueB)

      // The stale response arrives late — B must survive.
      slowA.resolve({ data: { data: leagueA } })
      await expect(first).resolves.toEqual(leagueA)
      expect(store.currentLeague).toEqual(leagueB)
    })
  })

  describe('createLeague', () => {
    it('POSTs the request, appends to the list and sets currentLeague', async () => {
      const created = makeLeague({ id: 'league-2', name: 'New League', slug: 'new-league' })
      mockPost.mockResolvedValue({ data: { data: created } })
      const store = useLeaguesStore()
      store.leagues = [makeLeague()]

      const request = { name: 'New League', game_id: 'cs2', access_type: 'open' } as never
      const result = await store.createLeague(request)

      expect(mockPost).toHaveBeenCalledWith('/v1/leagues', { body: request })
      expect(result).toEqual(created)
      expect(store.leagues).toHaveLength(2)
      expect(store.leagues[1]).toEqual(created)
      expect(store.currentLeague).toEqual(created)
    })

    it('records the error and leaves the list untouched on failure', async () => {
      mockPost.mockResolvedValue(apiError(409, 'A league with this slug already exists'))
      const store = useLeaguesStore()

      await expect(store.createLeague({ name: 'Dup' } as never)).rejects.toThrow(ApiError)
      expect(store.createLeagueState.error).toBe('A league with this slug already exists')
      expect(store.leagues).toHaveLength(0)
    })
  })

  describe('approveApplication (admin)', () => {
    it('POSTs the approval and removes the application from the queue', async () => {
      const store = useLeaguesStore()
      store.applications = [makeApplication(), makeApplication({ id: 'app-2', user_id: 'user-2' })]
      mockPost.mockResolvedValue({ data: null })

      await store.approveApplication('league-1', 'app-1')

      expect(mockPost).toHaveBeenCalledWith(
        '/v1/leagues/{league_id}/applications/{application_id}/approve',
        { params: { path: { league_id: 'league-1', application_id: 'app-1' } } },
      )
      expect(store.applications).toHaveLength(1)
      expect(store.applications[0]!.id).toBe('app-2')
    })

    it('keeps the application queued and records the detail on failure', async () => {
      const store = useLeaguesStore()
      store.applications = [makeApplication()]
      mockPost.mockResolvedValue(apiError(409, 'Application already processed'))

      await expect(store.approveApplication('league-1', 'app-1')).rejects.toThrow(ApiError)
      expect(store.approveApplicationState.error).toBe('Application already processed')
      expect(store.applications).toHaveLength(1)
    })
  })
})
