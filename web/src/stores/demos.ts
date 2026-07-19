import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'
import { replaceById, removeById } from '@/utils/collections'

type DemoResponse = components['schemas']['DemoResponse']
type DemoPlayerResponse = components['schemas']['DemoPlayerResponse']
type DemoMatchLinkResponse = components['schemas']['DemoMatchLinkResponse']
type DemoDownloadResponse = components['schemas']['DemoDownloadResponse']
type DemoStatusCountsResponse = components['schemas']['DemoStatusCountsResponse']
type CatalogDemoRequest = components['schemas']['CatalogDemoRequest']
type BatchCatalogDemosRequest = components['schemas']['BatchCatalogDemosRequest']
type BatchCatalogResultResponse = components['schemas']['BatchCatalogResultResponse']
type CategorizeDemoRequest = components['schemas']['CategorizeDemoRequest']
type SetDemoVisibilityRequest = components['schemas']['SetDemoVisibilityRequest']
type LinkDemoToMatchRequest = components['schemas']['LinkDemoToMatchRequest']
type SetDemoNotesRequest = components['schemas']['SetDemoNotesRequest']
type AssociateDemoRequest = components['schemas']['AssociateDemoRequest']
type MarkDemoFailedRequest = components['schemas']['MarkDemoFailedRequest']
type AutoLinkSettingResponse = components['schemas']['AutoLinkSettingResponse']

export interface DemoFilters {
  game_id?: string
  category?: string
  status?: string
  league_id?: string
  tournament_id?: string
  map_name?: string
  team_name?: string
  steam_id?: string
  match_date_from?: string
  match_date_to?: string
  include_hidden?: boolean
  limit?: number
  offset?: number
}

