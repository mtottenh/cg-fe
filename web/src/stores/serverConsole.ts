import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import {
  aggregateActionStates,
  createActionState,
  unwrapApi,
  withActionState,
} from '@/stores/helpers'

type ConsoleSnapshot = components['schemas']['ConsoleSnapshotResponse']
type ConsoleLogEntry = components['schemas']['AdminServerCommandResponse']
type ConsolePlayer = components['schemas']['ConsolePlayer']
type MapChangeRequest = components['schemas']['MapChangeRequest']
type MapChangeResult = components['schemas']['MapChangeResponse']
type ConsoleAction = components['schemas']['ConsoleAction']
type ConsoleActionArgs = components['schemas']['ConsoleActionArgs']
type ConsoleActionResult = components['schemas']['ConsoleActionResponse']
type CommandResult = components['schemas']['SendCommandResponse']

/**
 * The admin server console (docs/server-console-design.md §6): one
 * snapshot per server, fed by the agent's heartbeat and refreshed live on
 * demand, plus the audited commands sent to it.
 */
export const useServerConsoleStore = defineStore('serverConsole', () => {
  const snapshot = ref<ConsoleSnapshot | null>(null)
  /** Audit rows, newest first, as the API returns them. */
  const history = ref<ConsoleLogEntry[]>([])

  const fetchSnapshotState = createActionState()
  const fetchHistoryState = createActionState()
  const changeMapState = createActionState()
  const runActionState = createActionState()
  const runCommandState = createActionState()

  const { loading, error } = aggregateActionStates([
    fetchSnapshotState,
    fetchHistoryState,
    changeMapState,
    runActionState,
    runCommandState,
  ])

  /**
   * The console snapshot. `live` runs `status` on the server first; the
   * agent is serial, so callers keep that for the Refresh button and the
   * moment after an action, not for polling.
   */
  async function fetchSnapshot(serverId: string, live = false): Promise<ConsoleSnapshot> {
    return withActionState(
      fetchSnapshotState,
      async () => {
        const result = await unwrapApi(
          api.GET('/v1/admin/game-servers/{server_id}/console', {
            params: { path: { server_id: serverId }, query: { live } },
          }),
        )
        snapshot.value = result.data
        return result.data
      },
      'Failed to load the server console',
    )
  }

  async function fetchHistory(serverId: string, limit = 50): Promise<ConsoleLogEntry[]> {
    return withActionState(
      fetchHistoryState,
      async () => {
        const result = await unwrapApi(
          api.GET('/v1/admin/game-servers/{server_id}/console/history', {
            params: { path: { server_id: serverId }, query: { limit } },
          }),
        )
        history.value = result.data
        return result.data
      },
      'Failed to load the console history',
    )
  }

  async function changeMap(serverId: string, body: MapChangeRequest): Promise<MapChangeResult> {
    return withActionState(
      changeMapState,
      async () => {
        const result = await unwrapApi(
          api.POST('/v1/admin/game-servers/{server_id}/console/map', {
            params: { path: { server_id: serverId } },
            body,
          }),
        )
        return result.data
      },
      'Failed to change map',
    )
  }

  async function runAction(
    serverId: string,
    action: ConsoleAction,
    args: ConsoleActionArgs = {},
    confirm = false,
  ): Promise<ConsoleActionResult> {
    return withActionState(
      runActionState,
      async () => {
        const result = await unwrapApi(
          api.POST('/v1/admin/game-servers/{server_id}/console/action', {
            params: { path: { server_id: serverId } },
            body: { action, args, confirm },
          }),
        )
        return result.data
      },
      'Action failed',
    )
  }

  async function runCommand(serverId: string, command: string): Promise<CommandResult> {
    return withActionState(
      runCommandState,
      async () => {
        const result = await unwrapApi(
          api.POST('/v1/admin/game-servers/{server_id}/command', {
            params: { path: { server_id: serverId } },
            body: { command },
          }),
        )
        return result.data
      },
      'Command failed',
    )
  }

  /** Forget the server that was open. */
  function reset() {
    snapshot.value = null
    history.value = []
  }

  return {
    snapshot,
    history,
    loading,
    error,
    fetchSnapshotState,
    fetchHistoryState,
    changeMapState,
    runActionState,
    runCommandState,
    fetchSnapshot,
    fetchHistory,
    changeMap,
    runAction,
    runCommand,
    reset,
  }
})

export type {
  CommandResult,
  ConsoleAction,
  ConsoleActionArgs,
  ConsoleActionResult,
  ConsoleLogEntry,
  ConsolePlayer,
  ConsoleSnapshot,
  MapChangeRequest,
  MapChangeResult,
}
