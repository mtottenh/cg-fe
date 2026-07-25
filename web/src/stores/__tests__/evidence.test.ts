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

function makeLinkedDemo(
  linkId: string,
  evidenceId: string | null = null,
  overrides: { gameNumber?: number | null; demoId?: string; fileName?: string } = {},
): DemoMatchLinkWithDemoResponse {
  return {
    link: {
      id: linkId,
      match_id: 'match-1',
      demo_id: overrides.demoId ?? 'demo-1',
      game_number: overrides.gameNumber ?? null,
    },
    demo: makeDemo({ id: overrides.demoId ?? 'demo-1', file_name: overrides.fileName ?? 'match.dem' }),
    players: null,
    // P-135: the server names the evidence row behind the link. `null` models
    // a link with no evidence record behind it, which is the one case where
    // unlinking here is genuinely impossible.
    evidence_id: evidenceId,
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
    // P-135 spec change, and the old test certified the bug. It asserted that
    // a link with no in-memory evidence id was "removed from linkedDemos
    // without issuing a DELETE" — i.e. it pinned the silent no-op as intended
    // behaviour. That state is reachable after any page reload, because
    // `evidenceIdMap` only ever held ids from link calls in the same session.
    // The id now comes off the server response, so a reload-fresh list unlinks
    // for real; the local prune is gone from every path that did not delete.
    it('resolves the evidence id from the server response and DELETEs it', async () => {
      const store = useEvidenceStore()
      // No `linkDemoEvidence` ran: `evidenceIdMap` is empty, exactly as it is
      // on a freshly loaded page.
      store.linkedDemos = [makeLinkedDemo('link-1', 'evid-1'), makeLinkedDemo('link-2', 'evid-2')]
      mockDelete.mockResolvedValue({ data: { data: null } })

      await store.unlinkDemoEvidence('match-1', 'link-1')

      expect(mockDelete).toHaveBeenCalledWith('/v1/matches/{match_id}/evidence/{evidence_id}', {
        params: { path: { match_id: 'match-1', evidence_id: 'evid-1' } },
      })
      expect(store.linkedDemos.map((d) => d.link.id)).toEqual(['link-2'])
      expect(store.unlinkDemoState.error).toBeNull()
    })

    it('refuses, and keeps the row, when no evidence record backs the link', async () => {
      const store = useEvidenceStore()
      store.linkedDemos = [makeLinkedDemo('link-1'), makeLinkedDemo('link-2')]

      await expect(store.unlinkDemoEvidence('match-1', 'link-1')).rejects.toThrow(
        'No evidence record backs this demo link',
      )

      // The defect was reporting success here. Nothing was deleted, so nothing
      // may disappear from the list either.
      expect(mockDelete).not.toHaveBeenCalled()
      expect(store.linkedDemos.map((d) => d.link.id)).toEqual(['link-1', 'link-2'])
      expect(store.unlinkDemoState.error).toBe(
        'No evidence record backs this demo link, so it cannot be unlinked here',
      )
    })

    // P-110 spec change, not a relaxation: `linkManualDemo` used to fabricate a
    // `linkedDemos` entry whose `link.id` was the *evidence* id, on the stated
    // (wrong) premise that `link-demo` writes no `demo_match_link`. It writes
    // one whenever `demo_id` is sent, which this action always sends, so the
    // action now re-reads the real link.
    //
    // P-159 spec change on top of that: the evidence id the unlink uses comes
    // off the re-read link (`evidence_id`), NOT off the POST response mapped in
    // by the caller. The two ids differ here deliberately — that is the only way
    // this can distinguish "read the server's pairing" from "reuse what we just
    // created", and reusing was the defect.
    it('unlinks using the evidence id the SERVER pairs with the link, not the one the link call returned', async () => {
      const store = useEvidenceStore()
      store.browseDemos = [makeDemo({ id: 'demo-1', file_name: 'match.dem' })]
      mockPost.mockResolvedValue({ data: { data: makeEvidence({ id: 'evid-from-post' }) } })
      // The refetch `linkManualDemo` performs: the backend's real link row,
      // naming the evidence row the backend actually paired with it.
      mockGet.mockResolvedValue({ data: { data: [makeLinkedDemo('link-77', 'evid-from-server')] } })

      await store.linkManualDemo('match-1', 'match.dem', 1, 'demo-1')

      expect(mockGet).toHaveBeenCalledWith('/v1/matches/{match_id}/demos', {
        params: { path: { match_id: 'match-1' }, query: { include_stats: true } },
      })
      expect(store.linkedDemos.map((d) => d.link.id)).toEqual(['link-77'])
      expect(store.browseDemos).toEqual([]) // consumed from browse results

      mockDelete.mockResolvedValue({ data: { data: null } })
      await store.unlinkDemoEvidence('match-1', 'link-77')

      expect(mockDelete).toHaveBeenCalledWith('/v1/matches/{match_id}/evidence/{evidence_id}', {
        params: { path: { match_id: 'match-1', evidence_id: 'evid-from-server' } },
      })
      expect(store.linkedDemos).toEqual([])
    })

    it('keeps linkedDemos intact and records the error when the DELETE fails', async () => {
      const store = useEvidenceStore()
      store.browseDemos = [makeDemo({ id: 'demo-1', file_name: 'match.dem' })]
      mockPost.mockResolvedValue({ data: { data: makeEvidence({ id: 'evid-9' }) } })
      mockGet.mockResolvedValue({ data: { data: [makeLinkedDemo('link-77', 'evid-9')] } })
      await store.linkManualDemo('match-1', 'match.dem', 1, 'demo-1')

      mockDelete.mockResolvedValue({ error: { status: 403, detail: 'Forbidden' } })
      await expect(store.unlinkDemoEvidence('match-1', 'link-77')).rejects.toThrow('Forbidden')

      expect(store.unlinkDemoState.error).toBe('Forbidden')
      expect(store.linkedDemos.map((d) => d.link.id)).toEqual(['link-77'])

      // A retry after the failure still works and cleans up
      mockDelete.mockResolvedValue({ data: { data: null } })
      await store.unlinkDemoEvidence('match-1', 'link-77')
      expect(store.linkedDemos).toEqual([])
      expect(store.unlinkDemoState.error).toBeNull()
    })
  })

  /**
   * P-159. `linkDiscoveredDemo` recovered "the link I just created" with
   *
   *     linkedDemos.value.find(d => d.link.game_number === (gameNumber ?? null))
   *
   * and wrote the new evidence id against whatever came back first. In a series,
   * or whenever `gameNumber` is undefined and several links carry `null`, that
   * is an OLDER link — so the map pointed an existing row at the new evidence
   * record, and the next Unlink on that row deleted the wrong thing. The map is
   * gone; every id is read off the link it belongs to.
   *
   * Two `null`-game links plus a link call that names no game number is exactly
   * the shape `find` mishandles, and the assertion is on the DELETE target
   * because that is where the mis-mapping did its damage.
   */
  describe('link → evidence pairing (P-159)', () => {
    it('does not point an existing link at the newly created evidence record', async () => {
      const store = useEvidenceStore()
      store.discoveredDemos = [
        { external_id: 'catalog:demo-new' },
      ] as unknown as typeof store.discoveredDemos

      mockPost.mockResolvedValue({ data: { data: makeEvidence({ id: 'evid-new' }) } })
      // Both links carry `game_number: null`, and the older one is listed first
      // — the ordering `find` returns.
      mockGet.mockResolvedValue({
        data: {
          data: [
            makeLinkedDemo('link-old', 'evid-old', { demoId: 'demo-old', fileName: 'old.dem' }),
            makeLinkedDemo('link-new', 'evid-new', { demoId: 'demo-new', fileName: 'new.dem' }),
          ],
        },
      })

      await store.linkDiscoveredDemo('match-1', 'catalog:demo-new')

      mockDelete.mockResolvedValue({ data: { data: null } })
      await store.unlinkDemoEvidence('match-1', 'link-old')

      expect(mockDelete).toHaveBeenCalledWith('/v1/matches/{match_id}/evidence/{evidence_id}', {
        params: { path: { match_id: 'match-1', evidence_id: 'evid-old' } },
      })
      // The record the link call created is untouched, and its link survives.
      expect(store.linkedDemos.map((d) => d.link.id)).toEqual(['link-new'])
    })
  })

  describe('validateDemoLink', () => {
    it('resolves the evidence id from the link row, POSTs it, and re-reads both lists', async () => {
      const store = useEvidenceStore()
      // P-159: the pairing is the server's, carried on the link itself. It used
      // to be recovered by joining the evidence list on the demo's FILE NAME,
      // which picks the first row of that name — a second guess.
      store.linkedDemos = [makeLinkedDemo('link-77', 'ev-42')]

      mockGet.mockResolvedValue({ data: { data: [] } })
      mockPost.mockResolvedValue({
        data: { data: { is_valid: true, confidence: 0.9, errors: [], warnings: [] } },
      })

      const result = await store.validateDemoLink('match-1', 'link-77', {
        participant1Score: 13,
        participant2Score: 7,
      })

      expect(mockPost).toHaveBeenCalledWith('/v1/matches/{match_id}/evidence/validate', {
        params: { path: { match_id: 'match-1' } },
        body: {
          evidence_ids: ['ev-42'],
          expected_participant1_score: 13,
          expected_participant2_score: 7,
        },
      })
      expect(result.is_valid).toBe(true)
      // Post-write re-read: linked demos AND the evidence list.
      expect(mockGet).toHaveBeenCalledWith('/v1/matches/{match_id}/demos', {
        params: { path: { match_id: 'match-1' }, query: { include_stats: true } },
      })
    })

    it('refuses to validate a link with no evidence record rather than POSTing a guess', async () => {
      const store = useEvidenceStore()
      store.linkedDemos = [makeLinkedDemo('link-77')]
      mockGet.mockResolvedValue({ data: { data: [] } })

      await expect(
        store.validateDemoLink('match-1', 'link-77', {
          participant1Score: 13,
          participant2Score: 7,
        }),
      ).rejects.toThrow('No evidence record found for this demo')
      expect(mockPost).not.toHaveBeenCalled()
      expect(store.validateDemoState.error).toBe('No evidence record found for this demo')
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
