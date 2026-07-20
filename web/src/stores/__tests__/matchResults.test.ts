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
  useMatchResultsStore,
  type ResultClaimResponse,
  type GameResultInput,
} from '@/stores/matchResults'

const mockGet = api.GET as unknown as Mock
const mockPost = api.POST as unknown as Mock

function makeClaim(overrides: Partial<ResultClaimResponse> = {}): ResultClaimResponse {
  return {
    id: 'claim-1',
    match_id: 'match-1',
    claimed_winner_registration_id: 'reg-a',
    participant1_score: 2,
    participant2_score: 1,
    status: 'pending',
    submitted_by_registration_id: 'reg-a',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as ResultClaimResponse
}

const apiError = (status: number, detail: string) => ({ error: { status, detail } })

describe('Match Results Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('submitResult', () => {
    it('builds the full payload (game_results with map_id pass through) and stores the claim', async () => {
      const claim = makeClaim()
      mockPost.mockResolvedValue({ data: { data: { claim, auto_confirm_at: null } } })
      const store = useMatchResultsStore()

      const gameResults = [
        {
          game_number: 1,
          map_id: 'de_inferno',
          participant1_score: 13,
          participant2_score: 7,
          demo_link_id: 'demo-1',
        },
        {
          game_number: 2,
          map_id: 'de_nuke',
          participant1_score: 13,
          participant2_score: 11,
        },
      ] as GameResultInput[]

      const result = await store.submitResult(
        'match-1',
        'reg-a',
        2,
        0,
        gameResults,
        ['ev-1'],
        ['demo-1'],
        'gg',
      )

      expect(mockPost).toHaveBeenCalledWith('/v1/matches/{match_id}/result', {
        params: { path: { match_id: 'match-1' } },
        body: {
          claimed_winner_registration_id: 'reg-a',
          participant1_score: 2,
          participant2_score: 0,
          game_results: gameResults,
          evidence_ids: ['ev-1'],
          demo_link_ids: ['demo-1'],
          notes: 'gg',
        },
      })
      expect(result.claim).toEqual(claim)
      expect(store.currentResult).toEqual(claim)
    })

    it('defaults optional arrays to empty and notes to null', async () => {
      mockPost.mockResolvedValue({ data: { data: { claim: makeClaim() } } })
      const store = useMatchResultsStore()

      await store.submitResult('match-1', 'reg-a', 1, 0)

      expect(mockPost).toHaveBeenCalledWith('/v1/matches/{match_id}/result', {
        params: { path: { match_id: 'match-1' } },
        body: {
          claimed_winner_registration_id: 'reg-a',
          participant1_score: 1,
          participant2_score: 0,
          game_results: [],
          evidence_ids: [],
          demo_link_ids: [],
          notes: null,
        },
      })
    })

    it('records the error and leaves currentResult untouched on failure', async () => {
      mockPost.mockResolvedValue(apiError(409, 'A pending claim already exists'))
      const store = useMatchResultsStore()

      await expect(store.submitResult('match-1', 'reg-a', 1, 0)).rejects.toThrow(ApiError)
      expect(store.submitResultState.error).toBe('A pending claim already exists')
      expect(store.submitResultState.loading).toBe(false)
      expect(store.currentResult).toBeNull()
    })
  })

  describe('fetchCurrentResult', () => {
    it('stores the pending claim', async () => {
      const claim = makeClaim()
      mockGet.mockResolvedValue({ data: { data: claim } })
      const store = useMatchResultsStore()

      const result = await store.fetchCurrentResult('match-1')

      expect(mockGet).toHaveBeenCalledWith('/v1/matches/{match_id}/result', {
        params: { path: { match_id: 'match-1' } },
      })
      expect(result).toEqual(claim)
      expect(store.currentResult).toEqual(claim)
    })

    it('treats 404 as "no pending claim": resolves null without an error', async () => {
      const store = useMatchResultsStore()
      store.currentResult = makeClaim()
      mockGet.mockResolvedValue(apiError(404, 'No pending result claim'))

      await expect(store.fetchCurrentResult('match-1')).resolves.toBeNull()
      expect(store.currentResult).toBeNull()
      expect(store.fetchCurrentResultState.error).toBeNull()
      expect(store.fetchCurrentResultState.loading).toBe(false)
    })

    it('still surfaces non-404 failures through the action state', async () => {
      mockGet.mockResolvedValue(apiError(500, 'Database unavailable'))
      const store = useMatchResultsStore()

      await expect(store.fetchCurrentResult('match-1')).rejects.toThrow(ApiError)
      expect(store.fetchCurrentResultState.error).toBe('Database unavailable')
    })
  })

  describe('fetchResultHistory', () => {
    it('stores the claim history', async () => {
      const history = [makeClaim({ status: 'superseded' }), makeClaim({ id: 'claim-2' })]
      mockGet.mockResolvedValue({ data: { data: history } })
      const store = useMatchResultsStore()

      const result = await store.fetchResultHistory('match-1')

      expect(mockGet).toHaveBeenCalledWith('/v1/matches/{match_id}/result/history', {
        params: { path: { match_id: 'match-1' } },
      })
      expect(result).toEqual(history)
      expect(store.resultHistory).toEqual(history)
    })
  })

  describe('confirmResult', () => {
    it('POSTs the confirmation and updates currentResult with the confirmed claim', async () => {
      const confirmed = makeClaim({ status: 'confirmed' })
      mockPost.mockResolvedValue({ data: { data: { claim: confirmed, match_completed: true } } })
      const store = useMatchResultsStore()
      store.currentResult = makeClaim()

      const result = await store.confirmResult('match-1', 'claim-1')

      expect(mockPost).toHaveBeenCalledWith('/v1/matches/{match_id}/result/{claim_id}/confirm', {
        params: { path: { match_id: 'match-1', claim_id: 'claim-1' } },
      })
      expect(result.claim).toEqual(confirmed)
      expect(store.currentResult).toEqual(confirmed)
    })

    it('records the error detail when the submitter tries to self-confirm', async () => {
      mockPost.mockResolvedValue(apiError(403, 'Cannot confirm your own claim'))
      const store = useMatchResultsStore()

      await expect(store.confirmResult('match-1', 'claim-1')).rejects.toThrow(ApiError)
      expect(store.confirmResultState.error).toBe('Cannot confirm your own claim')
      expect(store.confirmResultState.loading).toBe(false)
    })
  })

  describe('clear', () => {
    it('resets result state and errors', async () => {
      const store = useMatchResultsStore()
      store.currentResult = makeClaim()
      store.resultHistory = [makeClaim()]

      store.clear()

      expect(store.currentResult).toBeNull()
      expect(store.resultHistory).toHaveLength(0)
      expect(store.error).toBeNull()
    })
  })
})
