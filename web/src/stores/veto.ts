import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'

type VetoSessionResponse = components['schemas']['VetoSessionResponse']
type VetoSessionStateResponse = components['schemas']['DataResponse_VetoSessionStateResponse']['data']
type VetoActionResponse = components['schemas']['VetoActionResponse']
type VetoFormatResponse = components['schemas']['VetoFormatResponse']
type VetoFormatActionResponse = components['schemas']['VetoFormatActionResponse']
type MapStatusResponse = components['schemas']['MapStatusResponse']
type VetoDelegateResponse = components['schemas']['VetoDelegateResponse']
type CreateVetoSessionRequest = components['schemas']['CreateVetoSessionRequest']
type RecordCoinFlipRequest = components['schemas']['RecordCoinFlipRequest']
type PerformVetoActionRequest = components['schemas']['PerformVetoActionRequest']
type SelectSideRequest = components['schemas']['SelectSideRequest']

export const useVetoStore = defineStore('veto', () => {
  // State
  const session = ref<VetoSessionResponse | null>(null)
  const sessionState = ref<VetoSessionStateResponse | null>(null)
  const delegates = ref<VetoDelegateResponse[]>([])

  // Per-action states
  const getSessionState = createActionState()
  const createSessionState = createActionState()
  const startSessionState = createActionState()
  const coinFlipState = createActionState()
  const vetoActionState = createActionState()
  const sideSelectState = createActionState()
  const fetchDelegatesState = createActionState()
  const createDelegateState = createActionState()
  const revokeDelegateState = createActionState()

  // ==================== Veto Session ====================

  async function getVetoSession(matchId: string): Promise<VetoSessionStateResponse> {
    return withActionState(getSessionState, async () => {
      const result = await unwrapApi(api.GET('/v1/matches/{match_id}/veto', {
        params: { path: { match_id: matchId } },
      }))
      sessionState.value = result.data
      session.value = result.data.session
      return sessionState.value
    }, 'Failed to fetch veto session')
  }

  async function createVetoSession(
    matchId: string,
    request: CreateVetoSessionRequest
  ): Promise<VetoSessionResponse> {
    return withActionState(createSessionState, async () => {
      const result = await unwrapApi(api.POST('/v1/matches/{match_id}/veto', {
        params: { path: { match_id: matchId } },
        body: request,
      }))
      session.value = result.data
      return session.value
    }, 'Failed to create veto session')
  }

  async function startVetoSession(matchId: string): Promise<VetoSessionResponse> {
    return withActionState(startSessionState, async () => {
      const result = await unwrapApi(api.POST('/v1/matches/{match_id}/veto/start', {
        params: { path: { match_id: matchId } },
      }))
      session.value = result.data
      return session.value
    }, 'Failed to start veto session')
  }

  async function recordCoinFlip(
    matchId: string,
    request: RecordCoinFlipRequest
  ): Promise<VetoSessionResponse> {
    return withActionState(coinFlipState, async () => {
      const result = await unwrapApi(api.POST('/v1/matches/{match_id}/veto/coin-flip', {
        params: { path: { match_id: matchId } },
        body: request,
      }))
      session.value = result.data
      return session.value
    }, 'Failed to record coin flip')
  }

  async function performVetoAction(
    matchId: string,
    request: PerformVetoActionRequest
  ) {
    return withActionState(vetoActionState, async () => {
      const result = await unwrapApi(api.POST('/v1/matches/{match_id}/veto/action', {
        params: { path: { match_id: matchId } },
        body: request,
      }))
      // Result includes updated session and the action performed
      session.value = result.data.session
      return result.data
    }, 'Failed to perform veto action')
  }

  async function selectSide(
    matchId: string,
    request: SelectSideRequest
  ): Promise<VetoActionResponse> {
    return withActionState(sideSelectState, async () => {
      const result = await unwrapApi(api.POST('/v1/matches/{match_id}/veto/side', {
        params: { path: { match_id: matchId } },
        body: request,
      }))
      return result.data
    }, 'Failed to select side')
  }

  // ==================== Veto Delegates ====================

  async function fetchDelegates(
    leagueId: string,
    teamId: string,
    seasonId: string
  ): Promise<VetoDelegateResponse[]> {
    return withActionState(fetchDelegatesState, async () => {
      const result = await unwrapApi(api.GET(
        '/v1/leagues/{league_id}/teams/{team_id}/seasons/{season_id}/veto-delegates',
        { params: { path: { league_id: leagueId, team_id: teamId, season_id: seasonId } } }
      ))
      delegates.value = result.data.delegates
      return delegates.value
    }, 'Failed to fetch veto delegates')
  }

  async function createDelegate(
    leagueId: string,
    teamId: string,
    seasonId: string,
    request: components['schemas']['CreateVetoDelegateRequest']
  ): Promise<VetoDelegateResponse> {
    return withActionState(createDelegateState, async () => {
      const result = await unwrapApi(api.POST(
        '/v1/leagues/{league_id}/teams/{team_id}/seasons/{season_id}/veto-delegates',
        {
          params: { path: { league_id: leagueId, team_id: teamId, season_id: seasonId } },
          body: request,
        }
      ))
      delegates.value.push(result.data)
      return result.data
    }, 'Failed to create veto delegate')
  }

  async function revokeDelegate(
    leagueId: string,
    teamId: string,
    seasonId: string,
    delegateId: string
  ): Promise<void> {
    return withActionState(revokeDelegateState, async () => {
      await unwrapApi(api.DELETE(
        '/v1/leagues/{league_id}/teams/{team_id}/seasons/{season_id}/veto-delegates/{delegate_id}',
        { params: { path: { league_id: leagueId, team_id: teamId, season_id: seasonId, delegate_id: delegateId } } }
      ))
      const idx = delegates.value.findIndex(d => d.id === delegateId)
      if (idx !== -1) delegates.value.splice(idx, 1)
    }, 'Failed to revoke veto delegate')
  }

  // ==================== Direct WS Updates ====================

  /** Apply a session update from a WS message (no REST call). */
  function applySessionUpdate(newSession: VetoSessionResponse) {
    session.value = newSession
    if (sessionState.value) {
      sessionState.value.session = newSession
    }
  }

  /** Apply a veto action performed from a WS message. Updates session, maps + appends action. */
  function applyActionPerformed(newSession: VetoSessionResponse, action: VetoActionResponse) {
    session.value = newSession
    if (sessionState.value) {
      sessionState.value = {
        ...sessionState.value,
        session: newSession,
        // Replace map entry to trigger reactivity (instead of mutating in-place)
        maps: sessionState.value.maps.map(m => {
          if (m.map_id !== action.map_id) return m
          if (action.action_type === 'ban') {
            return { ...m, status: 'banned', banned_by_registration_id: action.performed_by_registration_id }
          } else if (action.action_type === 'pick') {
            return { ...m, status: 'picked', picked_by_registration_id: action.performed_by_registration_id }
          } else if (action.action_type === 'decider') {
            return { ...m, status: 'decider' }
          }
          return m
        }),
        // Advance current_action to the next expected action from the format
        // sequence. current_action_number is 1-based (the backend indexes it
        // as current_action_number - 1 everywhere, e.g. veto.rs:311), so the
        // 0-based sequence index is current_action_number - 1. Without the -1
        // the live path points one step ahead, mislabeling the final action's
        // phase and disabling the map grid until a reload.
        current_action: sessionState.value.format?.sequence?.[newSession.current_action_number - 1] ?? null,
        // Append action if not already present (dedupe by action_number)
        actions: sessionState.value.actions?.some(a => a.action_number === action.action_number)
          ? sessionState.value.actions
          : [...(sessionState.value.actions ?? []), action],
      }
    }
  }

  /** Mark veto as complete from a WS message. */
  function applyVetoComplete(newSession: VetoSessionResponse) {
    session.value = newSession
    if (sessionState.value) {
      sessionState.value.session = newSession
    }
  }

  // ==================== Utility ====================

  function clear() {
    session.value = null
    sessionState.value = null
    delegates.value = []
  }

  function $reset() {
    clear()
  }

  return {
    // State
    session,
    sessionState,
    delegates,

    // Per-action states
    getSessionState,
    createSessionState,
    startSessionState,
    coinFlipState,
    vetoActionState,
    sideSelectState,
    fetchDelegatesState,
    createDelegateState,
    revokeDelegateState,

    // Veto Session
    getVetoSession,
    createVetoSession,
    startVetoSession,
    recordCoinFlip,
    performVetoAction,
    selectSide,

    // Direct WS updates
    applySessionUpdate,
    applyActionPerformed,
    applyVetoComplete,

    // Delegates
    fetchDelegates,
    createDelegate,
    revokeDelegate,

    // Utility
    clear,
    $reset,
  }
})

export type {
  VetoSessionResponse,
  VetoSessionStateResponse,
  VetoActionResponse,
  VetoFormatResponse,
  VetoFormatActionResponse,
  MapStatusResponse,
  VetoDelegateResponse,
}
