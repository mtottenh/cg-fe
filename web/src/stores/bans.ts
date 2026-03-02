import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'

// Export types from generated API
export type BanResponse = components['schemas']['BanResponse']
export type BanListResponse = components['schemas']['BanListResponse']
export type CreateBanRequest = components['schemas']['CreateBanRequest']
export type LiftBanRequest = components['schemas']['LiftBanRequest']
export type PaginationMeta = components['schemas']['PaginationMetaResponse']

// Ban type enum
export type BanType = 'platform' | 'matchmaking' | 'chat' | 'league' | 'tournament'

export interface BanFilters {
  user_id?: string
  ban_type?: BanType
  scope_type?: string
  scope_id?: string
  active_only?: boolean
  page?: number
  per_page?: number
}

export const useBansStore = defineStore('bans', () => {
  const bans = ref<BanResponse[]>([])
  const pagination = ref<PaginationMeta>({
    page: 1,
    per_page: 20,
    total_items: 0,
    total_pages: 0,
  })
  const loading = ref(false)
  const error = ref<string | null>(null)
  const currentBan = ref<BanResponse | null>(null)

  const fetchBansState = createActionState()
  const getBanState = createActionState()
  const createBanState = createActionState()
  const liftBanState = createActionState()
  const getUserBanHistoryState = createActionState()

  async function fetchBans(filters: BanFilters = {}) {
    return withActionState(fetchBansState, async () => {
      const result = await unwrapApi(api.GET('/v1/admin/bans', {
        params: {
          query: {
            user_id: filters.user_id,
            ban_type: filters.ban_type,
            scope_type: filters.scope_type,
            scope_id: filters.scope_id,
            active_only: filters.active_only,
            page: filters.page,
            per_page: filters.per_page,
          },
        },
      }))
      bans.value = result.data.items
      pagination.value = result.data.pagination
    }, 'Failed to load bans')
  }

  async function getBan(banId: string): Promise<BanResponse> {
    return withActionState(getBanState, async () => {
      const result = await unwrapApi(api.GET('/v1/admin/bans/{id}', {
        params: {
          path: { id: banId },
        },
      }))
      currentBan.value = result.data
      return result.data
    }, 'Failed to get ban')
  }

  async function createBan(request: CreateBanRequest): Promise<BanResponse> {
    return withActionState(createBanState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/bans', {
        body: request,
      }))
      return result.data
    }, 'Failed to create ban')
  }

  async function liftBan(banId: string, reason?: string): Promise<BanResponse> {
    return withActionState(liftBanState, async () => {
      const result = await unwrapApi(api.POST('/v1/admin/bans/{id}/lift', {
        params: {
          path: { id: banId },
        },
        body: { reason: reason ?? null },
      }))
      return result.data
    }, 'Failed to lift ban')
  }

  async function getUserBanHistory(userId: string): Promise<BanResponse[]> {
    return withActionState(getUserBanHistoryState, async () => {
      const result = await unwrapApi(api.GET('/v1/admin/users/{user_id}/bans', {
        params: {
          path: { user_id: userId },
        },
      }))
      return result.data
    }, 'Failed to get user ban history')
  }

  function clearError() {
    error.value = null
  }

  return {
    bans,
    pagination,
    loading,
    error,
    currentBan,
    fetchBansState,
    getBanState,
    createBanState,
    liftBanState,
    getUserBanHistoryState,
    fetchBans,
    getBan,
    createBan,
    liftBan,
    getUserBanHistory,
    clearError,
  }
})
