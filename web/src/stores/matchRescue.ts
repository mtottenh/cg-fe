import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'
import { ApiError } from '@/api/client'
import type { components } from '@/api/types'
import { createActionState, createLatestGuard, unwrapApi, withActionState } from '@/stores/helpers'

type MatchDiagnostics = components['schemas']['MatchDiagnosticsResponse']
type MatchDiagnosticsProblem = components['schemas']['DiagnosticsProblem']
type RosterCheck = components['schemas']['RosterCheckResponse']
type RosterCheckTeam = components['schemas']['RosterCheckTeam']
type ClearServerResult = components['schemas']['ServerClearResponse']
type CompletionRetryResult = components['schemas']['CompletionRetryResponse']
type TournamentMatchResponse = components['schemas']['TournamentMatchResponse']
type MatchServer = components['schemas']['MatchServerResponse']

/**
 * Admin rescue tools for one match: why it is stuck, and the actions that get
 * it moving again. Everything here is admin-only on the backend.
 *
 * State belongs to the match on screen in the admin match modal; `clear()`
 * when the modal switches match.
 */
export const useMatchRescueStore = defineStore('matchRescue', () => {
  const diagnostics = ref<MatchDiagnostics | null>(null)
  const rosterCheck = ref<RosterCheck | null>(null)
  /** Result of the last "clear match from server", shown until the next one. */
  const clearResult = ref<ClearServerResult | null>(null)

  /**
   * The game-server endpoints need `admin.servers.manage`, a different
   * permission from the tournament one the rest of the tab uses. The client
   * holds no copy of the caller's permissions, so this is learned from the
   * first 403 one of those endpoints answers with.
   */
  const serverAccessDenied = ref(false)

  /** Run a game-server call, remembering a 403 as "no access to the server tools". */
  async function serverCall<T>(call: () => Promise<T>): Promise<T> {
    try {
      const result = await call()
      serverAccessDenied.value = false
      return result
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) serverAccessDenied.value = true
      throw e
    }
  }

  const diagnosticsState = createActionState()
  const resetState = createActionState()
  const checkInWindowState = createActionState()
  const vetoResetState = createActionState()
  const retryCompletionState = createActionState()
  const rosterCheckState = createActionState()
  const clearServerState = createActionState()
  const reloadServerState = createActionState()

  const beginDiagnosticsFetch = createLatestGuard()

  async function fetchDiagnostics(tournamentId: string, matchId: string): Promise<MatchDiagnostics> {
    return withActionState(diagnosticsState, async () => {
      const isCurrent = beginDiagnosticsFetch()
      const result = await unwrapApi(
        api.GET('/v1/admin/tournaments/{tournament_id}/matches/{match_id}/diagnostics', {
          params: { path: { tournament_id: tournamentId, match_id: matchId } },
        }),
      )
      if (isCurrent()) diagnostics.value = result.data
      return result.data
    }, 'Failed to load match diagnostics')
  }

  /** Back to `ready`: clears time, check-ins, veto, result/forfeit and the server. */
  async function resetMatch(
    tournamentId: string,
    matchId: string,
    reason: string,
  ): Promise<TournamentMatchResponse> {
    return withActionState(resetState, async () => {
      const result = await unwrapApi(
        api.POST('/v1/admin/tournaments/{tournament_id}/matches/{match_id}/reset', {
          params: { path: { tournament_id: tournamentId, match_id: matchId } },
          body: { reason },
        }),
      )
      return result.data
    }, 'Failed to reset the match')
  }

  /** Open the check-in window now, or move the deadline of an open one. */
  async function setCheckInWindow(
    tournamentId: string,
    matchId: string,
    deadline: string,
    reason: string,
  ): Promise<TournamentMatchResponse> {
    return withActionState(checkInWindowState, async () => {
      const result = await unwrapApi(
        api.POST('/v1/admin/tournaments/{tournament_id}/matches/{match_id}/check-in-window', {
          params: { path: { tournament_id: tournamentId, match_id: matchId } },
          body: { deadline, reason },
        }),
      )
      return result.data
    }, 'Failed to set the check-in window')
  }

  /** Discard the veto and start a fresh one. */
  async function resetVeto(
    tournamentId: string,
    matchId: string,
    reason: string,
  ): Promise<TournamentMatchResponse> {
    return withActionState(vetoResetState, async () => {
      const result = await unwrapApi(
        api.POST('/v1/admin/tournaments/{tournament_id}/matches/{match_id}/veto/reset', {
          params: { path: { tournament_id: tournamentId, match_id: matchId } },
          body: { reason },
        }),
      )
      return result.data
    }, 'Failed to restart the veto')
  }

  /** Re-run standings and stage settlement for a decided match. */
  async function retryCompletion(
    tournamentId: string,
    matchId: string,
    reason: string,
  ): Promise<CompletionRetryResult> {
    return withActionState(retryCompletionState, async () => {
      const result = await unwrapApi(
        api.POST('/v1/admin/tournaments/{tournament_id}/matches/{match_id}/completion/retry', {
          params: { path: { tournament_id: tournamentId, match_id: matchId } },
          body: { reason },
        }),
      )
      return result.data
    }, 'Failed to re-run match completion')
  }

  async function fetchRosterCheck(matchId: string): Promise<RosterCheck> {
    return withActionState(rosterCheckState, () => serverCall(async () => {
      const result = await unwrapApi(
        api.GET('/v1/matches/{match_id}/server/roster-check', {
          params: { path: { match_id: matchId } },
        }),
      )
      rosterCheck.value = result.data
      return result.data
    }), 'Failed to check the rosters')
  }

  /**
   * Unload the match from the game server so anyone can connect.
   *
   * `server_cleared` is only true when the server acknowledged the command;
   * otherwise `detail` says why. A backend older than the rescue endpoints
   * answers 204 with no body: the reservation was released, but nothing says
   * whether the server was cleared, so that is reported as "not confirmed".
   */
  async function clearServer(matchId: string): Promise<ClearServerResult> {
    return withActionState(clearServerState, () => serverCall(async () => {
      const result = await unwrapApi(
        api.DELETE('/v1/matches/{match_id}/server', {
          params: { path: { match_id: matchId } },
        }),
      )
      clearResult.value = result?.data ?? {
        released_reservation: true,
        server_cleared: false,
        detail: 'The server did not say whether the match config was unloaded.',
      }
      return clearResult.value
    }), 'Failed to clear the match from the server')
  }

  /** Rebuild the config from the current rosters and load it again. */
  async function reloadServer(matchId: string, reason: string): Promise<MatchServer> {
    return withActionState(reloadServerState, () => serverCall(async () => {
      const result = await unwrapApi(
        api.POST('/v1/matches/{match_id}/server/reload', {
          params: { path: { match_id: matchId } },
          body: { reason },
        }),
      )
      return result.data
    }), 'Failed to reload the match on the server')
  }

  function clear() {
    // Invalidate any in-flight diagnostics fetch for the previous match.
    beginDiagnosticsFetch()
    diagnostics.value = null
    rosterCheck.value = null
    clearResult.value = null
    serverAccessDenied.value = false
  }

  return {
    diagnostics,
    rosterCheck,
    clearResult,
    serverAccessDenied,
    diagnosticsState,
    resetState,
    checkInWindowState,
    vetoResetState,
    retryCompletionState,
    rosterCheckState,
    clearServerState,
    reloadServerState,
    fetchDiagnostics,
    resetMatch,
    setCheckInWindow,
    resetVeto,
    retryCompletion,
    fetchRosterCheck,
    clearServer,
    reloadServer,
    clear,
  }
})

export type {
  ClearServerResult,
  CompletionRetryResult,
  MatchDiagnostics,
  MatchDiagnosticsProblem,
  RosterCheck,
  RosterCheckTeam,
}
