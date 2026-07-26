import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock only the `api` client; keep ApiError & friends real so the store
// helpers (unwrapApi/unwrapApiOptional/withActionState) behave exactly as in
// production.
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
  useDisputesStore,
  type DisputeResponse,
  type DisputeMessageResponse,
} from '@/stores/disputes'

const mockGet = api.GET as unknown as Mock
const mockPost = api.POST as unknown as Mock

function makeDispute(overrides: Partial<DisputeResponse> = {}): DisputeResponse {
  return {
    id: 'dispute-1',
    tournament_id: 'tourn-1',
    match_id: 'match-1',
    raised_by_registration_id: 'reg-a',
    reason: 'wrong_score',
    description: 'The reported score is wrong',
    status: 'open',
    priority: 'normal',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as DisputeResponse
}

function makeMessage(overrides: Partial<DisputeMessageResponse> = {}): DisputeMessageResponse {
  return {
    id: 'msg-1',
    dispute_id: 'dispute-1',
    message: 'Please provide evidence',
    is_internal: false,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as DisputeMessageResponse
}

const apiError = (status: number, detail: string) => ({ error: { status, detail } })

describe('Disputes Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('fetchMatchDispute', () => {
    it('stores the active dispute for the match', async () => {
      const dispute = makeDispute()
      mockGet.mockResolvedValue({ data: { data: dispute } })
      const store = useDisputesStore()

      const result = await store.fetchMatchDispute('tourn-1', 'match-1')

      expect(mockGet).toHaveBeenCalledWith(
        '/v1/tournaments/{tournament_id}/matches/{match_id}/dispute',
        { params: { path: { tournament_id: 'tourn-1', match_id: 'match-1' } } },
      )
      expect(result).toEqual(dispute)
      expect(store.matchDispute).toEqual(dispute)
      expect(store.fetchMatchDisputeState.error).toBeNull()
    })

    it('treats 404 as "no active dispute": resolves null without an error', async () => {
      const store = useDisputesStore()
      store.matchDispute = makeDispute()
      mockGet.mockResolvedValue(apiError(404, 'No dispute for this match'))

      await expect(store.fetchMatchDispute('tourn-1', 'match-1')).resolves.toBeNull()
      expect(store.matchDispute).toBeNull()
      expect(store.fetchMatchDisputeState.error).toBeNull()
      expect(store.fetchMatchDisputeState.loading).toBe(false)
    })

    it('surfaces non-404 failures instead of rendering as "no dispute"', async () => {
      mockGet.mockResolvedValue(apiError(500, 'Database unavailable'))
      const store = useDisputesStore()

      await expect(store.fetchMatchDispute('tourn-1', 'match-1')).rejects.toThrow(ApiError)
      expect(store.fetchMatchDisputeState.error).toBe('Database unavailable')
    })
  })

  describe('fetchDisputes (admin queue)', () => {
    it('passes filters + pagination and stores the queue', async () => {
      const disputes = [makeDispute()]
      mockGet.mockResolvedValue({ data: { data: { disputes, total: 7 } } })
      const store = useDisputesStore()

      const result = await store.fetchDisputes({ status: 'open', page: 2 })

      expect(mockGet).toHaveBeenCalledWith('/v1/admin/disputes', {
        params: {
          query: {
            status: 'open',
            priority: undefined,
            tournament_id: undefined,
            match_id: undefined,
            page: 2,
            page_size: 20,
          },
        },
      })
      expect(result).toEqual(disputes)
      expect(store.disputes).toEqual(disputes)
      expect(store.pagination.total).toBe(7)
      expect(store.pagination.page).toBe(2)
    })
  })

  describe('fetchDispute', () => {
    it('stores the dispute and its message thread', async () => {
      const dispute = makeDispute()
      const messages = [makeMessage()]
      mockGet.mockResolvedValue({ data: { data: { dispute, messages } } })
      const store = useDisputesStore()

      await store.fetchDispute('dispute-1')

      expect(mockGet).toHaveBeenCalledWith('/v1/disputes/{dispute_id}', {
        params: { path: { dispute_id: 'dispute-1' } },
      })
      expect(store.currentDispute).toEqual(dispute)
      expect(store.currentThread).toEqual(messages)
    })

    it('records the error detail on failure', async () => {
      mockGet.mockResolvedValue(apiError(404, 'Dispute not found'))
      const store = useDisputesStore()

      await expect(store.fetchDispute('missing')).rejects.toThrow(ApiError)
      expect(store.fetchDisputeState.error).toBe('Dispute not found')
      expect(store.currentDispute).toBeNull()
    })
  })

  describe('addMessage (admin thread)', () => {
    it('POSTs the message with internal flag + evidence and appends to the thread', async () => {
      const msg = makeMessage({ id: 'msg-2', message: 'Internal note', is_internal: true })
      mockPost.mockResolvedValue({ data: { data: msg } })
      const store = useDisputesStore()
      store.currentThread = [makeMessage()]

      const result = await store.addMessage('dispute-1', 'Internal note', true, ['ev-1'])

      expect(mockPost).toHaveBeenCalledWith('/v1/admin/disputes/{dispute_id}/messages', {
        params: { path: { dispute_id: 'dispute-1' } },
        body: { message: 'Internal note', is_internal: true, evidence_ids: ['ev-1'] },
      })
      expect(result).toEqual(msg)
      expect(store.currentThread).toHaveLength(2)
      expect(store.currentThread[1]).toEqual(msg)
    })
  })

  describe('addPlayerMessage', () => {
    it('POSTs to the player endpoint (no internal flag) and appends to the thread', async () => {
      const msg = makeMessage({ id: 'msg-3', message: 'Here is my POV demo' })
      mockPost.mockResolvedValue({ data: { data: msg } })
      const store = useDisputesStore()

      const result = await store.addPlayerMessage('dispute-1', 'Here is my POV demo', ['ev-2'])

      expect(mockPost).toHaveBeenCalledWith('/v1/disputes/{dispute_id}/messages', {
        params: { path: { dispute_id: 'dispute-1' } },
        body: { message: 'Here is my POV demo', evidence_ids: ['ev-2'] },
      })
      expect(result).toEqual(msg)
      expect(store.currentThread).toContainEqual(msg)
    })

    it('records the error and leaves the thread untouched on failure', async () => {
      mockPost.mockResolvedValue(apiError(403, 'Not a participant in this dispute'))
      const store = useDisputesStore()

      await expect(store.addPlayerMessage('dispute-1', 'hello')).rejects.toThrow(ApiError)
      expect(store.addPlayerMessageState.error).toBe('Not a participant in this dispute')
      expect(store.currentThread).toHaveLength(0)
    })
  })

  describe('resolveUphold', () => {
    it('POSTs the notes, updates currentDispute and the entry in the queue', async () => {
      const store = useDisputesStore()
      store.disputes = [makeDispute(), makeDispute({ id: 'dispute-2' })]
      const resolved = makeDispute({ status: 'resolved' })
      mockPost.mockResolvedValue({ data: { data: { dispute: resolved, outcome: 'upheld' } } })

      const result = await store.resolveUphold('dispute-1', 'Original result stands')

      expect(mockPost).toHaveBeenCalledWith('/v1/admin/disputes/{dispute_id}/resolve/uphold', {
        params: { path: { dispute_id: 'dispute-1' } },
        body: { notes: 'Original result stands' },
      })
      expect(result.dispute).toEqual(resolved)
      expect(store.currentDispute).toEqual(resolved)
      expect(store.disputes[0]).toEqual(resolved)
      expect(store.disputes[1]!.status).toBe('open')
    })

    it('records the error detail on failure', async () => {
      mockPost.mockResolvedValue(apiError(409, 'Dispute already resolved'))
      const store = useDisputesStore()

      await expect(store.resolveUphold('dispute-1', 'notes')).rejects.toThrow(ApiError)
      expect(store.resolveUpholdState.error).toBe('Dispute already resolved')
      expect(store.resolveUpholdState.loading).toBe(false)
    })
  })

  describe('clear', () => {
    it('resets disputes, thread, match dispute and pagination', () => {
      const store = useDisputesStore()
      store.disputes = [makeDispute()]
      store.currentDispute = makeDispute()
      store.currentThread = [makeMessage()]
      store.matchDispute = makeDispute()
      store.pagination.total = 9

      store.clear()

      expect(store.disputes).toHaveLength(0)
      expect(store.currentDispute).toBeNull()
      expect(store.currentThread).toHaveLength(0)
      expect(store.matchDispute).toBeNull()
      expect(store.pagination).toEqual({ page: 1, page_size: 20, total: 0 })
      expect(store.error).toBeNull()
    })
  })
})
