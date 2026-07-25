import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import {
  aggregateActionStates,
  createActionState,
  unwrapApi,
  unwrapApiOptional,
  withActionState,
} from '@/stores/helpers'

// Use generated types
type MatchServer = components['schemas']['MatchServerResponse']
type LiveScore = components['schemas']['LiveScoreResponse']
type Substitution = components['schemas']['SubstitutionResponse']

/**
 * Per-match server reservation state (MatchZy integration §7.2–§7.3).
 * REST-fetched on match load/poll; the veto-lobby websocket pushes
 * `server_assignment_update` / `live_score_update` between polls.
 */
export const useMatchServerStore = defineStore('matchServer', () => {
  const reservation = ref<MatchServer | null>(null)
  const substitutions = ref<Substitution[]>([])

  const fetchState = createActionState()
  const assignState = createActionState()
  const cancelState = createActionState()
  const substitutionState = createActionState()

  const { loading, error } = aggregateActionStates([
    fetchState,
    assignState,
    cancelState,
    substitutionState,
  ])

  async function fetchMatchServer(matchId: string): Promise<MatchServer | null> {
    return withActionState(
      fetchState,
      async () => {
        // 404 = no reservation — a normal state, not an error.
        const result = await unwrapApiOptional(
          api.GET('/v1/matches/{match_id}/server', {
            params: { path: { match_id: matchId } },
          }),
        )
        reservation.value = result?.data ?? null
        return reservation.value
      },
      'Failed to load server status',
    )
  }

  /** Admin: create/queue a reservation for the match. */
  async function assignServer(matchId: string): Promise<void> {
    return withActionState(
      assignState,
      async () => {
        await unwrapApi(
          api.POST('/v1/matches/{match_id}/server/assign', {
            params: { path: { match_id: matchId } },
          }),
        )
        await fetchMatchServer(matchId)
      },
      'Failed to assign a server',
    )
  }

  /** Admin: cancel the live reservation. */
  async function cancelServer(matchId: string): Promise<void> {
    return withActionState(
      cancelState,
      async () => {
        await unwrapApi(
          api.DELETE('/v1/matches/{match_id}/server', {
            params: { path: { match_id: matchId } },
          }),
        )
        await fetchMatchServer(matchId)
      },
      'Failed to cancel the reservation',
    )
  }

  /** WS `server_assignment_update`: merge status/connect into local state. */
  function applyAssignmentUpdate(update: {
    status: string
    connect?: {
      ip_address: string
      port: number
      connect_password: string
      gotv_port?: number | null
      gotv_password?: string | null
    } | null
    reason?: string | null
  }) {
    const current = reservation.value
    reservation.value = {
      status: update.status as MatchServer['status'],
      failure_reason: update.reason ?? undefined,
      server_name: current?.server_name,
      ip_address: update.connect?.ip_address ?? current?.ip_address,
      port: update.connect?.port ?? current?.port,
      connect_password: update.connect?.connect_password ?? current?.connect_password,
      gotv_port: update.connect?.gotv_port ?? current?.gotv_port,
      gotv_password: update.connect?.gotv_password ?? current?.gotv_password,
      is_participant: current?.is_participant ?? true,
      live_score: current?.live_score,
    }
  }

  /** WS `live_score_update`. */
  function applyLiveScore(score: LiveScore) {
    if (reservation.value) {
      reservation.value = { ...reservation.value, live_score: score }
    }
  }

  async function fetchSubstitutions(matchId: string): Promise<Substitution[]> {
    return withActionState(
      substitutionState,
      async () => {
        const result = await unwrapApi(
          api.GET('/v1/matches/{match_id}/substitutions', {
            params: { path: { match_id: matchId } },
          }),
        )
        substitutions.value = result.data
        return result.data
      },
      'Failed to load substitutions',
    )
  }

  /** Captain/delegate: request a substitution (§6.8). */
  async function createSubstitution(
    matchId: string,
    playerOutId: string,
    playerInId: string | null,
  ): Promise<Substitution> {
    return withActionState(
      substitutionState,
      async () => {
        const result = await unwrapApi(
          api.POST('/v1/matches/{match_id}/substitutions', {
            params: { path: { match_id: matchId } },
            body: { player_out_id: playerOutId, player_in_id: playerInId },
          }),
        )
        await fetchSubstitutions(matchId)
        return result.data
      },
      'Failed to request the substitution',
    )
  }

  async function cancelSubstitution(matchId: string, substitutionId: string): Promise<void> {
    return withActionState(
      substitutionState,
      async () => {
        await unwrapApi(
          api.DELETE('/v1/matches/{match_id}/substitutions/{substitution_id}', {
            params: { path: { match_id: matchId, substitution_id: substitutionId } },
          }),
        )
        await fetchSubstitutions(matchId)
      },
      'Failed to cancel the substitution',
    )
  }

  /** Whether the reservation still expects activity (keeps the WS open). */
  function isActive(): boolean {
    const status = reservation.value?.status
    return status === 'pending' || status === 'configuring' || status === 'ready' || status === 'live'
  }

  function clear() {
    reservation.value = null
    substitutions.value = []
  }

  return {
    reservation,
    substitutions,
    loading,
    error,
    fetchState,
    assignState,
    cancelState,
    fetchMatchServer,
    assignServer,
    cancelServer,
    fetchSubstitutions,
    createSubstitution,
    cancelSubstitution,
    substitutionState,
    applyAssignmentUpdate,
    applyLiveScore,
    isActive,
    clear,
  }
})

export type { LiveScore, MatchServer, Substitution }