export const useDemosStore = defineStore('demos', () => {
  const demos = ref<DemoResponse[]>([])
  const total = ref(0)
  const currentDemo = ref<DemoResponse | null>(null)
  const players = ref<DemoPlayerResponse[]>([])
  const links = ref<DemoMatchLinkResponse[]>([])
  const statusCounts = ref<DemoStatusCountsResponse | null>(null)
  const autoLinkEnabled = ref<boolean | null>(null)

  const loading = computed(() => fetchDemosState.loading)
  const error = computed({
    get: () => fetchDemosState.error,
    set: (val: string | null) => { fetchDemosState.error = val },
  })

  // Per-action states
  const fetchDemosState = createActionState()
  const fetchDemoState = createActionState()
  const catalogSingleState = createActionState()
  const catalogBatchState = createActionState()
  const categorizeState = createActionState()
  const setVisibilityState = createActionState()
  const associateState = createActionState()
  const setNotesState = createActionState()
  const linkToMatchState = createActionState()
  const unlinkFromMatchState = createActionState()
  const deleteDemoState = createActionState()
  const fetchPlayersState = createActionState()
  const fetchLinksState = createActionState()
  const downloadDemoState = createActionState()
  const fetchStatusCountsState = createActionState()
  const submitStatsState = createActionState()
  const markFailedState = createActionState()
  const fetchAutoLinkSettingState = createActionState()
  const updateAutoLinkSettingState = createActionState()

  async function fetchDemos(filters: DemoFilters = {}) {
    return withActionState(fetchDemosState, async () => {
      const result = await unwrapApi(api.GET('/v1/demos', {
        params: {
          query: {
            game_id: filters.game_id,
            category: filters.category,
            status: filters.status,
            league_id: filters.league_id,
            tournament_id: filters.tournament_id,
            map_name: filters.map_name,
            team_name: filters.team_name,
            steam_id: filters.steam_id,
            match_date_from: filters.match_date_from,
            match_date_to: filters.match_date_to,
            include_hidden: filters.include_hidden,
            limit: filters.limit,
            offset: filters.offset,
          },
        },
      }))
      demos.value = result.data.demos
      total.value = result.data.total
    }, 'Failed to fetch demos')
  }

  async function fetchDemo(id: string): Promise<DemoResponse> {
    return withActionState(fetchDemoState, async () => {
      const result = await unwrapApi(api.GET('/v1/demos/{id}', {
        params: { path: { id } },
      }))
      currentDemo.value = result.data
      return result.data
    }, 'Failed to fetch demo')
  }

  async function fetchPlayers(id: string): Promise<DemoPlayerResponse[]> {
    return withActionState(fetchPlayersState, async () => {
      const result = await unwrapApi(api.GET('/v1/demos/{id}/players', {
        params: { path: { id } },
      }))
      players.value = result.data
      return result.data
    }, 'Failed to fetch demo players')
  }

  async function fetchLinks(id: string): Promise<DemoMatchLinkResponse[]> {
    return withActionState(fetchLinksState, async () => {
      const result = await unwrapApi(api.GET('/v1/demos/{id}/links', {
        params: { path: { id } },
      }))
      links.value = result.data
      return result.data
    }, 'Failed to fetch demo links')
  }

  async function downloadDemo(id: string): Promise<DemoDownloadResponse> {
    return withActionState(downloadDemoState, async () => {
      const result = await unwrapApi(api.GET('/v1/demos/{id}/download', {
        params: { path: { id } },
      }))
      return result.data
    }, 'Failed to get download URL')
  }

  async function catalogSingle(request: CatalogDemoRequest): Promise<DemoResponse> {
    return withActionState(catalogSingleState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/demos', {
        body: request,
      }))
      return result.data
    }, 'Failed to catalog demo')
  }

  async function catalogBatch(request: BatchCatalogDemosRequest): Promise<BatchCatalogResultResponse> {
    return withActionState(catalogBatchState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/demos/batch', {
        body: request,
      }))
      return result.data
    }, 'Failed to batch catalog demos')
  }

  async function categorize(id: string, request: CategorizeDemoRequest): Promise<DemoResponse> {
    return withActionState(categorizeState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/demos/{id}/categorize', {
        params: { path: { id } },
        body: request,
      }))
      const updated = result.data
      replaceById(demos.value, updated)
      if (currentDemo.value?.id === id) currentDemo.value = updated
      return updated
    }, 'Failed to categorize demo')
  }

  async function setVisibility(id: string, request: SetDemoVisibilityRequest): Promise<DemoResponse> {
    return withActionState(setVisibilityState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/demos/{id}/visibility', {
        params: { path: { id } },
        body: request,
      }))
      const updated = result.data
      replaceById(demos.value, updated)
      if (currentDemo.value?.id === id) currentDemo.value = updated
      return updated
    }, 'Failed to set visibility')
  }

  async function associate(id: string, request: AssociateDemoRequest): Promise<DemoResponse> {
    return withActionState(associateState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/demos/{id}/associate', {
        params: { path: { id } },
        body: request,
      }))
      const updated = result.data
      replaceById(demos.value, updated)
      if (currentDemo.value?.id === id) currentDemo.value = updated
      return updated
    }, 'Failed to associate demo')
  }

  async function setNotes(id: string, request: SetDemoNotesRequest): Promise<void> {
    return withActionState(setNotesState, async () => {
      await unwrapApi(api.PATCH('/v1/admin/demos/{id}/notes', {
        params: { path: { id } },
        body: request,
      }))
      // Update local state optimistically
      const demo = demos.value.find(d => d.id === id)
      if (demo) demo.admin_notes = request.notes
      if (currentDemo.value?.id === id) {
        currentDemo.value = { ...currentDemo.value, admin_notes: request.notes }
      }
    }, 'Failed to set notes')
  }

  async function linkToMatch(id: string, request: LinkDemoToMatchRequest): Promise<DemoMatchLinkResponse> {
    return withActionState(linkToMatchState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/demos/{id}/link', {
        params: { path: { id } },
        body: request,
      }))
      return result.data
    }, 'Failed to link demo to match')
  }

  async function unlinkFromMatch(demoId: string, matchId: string): Promise<void> {
    return withActionState(unlinkFromMatchState, async () => {
      await unwrapApi(api.DELETE('/v1/admin/demos/{demo_id}/link/{match_id}', {
        params: { path: { demo_id: demoId, match_id: matchId } },
      }))
      links.value = links.value.filter(
        (l) => !(l.demo_id === demoId && l.match_id === matchId),
      )
    }, 'Failed to unlink demo from match')
  }

  async function deleteDemo(id: string): Promise<void> {
    return withActionState(deleteDemoState, async () => {
      await unwrapApi(api.DELETE('/v1/admin/demos/{id}', {
        params: { path: { id } },
      }))
      removeById(demos.value, id)
      if (currentDemo.value?.id === id) currentDemo.value = null
    }, 'Failed to delete demo')
  }

  async function fetchStatusCounts(): Promise<DemoStatusCountsResponse> {
    return withActionState(fetchStatusCountsState, async () => {
      const result = await unwrapApi(api.GET('/v1/admin/demos/stats'))
      statusCounts.value = result.data
      return result.data
    }, 'Failed to fetch status counts')
  }

  async function submitStats(id: string, request: components['schemas']['SubmitDemoStatsRequest']): Promise<DemoResponse> {
    return withActionState(submitStatsState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/demos/{id}/stats', {
        params: { path: { id } },
        body: request,
      }))
      const updated = result.data
      replaceById(demos.value, updated)
      if (currentDemo.value?.id === id) currentDemo.value = updated
      return updated
    }, 'Failed to submit stats')
  }

  async function markFailed(id: string, request: MarkDemoFailedRequest): Promise<DemoResponse> {
    return withActionState(markFailedState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/demos/{id}/stats-failed', {
        params: { path: { id } },
        body: request,
      }))
      const updated = result.data
      replaceById(demos.value, updated)
      if (currentDemo.value?.id === id) currentDemo.value = updated
      return updated
    }, 'Failed to mark demo as failed')
  }

  async function fetchAutoLinkSetting(): Promise<AutoLinkSettingResponse> {
    return withActionState(fetchAutoLinkSettingState, async () => {
      const result = await unwrapApi(api.GET('/v1/admin/demos/auto-link'))
      autoLinkEnabled.value = result.data.enabled
      return result.data
    }, 'Failed to fetch auto-link setting')
  }

  async function updateAutoLinkSetting(enabled: boolean): Promise<AutoLinkSettingResponse> {
    return withActionState(updateAutoLinkSettingState, async () => {
      const result = await unwrapApi(api.PUT('/v1/admin/demos/auto-link', {
        body: { enabled },
      }))
      autoLinkEnabled.value = result.data.enabled
      return result.data
    }, 'Failed to update auto-link setting')
  }

  function clearCurrent() {
    currentDemo.value = null
    players.value = []
    links.value = []
  }

  return {
    demos,
    total,
    currentDemo,
    players,
    links,
    statusCounts,
    autoLinkEnabled,
    loading,
    error,
    // Per-action states
    fetchDemosState,
    fetchDemoState,
    catalogSingleState,
    catalogBatchState,
    categorizeState,
    setVisibilityState,
    associateState,
    setNotesState,
    linkToMatchState,
    unlinkFromMatchState,
    deleteDemoState,
    fetchPlayersState,
    fetchLinksState,
    downloadDemoState,
    fetchStatusCountsState,
    submitStatsState,
    markFailedState,
    fetchAutoLinkSettingState,
    updateAutoLinkSettingState,
    // Actions
    fetchDemos,
    fetchDemo,
    fetchPlayers,
    fetchLinks,
    downloadDemo,
    catalogSingle,
    catalogBatch,
    categorize,
    setVisibility,
    associate,
    setNotes,
    linkToMatch,
    unlinkFromMatch,
    deleteDemo,
    fetchStatusCounts,
    submitStats,
    markFailed,
    fetchAutoLinkSetting,
    updateAutoLinkSetting,
    clearCurrent,
  }
})

export type {
  DemoResponse,
  DemoPlayerResponse,
  DemoMatchLinkResponse,
  DemoDownloadResponse,
  DemoStatusCountsResponse,
  CatalogDemoRequest,
  BatchCatalogDemosRequest,
  BatchCatalogResultResponse,
  CategorizeDemoRequest,
  SetDemoVisibilityRequest,
  LinkDemoToMatchRequest,
  SetDemoNotesRequest,
  AssociateDemoRequest,
  MarkDemoFailedRequest,
  AutoLinkSettingResponse,
}
