import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState, createLatestGuard } from '@/stores/helpers'

type PugResponse = components['schemas']['PugResponse']
type PugDetailResponse = components['schemas']['PugDetailResponse']
type PugPreviewResponse = components['schemas']['PugPreviewResponse']
type PugStatsResponse = components['schemas']['PugStatsResponse']
type SpinResponse = components['schemas']['SpinResponse']
type CreatePugRequest = components['schemas']['CreatePugRequest']

export type {
  PugResponse,
  PugDetailResponse,
  PugPreviewResponse,
  PugStatsResponse,
  SpinResponse,
  CreatePugRequest,
}

/**
 * Pick-up games: ephemeral lobbies with share-link joins, standard veto or
 * "the wheel", and a stats feed kept separate from tournament profiles.
 */
export const usePugsStore = defineStore('pugs', () => {
  // State
  const detail = ref<PugDetailResponse | null>(null)
  const myPugs = ref<PugResponse[]>([])
  const openPugs = ref<PugResponse[]>([])
  const recentPugs = ref<PugResponse[]>([])
  const preview = ref<PugPreviewResponse | null>(null)
  const pugStats = ref<PugStatsResponse | null>(null)
  const lastSpin = ref<SpinResponse | null>(null)

  // Per-action states
  const createState = createActionState()
  const fetchDetailState = createActionState()
  const fetchMineState = createActionState()
  const fetchOpenState = createActionState()
  const fetchRecentState = createActionState()
  const previewState = createActionState()
  const joinState = createActionState()
  const leaveState = createActionState()
  const kickState = createActionState()
  const teamState = createActionState()
  const captainState = createActionState()
  const shuffleState = createActionState()
  const swapState = createActionState()
  const rotateCodeState = createActionState()
  const nominateState = createActionState()
  const lockState = createActionState()
  const spinState = createActionState()
  const cancelState = createActionState()
  const rematchState = createActionState()
  const statsState = createActionState()

  // Latest-wins: a slow detail fetch for a previous lobby must not clobber
  // the one the user has since navigated into.
  const beginDetailFetch = createLatestGuard()

  function clear(): void {
    detail.value = null
    preview.value = null
    lastSpin.value = null
  }

  // ==================== Create / read ====================

  async function createPug(body: CreatePugRequest): Promise<PugDetailResponse> {
    return withActionState(createState, async () => {
      const result = await unwrapApi(api.POST('/v1/pugs', { body }))
      detail.value = result.data
      return result.data
    }, 'Failed to create the PUG')
  }

  async function fetchPug(pugId: string, code?: string): Promise<PugDetailResponse> {
    return withActionState(fetchDetailState, async () => {
      const isCurrent = beginDetailFetch()
      const result = await unwrapApi(api.GET('/v1/pugs/{pug_id}', {
        params: { path: { pug_id: pugId }, query: code ? { code } : {} },
      }))
      if (isCurrent()) detail.value = result.data
      return result.data
    }, 'Failed to load the PUG lobby')
  }

  async function fetchMine(): Promise<PugResponse[]> {
    return withActionState(fetchMineState, async () => {
      const result = await unwrapApi(api.GET('/v1/pugs/mine', {}))
      myPugs.value = result.data
      return result.data
    }, 'Failed to load your PUGs')
  }

  async function fetchOpen(gameId?: string): Promise<PugResponse[]> {
    return withActionState(fetchOpenState, async () => {
      const result = await unwrapApi(api.GET('/v1/pugs/open', {
        params: { query: gameId ? { game_id: gameId } : {} },
      }))
      openPugs.value = result.data
      return result.data
    }, 'Failed to load open PUGs')
  }

  async function fetchRecent(): Promise<PugResponse[]> {
    return withActionState(fetchRecentState, async () => {
      const result = await unwrapApi(api.GET('/v1/pugs/recent', {}))
      recentPugs.value = result.data
      return result.data
    }, 'Failed to load recent PUGs')
  }

  // ==================== Share link ====================

  async function fetchPreview(code: string): Promise<PugPreviewResponse> {
    return withActionState(previewState, async () => {
      const result = await unwrapApi(api.GET('/v1/pugs/code/{code}', {
        params: { path: { code } },
      }))
      preview.value = result.data
      return result.data
    }, 'This invite link is no longer valid')
  }

  async function joinByCode(code: string): Promise<PugDetailResponse> {
    return withActionState(joinState, async () => {
      const result = await unwrapApi(api.POST('/v1/pugs/code/{code}/join', {
        params: { path: { code } },
      }))
      detail.value = result.data
      return result.data
    }, 'Failed to join the PUG')
  }

  async function rotateCode(pugId: string): Promise<string> {
    return withActionState(rotateCodeState, async () => {
      const result = await unwrapApi(api.POST('/v1/pugs/{pug_id}/code/rotate', {
        params: { path: { pug_id: pugId } },
      }))
      if (detail.value?.pug.id === pugId) {
        detail.value = {
          ...detail.value,
          pug: { ...detail.value.pug, join_code: result.data.join_code },
        }
      }
      return result.data.join_code
    }, 'Failed to rotate the invite code')
  }

  // ==================== Membership + teams ====================

  async function leavePug(pugId: string): Promise<void> {
    return withActionState(leaveState, async () => {
      await unwrapApi(api.POST('/v1/pugs/{pug_id}/leave', {
        params: { path: { pug_id: pugId } },
      }))
    }, 'Failed to leave the PUG')
  }

  async function kickPlayer(pugId: string, playerId: string): Promise<void> {
    return withActionState(kickState, async () => {
      await unwrapApi(api.POST('/v1/pugs/{pug_id}/kick', {
        params: { path: { pug_id: pugId } },
        body: { player_id: playerId },
      }))
      await fetchPug(pugId)
    }, 'Failed to kick the player')
  }

  async function setTeam(
    pugId: string,
    team: 1 | 2 | null,
    playerId?: string
  ): Promise<void> {
    return withActionState(teamState, async () => {
      await unwrapApi(api.PUT('/v1/pugs/{pug_id}/team', {
        params: { path: { pug_id: pugId } },
        body: { team, player_id: playerId ?? null },
      }))
      await fetchPug(pugId)
    }, 'Failed to change teams')
  }

  async function setCaptain(pugId: string, playerId: string, isCaptain: boolean): Promise<void> {
    return withActionState(captainState, async () => {
      await unwrapApi(api.PUT('/v1/pugs/{pug_id}/captain', {
        params: { path: { pug_id: pugId } },
        body: { player_id: playerId, is_captain: isCaptain },
      }))
      await fetchPug(pugId)
    }, 'Failed to update captain')
  }

  async function shuffleTeams(pugId: string): Promise<void> {
    return withActionState(shuffleState, async () => {
      await unwrapApi(api.POST('/v1/pugs/{pug_id}/shuffle', {
        params: { path: { pug_id: pugId } },
      }))
      await fetchPug(pugId)
    }, 'Failed to shuffle teams')
  }

  async function swapTeams(pugId: string): Promise<void> {
    return withActionState(swapState, async () => {
      await unwrapApi(api.POST('/v1/pugs/{pug_id}/swap-teams', {
        params: { path: { pug_id: pugId } },
      }))
      await fetchPug(pugId)
    }, 'Failed to swap teams')
  }

  // ==================== Wheel + lock + spin ====================

  async function nominateMap(pugId: string, mapId: string): Promise<void> {
    return withActionState(nominateState, async () => {
      await unwrapApi(api.PUT('/v1/pugs/{pug_id}/wheel-entry', {
        params: { path: { pug_id: pugId } },
        body: { map_id: mapId },
      }))
      await fetchPug(pugId)
    }, 'Failed to nominate the map')
  }

  async function lockPug(pugId: string, force = false): Promise<PugDetailResponse> {
    return withActionState(lockState, async () => {
      const result = await unwrapApi(api.POST('/v1/pugs/{pug_id}/lock', {
        params: { path: { pug_id: pugId } },
        body: { force },
      }))
      detail.value = result.data
      return result.data
    }, 'Failed to lock the lobby')
  }

  async function spinWheel(pugId: string): Promise<SpinResponse> {
    return withActionState(spinState, async () => {
      const result = await unwrapApi(api.POST('/v1/pugs/{pug_id}/spin', {
        params: { path: { pug_id: pugId } },
      }))
      lastSpin.value = result.data
      return result.data
    }, 'Failed to spin the wheel')
  }

  async function cancelPug(pugId: string): Promise<void> {
    return withActionState(cancelState, async () => {
      await unwrapApi(api.POST('/v1/pugs/{pug_id}/cancel', {
        params: { path: { pug_id: pugId } },
      }))
    }, 'Failed to cancel the PUG')
  }

  async function rematch(pugId: string): Promise<PugDetailResponse> {
    return withActionState(rematchState, async () => {
      const result = await unwrapApi(api.POST('/v1/pugs/{pug_id}/rematch', {
        params: { path: { pug_id: pugId } },
      }))
      detail.value = result.data
      return result.data
    }, 'Failed to start the rematch')
  }

  // ==================== Stats (separate PUG feed) ====================

  async function fetchPugStats(playerId: string): Promise<PugStatsResponse> {
    return withActionState(statsState, async () => {
      const result = await unwrapApi(api.GET('/v1/players/{player_id}/pug-stats', {
        params: { path: { player_id: playerId } },
      }))
      pugStats.value = result.data
      return result.data
    }, 'Failed to load PUG stats')
  }

  return {
    // state
    detail,
    myPugs,
    openPugs,
    recentPugs,
    preview,
    pugStats,
    lastSpin,
    // action states
    createState,
    fetchDetailState,
    fetchMineState,
    fetchOpenState,
    fetchRecentState,
    previewState,
    joinState,
    leaveState,
    kickState,
    teamState,
    captainState,
    shuffleState,
    swapState,
    rotateCodeState,
    nominateState,
    lockState,
    spinState,
    cancelState,
    rematchState,
    statsState,
    // actions
    clear,
    createPug,
    fetchPug,
    fetchMine,
    fetchOpen,
    fetchRecent,
    fetchPreview,
    joinByCode,
    rotateCode,
    leavePug,
    kickPlayer,
    setTeam,
    setCaptain,
    shuffleTeams,
    swapTeams,
    nominateMap,
    lockPug,
    spinWheel,
    cancelPug,
    rematch,
    fetchPugStats,
  }
})
