import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock the api client; keep a real auth token so the store proceeds.
vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: { GET: vi.fn(), POST: vi.fn() },
    getAuthToken: vi.fn(() => 'test-token'),
  }
})

import { api } from '@/api'
import { useLineupsStore, type MatchLineup } from '@/stores/lineups'

const mockGet = api.GET as unknown as Mock
const mockPost = api.POST as unknown as Mock

function lineup(overrides: Partial<MatchLineup> = {}): MatchLineup {
  return {
    id: 'l1',
    match_id: 'm1',
    registration_id: 'reg-a',
    status: 'submitted',
    short_handed: false,
    players_visible: true,
    players: [],
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockGet.mockReset()
  mockPost.mockReset()
})

describe('lineups store', () => {
  it('loads lineups for a match', async () => {
    mockGet.mockResolvedValue({ data: { data: [lineup()] }, error: undefined })
    const store = useLineupsStore()

    await store.fetchLineups('t1', 'm1')

    expect(store.lineups).toHaveLength(1)
    expect(store.lineupFor('reg-a')?.registration_id).toBe('reg-a')
    expect(store.lineupFor('reg-b')).toBeUndefined()
  })

  it('surfaces a fetch error', async () => {
    mockGet.mockResolvedValue({ data: undefined, error: { detail: 'boom', status: 409 } })
    const store = useLineupsStore()

    await expect(store.fetchLineups('t1', 'm1')).rejects.toThrow('boom')
    // P-65: this used to assert `'Failed to load lineups'`, because the store
    // threw a plain `Error` and `withActionState` only forwards the real reason
    // for an `ApiError` (`apiAction.ts:154`). Routing the call through
    // `unwrapApi` — which the `as never` casts had been standing in the way of —
    // means the BACKEND's message now reaches the user instead of a generic
    // fallback. Same class as P-116: the previous assertion pinned an error path
    // that told the user nothing.
    expect(store.fetchState.error).toBe('boom')
  })

  it('falls back to a generic message when the API gives no detail', async () => {
    // The fallback still exists and still matters; it is just no longer what a
    // detailed backend error degrades to.
    mockGet.mockResolvedValue({ data: undefined, error: { status: 500 } })
    const store = useLineupsStore()

    await expect(store.fetchLineups('t1', 'm1')).rejects.toThrow()
    expect(store.fetchState.error).toBe('An unknown error occurred')
  })

  it('declares a lineup and reflects it locally', async () => {
    mockPost.mockResolvedValue({
      data: { data: lineup({ registration_id: 'reg-a', status: 'submitted' }) },
      error: undefined,
    })
    const store = useLineupsStore()

    const declared = await store.declareLineup('t1', 'm1', {
      registration_id: 'reg-a',
      player_ids: ['p1', 'p2'],
      submit: true,
    })

    expect(declared?.registration_id).toBe('reg-a')
    expect(store.lineupFor('reg-a')?.status).toBe('submitted')
  })
})
