import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState, aggregateActionStates } from '@/stores/helpers'

type DiscoveredEvidenceResponse = components['schemas']['DiscoveredEvidenceResponse']
type DemoMatchLinkWithDemoResponse = components['schemas']['DemoMatchLinkWithDemoResponse']
type EvidenceResponse = components['schemas']['EvidenceResponse']
type DemoStatsResponse = components['schemas']['DemoStatsResponse']
type DemoResponse = components['schemas']['DemoResponse']
type EvidenceSummaryResponse = components['schemas']['EvidenceSummaryResponse']

export interface BrowseDemoFilters {
  status?: string
  map_name?: string
  team_name?: string
  limit?: number
  offset?: number
}

export const useEvidenceStore = defineStore('evidence', () => {
  // State
  const discoveredDemos = ref<DiscoveredEvidenceResponse[]>([])
  const linkedDemos = ref<DemoMatchLinkWithDemoResponse[]>([])
  const linkedEvidence = ref<EvidenceResponse[]>([])
  const evidence = ref<EvidenceSummaryResponse[]>([])
  const browseDemos = ref<DemoResponse[]>([])
  const browseTotal = ref(0)
  const evidenceIdMap = ref<Record<string, string>>({}) // demoLinkId → evidenceId

  // Per-action states
  const discoverState = createActionState()
  const fetchLinkedState = createActionState()
  const linkDemoState = createActionState()
  const fetchStatsState = createActionState()
  const browseDemosState = createActionState()
  const linkManualDemoState = createActionState()
  const unlinkDemoState = createActionState()
  const fetchEvidenceState = createActionState()
  const initiateUploadState = createActionState()
  const completeUploadState = createActionState()
  const validateEvidenceState = createActionState()
  const validateDemoState = createActionState()
  const getAccessUrlState = createActionState()
  const linkEvidenceState = createActionState()

  const { loading, error } = aggregateActionStates([
    discoverState, fetchLinkedState, linkDemoState, fetchStatsState, browseDemosState,
    linkManualDemoState, unlinkDemoState, fetchEvidenceState,
    initiateUploadState, completeUploadState, validateEvidenceState, validateDemoState,
    getAccessUrlState, linkEvidenceState,
  ])

  async function discoverDemos(matchId: string): Promise<DiscoveredEvidenceResponse[]> {
    return withActionState(discoverState, async () => {
      const result = await unwrapApi(api.GET('/v1/matches/{match_id}/evidence/discover', {
        params: { path: { match_id: matchId } },
      }))
      discoveredDemos.value = result.data
      return discoveredDemos.value
    }, 'Failed to discover demos')
  }

  async function fetchLinkedDemos(matchId: string): Promise<DemoMatchLinkWithDemoResponse[]> {
    return withActionState(fetchLinkedState, async () => {
      const result = await unwrapApi(api.GET('/v1/matches/{match_id}/demos', {
        params: {
          path: { match_id: matchId },
          query: { include_stats: true },
        },
      }))
      linkedDemos.value = result.data
      return linkedDemos.value
    }, 'Failed to fetch linked demos')
  }

  async function linkDiscoveredDemo(
    matchId: string,
    externalId: string,
    gameNumber?: number
  ): Promise<EvidenceResponse> {
    return withActionState(linkDemoState, async () => {
      const result = await unwrapApi(api.POST('/v1/matches/{match_id}/evidence/link-discovered', {
        params: { path: { match_id: matchId } },
        body: {
          external_id: externalId,
          game_number: gameNumber ?? null,
        },
      }))
      const evidenceResponse = result.data
      // Remove from discovered list
      discoveredDemos.value = discoveredDemos.value.filter(d => d.external_id !== externalId)
      // Re-fetch linked demos to get updated list
      await fetchLinkedDemos(matchId)
      // Map the newly created link to the evidence ID
      const newLink = linkedDemos.value.find(d => d.link.game_number === (gameNumber ?? null))
      if (newLink) {
        evidenceIdMap.value[newLink.link.id] = evidenceResponse.id
      }
      return evidenceResponse
    }, 'Failed to link demo')
  }

  async function unlinkDemoEvidence(matchId: string, demoLinkId: string) {
    return withActionState(unlinkDemoState, async () => {
      const evidenceId = evidenceIdMap.value[demoLinkId]
      if (evidenceId) {
        await unwrapApi(api.DELETE('/v1/matches/{match_id}/evidence/{evidence_id}', {
          params: { path: { match_id: matchId, evidence_id: evidenceId } },
        }))
        delete evidenceIdMap.value[demoLinkId]
      }
      linkedDemos.value = linkedDemos.value.filter(d => d.link.id !== demoLinkId)
    }, 'Failed to unlink demo')
  }

  async function fetchBrowseDemos(filters: BrowseDemoFilters = {}, append = false) {
    return withActionState(browseDemosState, async () => {
      const result = await unwrapApi(api.GET('/v1/demos', {
        params: {
          query: {
            status: filters.status ?? 'ready',
            map_name: filters.map_name || undefined,
            team_name: filters.team_name || undefined,
            limit: filters.limit,
            offset: filters.offset,
          },
        },
      }))
      if (append) {
        browseDemos.value = [...browseDemos.value, ...result.data.demos]
      } else {
        browseDemos.value = result.data.demos
      }
      browseTotal.value = result.data.total
    }, 'Failed to browse demos')
  }

  async function linkManualDemo(
    matchId: string,
    demoName: string,
    gameNumber?: number,
    demoId?: string,
  ): Promise<EvidenceResponse> {
    return withActionState(linkManualDemoState, async () => {
      const result = await unwrapApi(api.POST('/v1/matches/{match_id}/evidence/link-demo', {
        params: { path: { match_id: matchId } },
        body: {
          demo_name: demoName,
          game_number: gameNumber ?? null,
          demo_id: demoId ?? null,
        },
      }))
      const evidenceResponse = result.data

      // Remove from browse results
      browseDemos.value = browseDemos.value.filter(d => d.file_name !== demoName)

      // P-110: read the real link back instead of fabricating one.
      //
      // This used to build a *synthetic* `DemoMatchLinkWithDemoResponse` from
      // the browse row, on the stated grounds that `link-demo` creates only an
      // evidence record. It does create a `demo_match_link` whenever the
      // request carries `demo_id` — which this action always sends — so the
      // synthetic row shadowed a real one with the wrong `link.id` (it used the
      // evidence id), a hardcoded `validated: false` that could never update,
      // and no `players`. Anything that refetched replaced it and the ids moved
      // under the caller. Re-read, exactly as `linkDiscoveredDemo` does.
      if (demoId) {
        await fetchLinkedDemos(matchId)
        const newLink = linkedDemos.value.find(d => d.link.demo_id === demoId)
        if (newLink) {
          evidenceIdMap.value[newLink.link.id] = evidenceResponse.id
        }
      }

      return evidenceResponse
    }, 'Failed to link demo')
  }

  async function fetchEvidence(matchId: string): Promise<EvidenceSummaryResponse[]> {
    return withActionState(fetchEvidenceState, async () => {
      const result = await unwrapApi(api.GET('/v1/matches/{match_id}/evidence', {
        params: { path: { match_id: matchId } },
      }))
      evidence.value = result.data
      return evidence.value
    }, 'Failed to fetch evidence')
  }

  async function fetchDemoStats(matchId: string, demoName: string): Promise<DemoStatsResponse> {
    return withActionState(fetchStatsState, async () => {
      const result = await unwrapApi(api.GET('/v1/matches/{match_id}/evidence/demo-stats/{demo_name}', {
        params: { path: { match_id: matchId, demo_name: demoName } },
      }))
      return result.data
    }, 'Failed to fetch demo stats')
  }

  // ==================== Evidence Upload & Validation ====================

  async function initiateUpload(matchId: string, request: {
    file_name: string
    file_size_bytes: number
    mime_type: string
    evidence_type: string
    game_number?: number | null
  }) {
    return withActionState(initiateUploadState, async () => {
      const result = await unwrapApi(api.POST('/v1/matches/{match_id}/evidence/upload', {
        params: { path: { match_id: matchId } },
        body: request,
      }))
      return result.data
    }, 'Failed to initiate upload')
  }

  async function completeUpload(matchId: string, evidenceId: string) {
    return withActionState(completeUploadState, async () => {
      const result = await unwrapApi(api.POST('/v1/matches/{match_id}/evidence/{evidence_id}/complete', {
        params: { path: { match_id: matchId, evidence_id: evidenceId } },
      }))
      return result.data
    }, 'Failed to complete upload')
  }

  async function validateEvidence(
    matchId: string,
    body: components['schemas']['ValidateEvidenceRequest'],
  ) {
    return withActionState(validateEvidenceState, async () => {
      const result = await unwrapApi(api.POST('/v1/matches/{match_id}/evidence/validate', {
        params: { path: { match_id: matchId } },
        body,
      }))
      return result.data
    }, 'Failed to validate evidence')
  }

  async function validateDemo(
    matchId: string,
    body: components['schemas']['ValidateDemoRequest'],
  ) {
    return withActionState(validateDemoState, async () => {
      const result = await unwrapApi(api.POST('/v1/matches/{match_id}/evidence/validate-demo', {
        params: { path: { match_id: matchId } },
        body,
      }))
      return result.data
    }, 'Failed to validate demo')
  }

  /**
   * P-111: validate a *linked demo* against the claimed score for its game.
   *
   * `validateEvidence` below is keyed on evidence ids, but every surface that
   * shows a demo — `DemoBrowser`'s Linked Demos cards, `EvidenceDisplay`'s
   * table, the admin demo page's Match Links list — is keyed on the
   * `demo_match_link`. This resolves one to the other and calls the endpoint,
   * which is what makes the "Validated" chip reachable at all: nothing in the
   * product had ever called a validation endpoint, so `validated` was `false`
   * on every link row that has ever existed.
   *
   * The scores are the claimed scores **for the demo's game** (rounds on one
   * map), not the match's series score — the caller reads them off the result
   * claim's `game_results`. The backend refuses the call without them rather
   * than comparing two different units.
   *
   * The evidence id comes from `evidenceIdMap` when the link was made in this
   * session; otherwise it is recovered by joining the match's evidence list on
   * the demo's file name, which both catalog link paths use verbatim as the
   * evidence row's `name` (`handlers/evidence.rs` — `link_demo` and
   * `link_discovered_evidence`'s catalog branch).
   */
  async function validateDemoLink(
    matchId: string,
    demoLinkId: string,
    claimed: { participant1Score: number; participant2Score: number },
  ): Promise<components['schemas']['ValidationResultResponse']> {
    return withActionState(validateDemoState, async () => {
      const linked = linkedDemos.value.find(d => d.link.id === demoLinkId)
      // Thrown as ApiError so `withActionState` surfaces the real reason —
      // it replaces any other error type with the generic fallback message.
      if (!linked) {
        throw new ApiError(404, 'That demo is no longer linked to this match')
      }

      let evidenceId = evidenceIdMap.value[demoLinkId]
      if (!evidenceId) {
        const records = await fetchEvidence(matchId)
        const match = records.find(e => e.name === linked.demo.file_name)
        if (!match) {
          throw new ApiError(404, 'No evidence record found for this demo')
        }
        evidenceId = match.id
        evidenceIdMap.value[demoLinkId] = evidenceId
      }

      const result = await unwrapApi(api.POST('/v1/matches/{match_id}/evidence/validate', {
        params: { path: { match_id: matchId } },
        body: {
          evidence_ids: [evidenceId],
          expected_participant1_score: claimed.participant1Score,
          expected_participant2_score: claimed.participant2Score,
        },
      }))

      // Both the link row and the evidence row were just written server-side;
      // re-read rather than guessing what the verdict did to them.
      await Promise.all([fetchLinkedDemos(matchId), fetchEvidence(matchId)])
      return result.data
    }, 'Failed to validate demo')
  }

  async function getAccessUrl(matchId: string, evidenceId: string) {
    return withActionState(getAccessUrlState, async () => {
      const result = await unwrapApi(api.GET('/v1/matches/{match_id}/evidence/{evidence_id}/access', {
        params: { path: { match_id: matchId, evidence_id: evidenceId } },
      }))
      return result.data
    }, 'Failed to get access URL')
  }

  async function linkEvidence(matchId: string, request: {
    name: string
    url: string
    evidence_type: string
    description?: string | null
    game_number?: number | null
  }) {
    return withActionState(linkEvidenceState, async () => {
      const result = await unwrapApi(api.POST('/v1/matches/{match_id}/evidence/link', {
        params: { path: { match_id: matchId } },
        body: request,
      }))
      return result.data
    }, 'Failed to link evidence')
  }

  function clear() {
    discoveredDemos.value = []
    linkedDemos.value = []
    linkedEvidence.value = []
    evidence.value = []
    browseDemos.value = []
    browseTotal.value = 0
    evidenceIdMap.value = {}
    error.value = null
  }

  function $reset() {
    clear()
  }

  return {
    // State
    discoveredDemos,
    linkedDemos,
    linkedEvidence,
    evidence,
    browseDemos,
    browseTotal,
    loading,
    error,

    // Per-action states
    discoverState,
    fetchLinkedState,
    linkDemoState,
    fetchStatsState,
    browseDemosState,
    linkManualDemoState,
    unlinkDemoState,
    fetchEvidenceState,
    initiateUploadState,
    completeUploadState,
    validateEvidenceState,
    validateDemoState,
    getAccessUrlState,
    linkEvidenceState,

    // Actions
    discoverDemos,
    fetchLinkedDemos,
    linkDiscoveredDemo,
    unlinkDemoEvidence,
    fetchDemoStats,
    fetchBrowseDemos,
    linkManualDemo,
    fetchEvidence,

    // Evidence Upload & Validation
    initiateUpload,
    completeUpload,
    validateEvidence,
    validateDemo,
    validateDemoLink,
    getAccessUrl,
    linkEvidence,

    // Utility
    clear,
    $reset,
  }
})

export type {
  DiscoveredEvidenceResponse,
  DemoMatchLinkWithDemoResponse,
  EvidenceResponse,
  EvidenceSummaryResponse,
  DemoStatsResponse,
  DemoResponse,
}
