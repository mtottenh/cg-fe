import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState, aggregateActionStates } from '@/stores/helpers'

type DiscoveredEvidenceResponse = components['schemas']['DiscoveredEvidenceResponse']
type DemoMatchLinkWithDemoResponse = components['schemas']['DemoMatchLinkWithDemoResponse']
type EvidenceResponse = components['schemas']['EvidenceResponse']
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

  // Per-action states
  const discoverState = createActionState()
  const fetchLinkedState = createActionState()
  const linkDemoState = createActionState()
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
    discoverState, fetchLinkedState, linkDemoState, browseDemosState,
    linkManualDemoState, unlinkDemoState, fetchEvidenceState,
    initiateUploadState, completeUploadState, validateEvidenceState, validateDemoState,
    getAccessUrlState, linkEvidenceState,
  ])

  /**
   * The `match_evidence` row behind a `demo_match_link`, named by the server.
   *
   * P-159: this used to come out of an `evidenceIdMap` ref that
   * `linkDiscoveredDemo` populated by *guessing* which of the freshly-fetched
   * links was the one it had just created:
   *
   *     const newLink = linkedDemos.value.find(
   *       d => d.link.game_number === (gameNumber ?? null))
   *
   * `find` returns the first match. In a bo3, or whenever `gameNumber` is
   * undefined and several links carry `null`, that is an OLDER link — so the new
   * evidence id was written against somebody else's link row, and the next
   * "Unlink" on that row deleted the wrong evidence. A destructive action
   * pointed at a guessed target.
   *
   * `DemoMatchLinkWithDemoResponse.evidence_id` (added for P-135) is the same
   * pairing, computed server-side from `plugin_metadata.catalog_demo_id`. There
   * is no reason left to guess, so the map is gone rather than merely
   * deprioritised: while it existed it took precedence, and a stale wrong entry
   * would still have won.
   */
  function evidenceIdForLink(demoLinkId: string): string | null {
    return linkedDemos.value.find(d => d.link.id === demoLinkId)?.evidence_id ?? null
  }

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
      // Re-fetch linked demos to get the updated list. That refetch also carries
      // the server's own link → evidence pairing, which is why P-159 could
      // delete the local guess outright rather than replace it with a better one.
      await fetchLinkedDemos(matchId)
      return evidenceResponse
    }, 'Failed to link demo')
  }

  /**
   * P-135: detach a demo from the match, for real.
   *
   * This used to read the evidence id out of `evidenceIdMap` — an in-memory ref
   * that only `linkDemoEvidence` writes, in the same session — and then:
   *
   *     if (evidenceId) { ...DELETE... }
   *     linkedDemos.value = linkedDemos.value.filter(...)   // unconditional
   *
   * After any page reload the map is empty, so `evidenceId` was `undefined`,
   * **no DELETE was sent**, and the row was still removed from `linkedDemos`
   * and the action still resolved. The operator watched the demo disappear and
   * was told it worked; the link was untouched on the server and came back on
   * the next refresh. A destructive action reporting success without doing the
   * work is worse than one that fails.
   *
   * Two changes, and both are needed: the id is now recovered from the server
   * (`DemoMatchLinkWithDemoResponse.evidence_id`, added for this), and the local
   * prune happens only *after* a DELETE that actually returned. When the id
   * cannot be resolved this throws instead of pretending — there is no path
   * left that removes the row without deleting it.
   */
  async function unlinkDemoEvidence(matchId: string, demoLinkId: string) {
    return withActionState(unlinkDemoState, async () => {
      // P-159: the id is read off the link the operator actually clicked, never
      // off a locally-maintained map that could have it pointing elsewhere.
      const evidenceId = evidenceIdForLink(demoLinkId)
      // Thrown as ApiError so `withActionState` surfaces the real reason rather
      // than replacing it with the generic fallback message.
      if (!evidenceId) {
        throw new ApiError(
          404,
          'No evidence record backs this demo link, so it cannot be unlinked here',
        )
      }

      await unwrapApi(api.DELETE('/v1/matches/{match_id}/evidence/{evidence_id}', {
        params: { path: { match_id: matchId, evidence_id: evidenceId } },
      }))

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
      //
      // P-159: the refetch carries the server's link → evidence pairing, so
      // there is nothing left to record locally.
      if (demoId) {
        await fetchLinkedDemos(matchId)
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

  /**
   * P-161: `validateDemo` (`POST .../evidence/validate-demo`) and
   * `fetchDemoStats` (`GET .../evidence/demo-stats/{name}`) used to sit here
   * with zero callers anywhere in `src/`, and they are deliberately NOT wired
   * up — they are removed instead, because leaving an uncalled store action is
   * an invitation to wire the wrong one.
   *
   * The operator gesture they looked like they were for — "check this demo
   * against the submitted result" — is `validateDemoLink` below, and that is the
   * one that must be used:
   *
   *  - `validate-demo` records NOTHING. It returns a verdict and writes no
   *    `validated` / `validated_at` / `validation_result`, so an admin's answer
   *    vanishes on reload while the dispute outlives it — the exact failure mode
   *    P-136/P-138 were about. `/evidence/validate` persists the verdict on both
   *    the evidence row and the demo link.
   *  - it maps demo teams to participants from `participant{1,2}_steam_ids`
   *    passed as comma-separated *query strings*, which no UI can honestly ask
   *    an operator for.
   *  - both endpoints reach the external demo-stats service, so after P-137 they
   *    hard-fail wherever `CS2_DEMO_SERVICE_URL` is unset, while
   *    `/evidence/validate` works off the stats the portal already stores.
   *  - `demo-stats` in particular re-fetches per-player numbers the portal
   *    already holds and already returns on
   *    `GET /v1/matches/{id}/demos?include_stats=true` as `players`.
   *
   * Two buttons answering the same question differently is precisely the P-158
   * defect this lane is also fixing, so wiring these would have created one.
   */
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

  /**
   * P-111: validate a *linked demo* against the claimed score for its game.
   *
   * `validateEvidence` above is keyed on evidence ids, but every surface that
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
   * P-159: the evidence id is the server's, off the link row. It used to come
   * from `evidenceIdMap` — written by a guess — and otherwise from joining the
   * match's evidence list on the demo's FILE NAME, which is a second guess: file
   * names are not unique in the catalog, so a match carrying two demos of the
   * same name would validate whichever the join found first.
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

      const evidenceId = linked.evidence_id
      if (!evidenceId) {
        throw new ApiError(404, 'No evidence record found for this demo')
      }

      // Through `validateEvidence` rather than a second inline `api.POST` to
      // the same path. It was the only caller-less request-issuing action left
      // in this store after P-161, for the daft reason that the one code path
      // that wanted it had copied its body instead — two literals for one
      // endpoint, of which only the copy was ever exercised.
      const result = await validateEvidence(matchId, {
        evidence_ids: [evidenceId],
        expected_participant1_score: claimed.participant1Score,
        expected_participant2_score: claimed.participant2Score,
      })

      // Both the link row and the evidence row were just written server-side;
      // re-read rather than guessing what the verdict did to them.
      await Promise.all([fetchLinkedDemos(matchId), fetchEvidence(matchId)])
      return result
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
    fetchBrowseDemos,
    linkManualDemo,
    fetchEvidence,

    // Evidence Upload & Validation
    initiateUpload,
    completeUpload,
    validateEvidence,
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
  DemoResponse,
}
