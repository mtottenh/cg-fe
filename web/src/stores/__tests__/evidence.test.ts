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
  useEvidenceStore,
  type EvidenceSummaryResponse,
  type EvidenceResponse,
  type DemoResponse,
  type DemoMatchLinkWithDemoResponse,
} from '@/stores/evidence'

const mockGet = api.GET as unknown as Mock
const mockPost = api.POST as unknown as Mock
const mockDelete = api.DELETE as unknown as Mock

function makeSummary(overrides: Partial<EvidenceSummaryResponse> = {}): EvidenceSummaryResponse {
  return {
    id: 'ev-1',
    name: 'screenshot.png',
    evidence_type: 'screenshot',
    status: 'uploaded',
    validated: false,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as EvidenceSummaryResponse
}

function makeEvidence(overrides: Partial<EvidenceResponse> = {}): EvidenceResponse {
  return {
    id: 'ev-9',
    match_id: 'match-1',
    evidence_type: 'demo',
    status: 'linked',
    created_at: '2026-01-01T00:00:00Z',
    uploaded_by_user_id: 'user-1',
    ...overrides,
  } as EvidenceResponse
}

function makeDemo(overrides: Partial<DemoResponse> = {}): DemoResponse {
  return {
    id: 'demo-1',
    file_name: 'match.dem',
    status: 'ready',
    ...overrides,
  } as DemoResponse
}

function makeLinkedDemo(linkId: string): DemoMatchLinkWithDemoResponse {
  return {
    link: { id: linkId, match_id: 'match-1', demo_id: 'demo-1', game_number: null },
    demo: makeDemo(),
    players: null,
  } as unknown as DemoMatchLinkWithDemoResponse
}

describe('Evidence Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('fetchEvidence', () => {
    it('loads the evidence list into state', async () => {
      const items = [makeSummary({ id: 'ev-1' }), makeSummary({ id: 'ev-2', evidence_type: 'demo' })]
      mockGet.mockResolvedValue({ data: { data: items } })
      const store = useEvidenceStore()

      const result = await store.fetchEvidence('match-1')

      expect(mockGet).toHaveBeenCalledWith('/v1/matches/{match_id}/evidence', {
        params: { path: { match_id: 'match-1' } },
      })
      expect(result).toEqual(items)
      expect(store.evidence).toEqual(items)
      expect(store.fetchEvidenceState.loading).toBe(false)
      expect(store.fetchEvidenceState.error).toBeNull()
    })

    it('replaces a previously loaded list on refetch', async () => {
      const store = useEvidenceStore()
      mockGet.mockResolvedValueOnce({ data: { data: [makeSummary({ id: 'ev-1' })] } })
      await store.fetchEvidence('match-1')
      expect(store.evidence).toHaveLength(1)

      mockGet.mockResolvedValueOnce({ data: { data: [] } })
      await store.fetchEvidence('match-1')
      expect(store.evidence).toEqual([])
    })

    it('sets the action error, aggregates it, and leaves the list untouched on failure', async () => {
      mockGet.mockResolvedValue({ error: { status: 500, detail: 'boom' } })
      const store = useEvidenceStore()

      await expect(store.fetchEvidence('match-1')).rejects.toThrow(ApiError)
      expect(store.fetchEvidenceState.error).toBe('boom')
      expect(store.error).toBe('boom') // aggregated store-level error
      expect(store.evidence).toEqual([])
      expect(store.loading).toBe(false)
    })
  })

  describe('linkEvidence', () => {
    it('POSTs the external link payload and returns the created evidence', async () => {
      const created = makeEvidence({ evidence_type: 'video' })
      mockPost.mockResolvedValue({ data: { data: created } })
      const store = useEvidenceStore()

      const result = await store.linkEvidence('match-1', {
        name: 'POV recording',
        url: 'https://youtu.be/abc',
        evidence_type: 'video',
        game_number: 1,
      })

      expect(mockPost).toHaveBeenCalledWith('/v1/matches/{match_id}/evidence/link', {
        params: { path: { match_id: 'match-1' } },
        body: {
          name: 'POV recording',
          url: 'https://youtu.be/abc',
          evidence_type: 'video',
          game_number: 1,
        },
      })
      expect(result).toEqual(created)
      expect(store.linkEvidenceState.error).toBeNull()
    })

    it('records the error detail and rethrows on failure', async () => {
      mockPost.mockResolvedValue({ error: { status: 400, detail: 'Invalid URL' } })
      const store = useEvidenceStore()

      await expect(
        store.linkEvidence('match-1', {
          name: 'x',
          url: 'not-a-url',
          evidence_type: 'video',
        }),
      ).rejects.toThrow('Invalid URL')
      expect(store.linkEvidenceState.error).toBe('Invalid URL')
      expect(store.linkEvidenceState.loading).toBe(false)
    })
  })

  describe('unlinkDemoEvidence', () => {
    it('removes an unmapped link from linkedDemos without issuing a DELETE', async () => {
      const store = useEvidenceStore()
      store.linkedDemos = [makeLinkedDemo('link-1'), makeLinkedDemo('link-2')]

      await store.unlinkDemoEvidence('match-1', 'link-1')

      expect(mockDelete).not.toHaveBeenCalled()
      expect(store.linkedDemos.map((d) => d.link.id)).toEqual(['link-2'])
      expect(store.unlinkDemoState.error).toBeNull()
    })

    it('DELETEs the mapped evidence record for links created via linkManualDemo', async () => {
      const store = useEvidenceStore()
      // linkManualDemo populates the internal demoLinkId → evidenceId map and
      // constructs a synthetic linkedDemos entry keyed by the evidence id.
      store.browseDemos = [makeDemo({ id: 'demo-1', file_name: 'match.dem' })]
      const created = makeEvidence({ id: 'evid-9' })
      mockPost.mockResolvedValue({ data: { data: created } })

      await store.linkManualDemo('match-1', 'match.dem', 1)
      expect(store.linkedDemos.map((d) => d.link.id)).toEqual(['evid-9'])
      expect(store.browseDemos).toEqual([]) // consumed from browse results

      mockDelete.mockResolvedValue({ data: { data: null } })
      await store.unlinkDemoEvidence('match-1', 'evid-9')

      expect(mockDelete).toHaveBeenCalledWith('/v1/matches/{match_id}/evidence/{evidence_id}', {
        params: { path: { match_id: 'match-1', evidence_id: 'evid-9' } },
      })
      expect(store.linkedDemos).toEqual([])
    })

    it('keeps linkedDemos intact and records the error when the DELETE fails', async () => {
      const store = useEvidenceStore()
      store.browseDemos = [makeDemo({ id: 'demo-1', file_name: 'match.dem' })]
      mockPost.mockResolvedValue({ data: { data: makeEvidence({ id: 'evid-9' }) } })
      await store.linkManualDemo('match-1', 'match.dem', 1)

      mockDelete.mockResolvedValue({ error: { status: 403, detail: 'Forbidden' } })
      await expect(store.unlinkDemoEvidence('match-1', 'evid-9')).rejects.toThrow('Forbidden')

      expect(store.unlinkDemoState.error).toBe('Forbidden')
      expect(store.linkedDemos.map((d) => d.link.id)).toEqual(['evid-9'])

      // A retry after the failure still works and cleans up
      mockDelete.mockResolvedValue({ data: { data: null } })
      await store.unlinkDemoEvidence('match-1', 'evid-9')
      expect(store.linkedDemos).toEqual([])
      expect(store.unlinkDemoState.error).toBeNull()
    })
  })

  describe('clear', () => {
    it('resets lists and the aggregated error', async () => {
      mockGet.mockResolvedValue({ error: { status: 500, detail: 'boom' } })
      const store = useEvidenceStore()
      await store.fetchEvidence('match-1').catch(() => null)
      store.linkedDemos = [makeLinkedDemo('link-1')]
      expect(store.error).toBe('boom')

      store.clear()

      expect(store.evidence).toEqual([])
      expect(store.linkedDemos).toEqual([])
      expect(store.error).toBeNull()
    })
  })
})
