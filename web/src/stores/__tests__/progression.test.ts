import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn(), PATCH: vi.fn() },
  }
})

import { api, ApiError } from '@/api'
import { useTournamentsStore } from '@/stores/tournaments'

const mockPost = api.POST as unknown as Mock
const ok = { data: { data: { newly_ready_matches: [] } } }
const DETAIL = 'Match score 0-0 does not determine a winner. Supply participant1_score and participant2_score'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('processProgression', () => {
  it('omits the score fields when no scores are given', async () => {
    mockPost.mockResolvedValueOnce(ok)
    await useTournamentsStore().processProgression('m1', 'w1', 'l1')
    expect(mockPost).toHaveBeenCalledWith('/v1/admin/matches/{match_id}/progression/process', {
      params: { path: { match_id: 'm1' } },
      body: { winner_registration_id: 'w1', loser_registration_id: 'l1' },
    })
    const body = mockPost.mock.calls[0]![1].body
    expect('participant1_score' in body).toBe(false)
    expect('participant2_score' in body).toBe(false)
  })

  it('sends both scores when given', async () => {
    mockPost.mockResolvedValueOnce(ok)
    await useTournamentsStore().processProgression('m1', 'w1', 'l1', {
      participant1Score: 2,
      participant2Score: 0,
    })
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      winner_registration_id: 'w1',
      loser_registration_id: 'l1',
      participant1_score: 2,
      participant2_score: 0,
    })
  })

  it('surfaces the backend detail on failure', async () => {
    mockPost.mockResolvedValueOnce({ error: { status: 400, detail: DETAIL } })
    const store = useTournamentsStore()
    await expect(store.processProgression('m1', 'w1', 'l1')).rejects.toBeInstanceOf(ApiError)
    expect(store.processProgressionState.error).toBe(DETAIL)
  })
})

describe('reapplyProgression', () => {
  it('omits the score fields when no scores are given', async () => {
    mockPost.mockResolvedValueOnce(ok)
    await useTournamentsStore().reapplyProgression('m1', 'w2')
    expect(mockPost).toHaveBeenCalledWith('/v1/admin/matches/{match_id}/progression/reapply', {
      params: { path: { match_id: 'm1' } },
      body: { new_winner_registration_id: 'w2' },
    })
  })

  it('sends both scores when given', async () => {
    mockPost.mockResolvedValueOnce(ok)
    await useTournamentsStore().reapplyProgression('m1', 'w2', {
      participant1Score: 1,
      participant2Score: 2,
    })
    expect(mockPost.mock.calls[0]![1].body).toEqual({
      new_winner_registration_id: 'w2',
      participant1_score: 1,
      participant2_score: 2,
    })
  })

  it('surfaces the backend detail on failure', async () => {
    mockPost.mockResolvedValueOnce({ error: { status: 400, detail: DETAIL } })
    const store = useTournamentsStore()
    await expect(store.reapplyProgression('m1', 'w2')).rejects.toThrow(DETAIL)
    expect(store.reapplyProgressionState.error).toBe(DETAIL)
  })
})
