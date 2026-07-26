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
import { removeById, replaceById } from '@/utils/collections'

// Use generated types
type GameServer = components['schemas']['GameServerResponse']
type CreateGameServerRequest = components['schemas']['CreateGameServerRequest']
type UpdateGameServerRequest = components['schemas']['UpdateGameServerRequest']
type EnrollmentToken = components['schemas']['EnrollmentTokenResponse']
type ServerBooking = components['schemas']['ServerBookingResponse']
type CreateServerBookingRequest = components['schemas']['CreateServerBookingRequest']

/**
 * Admin game-server registry (MatchZy integration Phase 1).
 * Design: docs/matchzy-integration.md §7.1.
 */
export const useGameServersStore = defineStore('gameServers', () => {
  const servers = ref<GameServer[]>([])
  const bookings = ref<ServerBooking[]>([])

  const fetchServersState = createActionState()
  const createServerState = createActionState()
  const updateServerState = createActionState()
  const deleteServerState = createActionState()
  const enrollmentTokenState = createActionState()
  const revokeAgentState = createActionState()
  const fetchBookingsState = createActionState()
  const createBookingState = createActionState()
  const deleteBookingState = createActionState()

  const { loading, error } = aggregateActionStates([
    fetchServersState,
    createServerState,
    updateServerState,
    deleteServerState,
    enrollmentTokenState,
    revokeAgentState,
    fetchBookingsState,
    createBookingState,
    deleteBookingState,
  ])

  async function fetchServers(): Promise<GameServer[]> {
    return withActionState(
      fetchServersState,
      async () => {
        const result = await unwrapApi(api.GET('/v1/admin/game-servers'))
        servers.value = result.data
        return result.data
      },
      'Failed to load game servers',
    )
  }

  async function createServer(body: CreateGameServerRequest): Promise<GameServer> {
    return withActionState(
      createServerState,
      async () => {
        const result = await unwrapApi(api.POST('/v1/admin/game-servers', { body }))
        servers.value = [result.data, ...servers.value]
        return result.data
      },
      'Failed to register game server',
    )
  }

  async function updateServer(
    serverId: string,
    body: UpdateGameServerRequest,
  ): Promise<GameServer> {
    return withActionState(
      updateServerState,
      async () => {
        const result = await unwrapApi(
          api.PATCH('/v1/admin/game-servers/{server_id}', {
            params: { path: { server_id: serverId } },
            body,
          }),
        )
        replaceById(servers.value, result.data)
        return result.data
      },
      'Failed to update game server',
    )
  }

  async function deleteServer(serverId: string): Promise<void> {
    return withActionState(
      deleteServerState,
      async () => {
        await unwrapApi(
          api.DELETE('/v1/admin/game-servers/{server_id}', {
            params: { path: { server_id: serverId } },
          }),
        )
        removeById(servers.value, serverId)
      },
      'Failed to delete game server',
    )
  }

  /** Mint a one-time enrollment token. The raw token is returned ONCE. */
  async function mintEnrollmentToken(serverId: string): Promise<EnrollmentToken> {
    return withActionState(
      enrollmentTokenState,
      async () => {
        const result = await unwrapApi(
          api.POST('/v1/admin/game-servers/{server_id}/enrollment-token', {
            params: { path: { server_id: serverId } },
          }),
        )
        // The server now reports enrollment_open; refresh its row lazily.
        void fetchServers()
        return result.data
      },
      'Failed to mint enrollment token',
    )
  }

  async function revokeAgent(serverId: string): Promise<number> {
    return withActionState(
      revokeAgentState,
      async () => {
        const result = await unwrapApi(
          api.POST('/v1/admin/game-servers/{server_id}/revoke', {
            params: { path: { server_id: serverId } },
          }),
        )
        void fetchServers()
        return result.data.revoked_count
      },
      'Failed to revoke agent certificates',
    )
  }

  async function fetchBookings(serverId: string): Promise<ServerBooking[]> {
    return withActionState(
      fetchBookingsState,
      async () => {
        const result = await unwrapApi(
          api.GET('/v1/admin/game-servers/{server_id}/bookings', {
            params: { path: { server_id: serverId } },
          }),
        )
        bookings.value = result.data
        return result.data
      },
      'Failed to load bookings',
    )
  }

  async function createBooking(
    serverId: string,
    body: CreateServerBookingRequest,
  ): Promise<ServerBooking> {
    return withActionState(
      createBookingState,
      async () => {
        const result = await unwrapApi(
          api.POST('/v1/admin/game-servers/{server_id}/bookings', {
            params: { path: { server_id: serverId } },
            body,
          }),
        )
        bookings.value = [...bookings.value, result.data]
        return result.data
      },
      'Failed to create booking',
    )
  }

  async function deleteBooking(serverId: string, bookingId: string): Promise<void> {
    return withActionState(
      deleteBookingState,
      async () => {
        await unwrapApi(
          api.DELETE('/v1/admin/game-servers/{server_id}/bookings/{booking_id}', {
            params: { path: { server_id: serverId, booking_id: bookingId } },
          }),
        )
        removeById(bookings.value, bookingId)
      },
      'Failed to delete booking',
    )
  }

  return {
    servers,
    bookings,
    loading,
    error,
    fetchServersState,
    createServerState,
    updateServerState,
    deleteServerState,
    enrollmentTokenState,
    revokeAgentState,
    fetchBookingsState,
    createBookingState,
    deleteBookingState,
    fetchServers,
    createServer,
    updateServer,
    deleteServer,
    mintEnrollmentToken,
    revokeAgent,
    fetchBookings,
    createBooking,
    deleteBooking,
  }
})

export type { CreateGameServerRequest, GameServer, ServerBooking, UpdateGameServerRequest }
