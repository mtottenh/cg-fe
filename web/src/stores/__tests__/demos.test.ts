import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

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

import { api } from '@/api'
import { useDemosStore, type DemoMatchLinkResponse } from '@/stores/demos'

const mockPost = api.POST as unknown as Mock
const mockDelete = api.DELETE as unknown as Mock

function makeLink(overrides: Partial<DemoMatchLinkResponse> = {}): DemoMatchLinkResponse {
  return {
    id: 'link-1',
    demo_id: 'demo-1',
    match_id: 'match-1',
    link_type: 'auto_matched',
    confidence_score: 1,
    game_number: null,
    validated: false,
    validated_at: null,
    validation_result: null,
    linked_at: '2026-01-01T00:00:00Z',
    linked_by_user_id: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as DemoMatchLinkResponse
}

describe('Demos Store — match links', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('linkToMatch', () => {
    it('POSTs the admin link endpoint with the manual link body', async () => {
      const link = makeLink({ link_type: 'manual' })
      mockPost.mockResolvedValue({ data: { data: link } })
      const store = useDemosStore()

      const result = await store.linkToMatch('demo-1', {
        match_id: 'match-1',
        link_type: 'manual',
        game_number: null,
      })

      expect(mockPost).toHaveBeenCalledWith('/v1/admin/demos/{id}/link', {
        params: { path: { id: 'demo-1' } },
        body: { match_id: 'match-1', link_type: 'manual', game_number: null },
      })
      expect(result).toEqual(link)
      expect(store.linkToMatchState.error).toBeNull()
    })

    it('captures the RFC 7807 detail on failure', async () => {
      mockPost.mockResolvedValue({ error: { status: 404, detail: 'Match not found' } })
      const store = useDemosStore()

      await expect(
        store.linkToMatch('demo-1', { match_id: 'nope', link_type: 'manual' }),
      ).rejects.toThrow()
      expect(store.linkToMatchState.error).toBe('Match not found')
    })
  })

  describe('unlinkFromMatch', () => {
    it('DELETEs the link and removes it from local state by (demo, match)', async () => {
      mockDelete.mockResolvedValue({ data: undefined })
      const store = useDemosStore()
      store.links = [makeLink(), makeLink({ id: 'link-2', match_id: 'match-2' })]

      await store.unlinkFromMatch('demo-1', 'match-1')

      expect(mockDelete).toHaveBeenCalledWith('/v1/admin/demos/{demo_id}/link/{match_id}', {
        params: { path: { demo_id: 'demo-1', match_id: 'match-1' } },
      })
      expect(store.links).toHaveLength(1)
      expect(store.links[0]!.match_id).toBe('match-2')
    })

    it('captures the RFC 7807 detail and keeps the link on failure', async () => {
      mockDelete.mockResolvedValue({ error: { status: 403, detail: 'Missing admin.demos.manage' } })
      const store = useDemosStore()
      store.links = [makeLink()]

      await expect(store.unlinkFromMatch('demo-1', 'match-1')).rejects.toThrow()
      expect(store.unlinkFromMatchState.error).toBe('Missing admin.demos.manage')
      expect(store.links).toHaveLength(1)
    })
  })
})

describe('Demos Store — auto-link setting', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  const mockGet = api.GET as unknown as Mock
  const mockPut = api.PUT as unknown as Mock

  it('fetchAutoLinkSetting GETs the admin endpoint and stores the flag', async () => {
    mockGet.mockResolvedValue({ data: { data: { enabled: false } } })
    const store = useDemosStore()

    const result = await store.fetchAutoLinkSetting()

    expect(mockGet).toHaveBeenCalledWith('/v1/admin/demos/auto-link')
    expect(result.enabled).toBe(false)
    expect(store.autoLinkEnabled).toBe(false)
  })

  it('updateAutoLinkSetting PUTs the flag and updates local state', async () => {
    mockPut.mockResolvedValue({ data: { data: { enabled: true } } })
    const store = useDemosStore()
    store.autoLinkEnabled = false

    await store.updateAutoLinkSetting(true)

    expect(mockPut).toHaveBeenCalledWith('/v1/admin/demos/auto-link', {
      body: { enabled: true },
    })
    expect(store.autoLinkEnabled).toBe(true)
  })

  it('updateAutoLinkSetting keeps prior state and captures the error on failure', async () => {
    mockPut.mockResolvedValue({
      error: { title: 'Forbidden', status: 403, detail: 'Admin access required' },
    })
    const store = useDemosStore()
    store.autoLinkEnabled = true

    await expect(store.updateAutoLinkSetting(false)).rejects.toThrow()
    expect(store.autoLinkEnabled).toBe(true)
    expect(store.updateAutoLinkSettingState.error).toContain('Admin access required')
  })
})
